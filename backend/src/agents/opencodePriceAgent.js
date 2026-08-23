#!/usr/bin/env node
/**
 * Free LLM price agent — reads prices off web pages via OpenCode.
 *
 * Same idea as the Anthropic agent, with no API key and no cost: it shells out
 * to the locally installed `opencode` CLI running one of the OpenCode Zen free
 * models, which uses its built-in WebFetch tool to open a page and read the
 * price off it. No price API is involved anywhere.
 *
 *   node src/agents/opencodePriceAgent.js --once           # one lookup, then exit
 *   node src/agents/opencodePriceAgent.js                  # every 5 minutes
 *   node src/agents/opencodePriceAgent.js --interval 60    # faster (still free)
 *   node src/agents/opencodePriceAgent.js --model opencode/mimo-v2.5-free
 *
 * The tradeoff vs. the Anthropic version is reliability, not capability: small
 * free models wander off-format, so everything below is built around not
 * trusting the output — strict extraction, sanity bounds, per-symbol retries
 * across models, and the previous good value kept whenever a run looks wrong.
 *
 * Writes the 'llm' snapshot in MongoDB — its own document, never the
 * 'standard' one the scheduled job owns.
 */

import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import mongoose from 'mongoose'
import { formatCET } from '../jobs/marketHours.js'
import { saveSnapshot, loadSnapshot, LLM } from '../jobs/snapshotStore.js'


const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, '..', '..', 'data')
const MONGO_URL =
  process.env.MONGODB_URI
  || process.env.COSMOS_DB_CONNECTION_STRING // legacy name, kept so existing .env files keep working
  || 'mongodb://127.0.0.1:27017/portfolio-tracker'

/**
 * Free models, tried in order. If one is unavailable or returns garbage for a
 * symbol, the next is tried before that symbol is given up on.
 * Full list: `opencode models | grep free`
 */
const FREE_MODELS = [
  'opencode/deepseek-v4-flash-free',
  'opencode/mimo-v2.5-free',
  'opencode/ling-3.0-flash-free',
  'opencode/nemotron-3-ultra-free',
]

/** Which page to read for each asset. Point these anywhere you prefer. */
const SOURCES = {
  BTC: { name: 'Bitcoin', url: 'https://www.coingecko.com/en/coins/bitcoin' },
  ETH: { name: 'Ethereum', url: 'https://www.coingecko.com/en/coins/ethereum' },
}

/**
 * Rough plausibility bounds per symbol. A free model misreading a page can
 * return a market cap, a 24h volume, or a price in the wrong currency — all of
 * which are numbers, so only a range check catches them.
 */
const SANITY_BOUNDS = {
  BTC: [1_000, 1_000_000],
  ETH: [50, 100_000],
}

/**
 * Generous, because `opencode run` is dramatically slower without a terminal.
 * Measured on this machine with a trivial prompt: ~2s when stdin is a TTY,
 * ~42s when it is not. A prompt that fetches a web page is much heavier again,
 * so a headless run (launchd, cron, CI) needs minutes, not seconds.
 * Override with --timeout <seconds>.
 */
const DEFAULT_TIMEOUT_SEC = 600

// ── CLI options ─────────────────────────────────────────────────────
const args = process.argv.slice(2)
const runOnce = args.includes('--once')

function argValue(flag) {
  const i = args.indexOf(flag)
  return i !== -1 && args[i + 1] ? args[i + 1] : null
}

/** Target seconds per refresh cycle. 8s matches a good parallel run end-to-end. */
const INTERVAL_SEC = Number(argValue('--interval') ?? process.env.OPENCODE_PRICE_INTERVAL_SEC ?? 8)
const CLI_TIMEOUT_MS = Number(argValue('--timeout') ?? DEFAULT_TIMEOUT_SEC) * 1000
const PREFERRED_MODEL = argValue('--model') ?? process.env.OPENCODE_PRICE_MODEL ?? null
const MODELS = PREFERRED_MODEL
  ? [PREFERRED_MODEL, ...FREE_MODELS.filter(m => m !== PREFERRED_MODEL)]
  : FREE_MODELS

const log = (...a) => console.log(`[${formatCET()}]`, ...a)

function prompt(symbol, { name, url }) {
  return `Fetch ${url} and read the current ${name} (${symbol}) price in US dollars from that page.

Output ONLY this JSON object and nothing else — no markdown fences, no explanation:
{"symbol":"${symbol}","priceUsd":<number>,"change24hPercent":<number or null>,"sourceUrl":"${url}"}

Rules:
- priceUsd must be the current spot price in USD, as a plain number with no commas or currency symbol.
- Do not confuse the price with market cap, trading volume, or a price in another currency.
- If you cannot read the price from the page, output {"error":"<short reason>"} instead. Never guess a number.`
}

/** OpenCode writes ANSI colour codes even when piped. */
function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\[[0-9;]*[a-zA-Z]/g, '')
}

/**
 * Pull the last balanced JSON object out of the model's chatter. Small models
 * narrate before answering ("The page shows BTC at $69,336. Outputting…"), and
 * often wrap the result in code fences — so scanning for the last complete
 * brace-balanced span is far more reliable than parsing the whole output.
 */
function extractJson(raw) {
  const text = stripAnsi(raw)
  let candidate = null

  for (let start = text.length - 1; start >= 0; start--) {
    if (text[start] !== '{') continue
    let depth = 0
    let inString = false
    let escaped = false

    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === '"') { inString = !inString; continue }
      if (inString) continue
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          candidate = text.slice(start, i + 1)
          break
        }
      }
    }
    if (candidate) {
      try {
        return JSON.parse(candidate)
      } catch {
        candidate = null // not valid JSON — keep scanning backwards
      }
    }
  }
  return null
}

/** Reject anything that isn't a usable price before it can reach the file. */
function validate(symbol, parsed) {
  if (!parsed) return { ok: false, reason: 'no JSON object in output' }
  if (parsed.error) return { ok: false, reason: `model reported: ${parsed.error}` }

  const price = typeof parsed.priceUsd === 'string'
    ? Number(parsed.priceUsd.replace(/[$,\s]/g, ''))
    : parsed.priceUsd

  if (typeof price !== 'number' || !Number.isFinite(price)) {
    return { ok: false, reason: `priceUsd not a number (${JSON.stringify(parsed.priceUsd)})` }
  }

  const [min, max] = SANITY_BOUNDS[symbol] ?? [0, Infinity]
  if (price < min || price > max) {
    return { ok: false, reason: `price ${price} outside plausible range ${min}–${max}` }
  }

  let change = parsed.change24hPercent
  if (typeof change === 'string') change = Number(change.replace(/[%\s+]/g, ''))
  if (typeof change !== 'number' || !Number.isFinite(change) || Math.abs(change) > 100) {
    change = null // a bad change figure shouldn't discard a good price
  }

  return { ok: true, price, change }
}

/**
 * One `opencode run` invocation.
 *
 * Uses spawn directly rather than execFile: opencode stalls when handed an
 * inherited pipe or socket on stdin (it probes the descriptor with tcgetattr),
 * so stdin must be /dev/null. We also resolve on process exit rather than
 * waiting for every stdio stream to close, so a lingering child watcher can't
 * hold the call open after the answer has already arrived.
 */
function askModel(model, text) {
  return new Promise((resolve, reject) => {
    const child = spawn('opencode', ['run', '-m', model, text], {
      cwd: DATA_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(Object.assign(new Error(`timed out after ${CLI_TIMEOUT_MS / 1000}s`), { killed: true }))
    }, CLI_TIMEOUT_MS)

    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })

    child.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) resolve(stdout)
      else reject(new Error(`opencode exited ${code}: ${stderr.trim().split('\n')[0] || 'no stderr'}`))
    })
  })
}

/** Look up one symbol, falling through the model list until one produces a usable answer. */
async function lookupSymbol(symbol) {
  const source = SOURCES[symbol]
  const attempts = []

  for (const model of MODELS) {
    try {
      const stdout = await askModel(model, prompt(symbol, source))
      const parsed = extractJson(stdout)
      const result = validate(symbol, parsed)

      if (result.ok) {
        return {
          ok: true,
          quote: {
            symbol,
            name: source.name,
            type: 'crypto',
            price: result.price,
            change24h: result.change,
            asOf: new Date().toISOString(),
            asOfCET: formatCET(),
            sourceUrl: source.url,
            source: 'opencode-webfetch',
            model,
          },
          attempts,
        }
      }
      attempts.push(`${model}: ${result.reason}`)
    } catch (err) {
      const why = err.killed ? `timed out after ${CLI_TIMEOUT_MS / 1000}s` : err.message.split('\n')[0]
      attempts.push(`${model}: ${why}`)
    }
  }

  return { ok: false, attempts }
}

let runCount = 0
let errorCount = 0
let consecutiveErrors = 0
let timer = null

async function tick() {
  runCount++
  const previous = await loadSnapshot(LLM)
  const prices = {}
  const failures = []

  // Symbols are independent, so look them up concurrently — this is what keeps
  // a cycle near the cost of a single lookup instead of the sum of them.
  const symbols = Object.keys(SOURCES)
  const results = await Promise.all(symbols.map(s => lookupSymbol(s)))

  symbols.forEach((symbol, i) => {
    const result = results[i]
    if (result.ok) {
      prices[symbol] = result.quote
    } else {
      failures.push(`${symbol} — ${result.attempts.join('; ')}`)
      // Carry the last good value forward rather than dropping the symbol.
      if (previous?.prices?.[symbol]) {
        prices[symbol] = { ...previous.prices[symbol], stale: true }
      }
    }
  })

  const fresh = Object.values(prices).filter(p => !p.stale)
  if (fresh.length === 0) {
    errorCount++
    consecutiveErrors++
    log(`Run ${runCount}: no usable prices — leaving file untouched.`)
    for (const f of failures) log(`  ${f}`)
    return
  }
  consecutiveErrors = 0
  if (failures.length > 0) errorCount++

  const now = new Date().toISOString()
  await saveSnapshot(LLM, {
    updatedAt: now,
    updatedAtCET: formatCET(now),
    baseCurrency: 'USD',
    method: 'opencode-webfetch',
    costUsd: 0, // free models — this is the whole point
    intervalSeconds: INTERVAL_SEC,
    run: runCount,
    errors: errorCount,
    failures: failures.length > 0 ? failures : null,
    prices,
  })

  const summary = Object.values(prices)
    .map(p => `${p.symbol} $${p.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}${p.stale ? ' (stale)' : ''}`)
    .join('  ')
  log(`Run ${runCount}: ${summary}`)
  for (const f of failures) log(`  ${f}`)
}

/**
 * INTERVAL_SEC is a target *cycle time*, not a sleep: we subtract however long
 * the lookups took, so a run that takes 6s waits 2s rather than 8. Still
 * chained rather than setInterval, so a slow cycle delays the next one instead
 * of stacking processes on top of it — a floor of 1s keeps that from becoming
 * a hot loop when the free tier is slow.
 */
async function loop() {
  const startedAt = Date.now()
  await tick()
  // A single run has to close the database connection itself. Returning here
  // empties the call stack but not the event loop: the open mongoose socket
  // keeps the process alive indefinitely, which matters now that the API
  // spawns this on demand and would otherwise leak a process per refresh.
  if (runOnce) {
    await mongoose.disconnect()
    return
  }

  if (consecutiveErrors >= 5) {
    log(`Stopping after ${consecutiveErrors} consecutive failed runs — check \`opencode models\`.`)
    process.exit(1)
  }

  const elapsed = Date.now() - startedAt
  const wait = Math.max(1000, INTERVAL_SEC * 1000 - elapsed)
  timer = setTimeout(loop, wait)
}

function shutdown(signal) {
  log(`${signal} — stopping after ${runCount} run(s), ${errorCount} with errors.`)
  if (timer) clearTimeout(timer)
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

log(
  runOnce
    ? `OpenCode price agent: single lookup of ${Object.keys(SOURCES).join(', ')} via ${MODELS[0]}`
    : `OpenCode price agent: ${Object.keys(SOURCES).join(', ')} every ${INTERVAL_SEC}s → snapshot:llm (free, Ctrl-C to stop)`,
)

// One connection for the process, opened before the first tick.
try {
  await mongoose.connect(MONGO_URL, { serverSelectionTimeoutMS: 8000 })
} catch (err) {
  log(`Cannot reach the database (${err.message}) — nothing could be stored. Aborting.`)
  process.exit(1)
}

loop().catch((err) => {
  log('Fatal:', err.message)
  process.exit(1)
})
