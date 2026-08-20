#!/usr/bin/env node
/**
 * LLM price agent — Claude looks up BTC and ETH on the open web.
 *
 * This is the genuinely agentic path: no price API is called anywhere. Claude
 * runs Anthropic's server-side web_search tool, reads what it finds, and
 * reports the prices back through a structured-output schema so the result is
 * machine-readable JSON rather than prose we'd have to regex.
 *
 * Because a model — not a parser — reads the page, this survives a source
 * changing its markup. It costs tokens on every run, so the default cadence is
 * deliberately slow. See the cost note under INTERVAL below.
 *
 *   node src/agents/llmPriceAgent.js --once            # single lookup, then exit
 *   node src/agents/llmPriceAgent.js                   # every 15 min
 *   node src/agents/llmPriceAgent.js --interval 300    # every 5 min (costs more)
 *   node src/agents/llmPriceAgent.js --sources "coinmarketcap.com,coindesk.com"
 *
 * Requires ANTHROPIC_API_KEY in backend/.env or the environment.
 * Writes data/llm-prices.json — its own file, never prices.json.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { formatCET } from '../jobs/marketHours.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, '..', '..', 'data')
const OUTPUT_FILE = resolve(DATA_DIR, 'llm-prices.json')

// Load .env (same minimal parser the rest of the backend uses).
try {
  const envContent = readFileSync(resolve(__dirname, '..', '..', '.env'), 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim()
  }
} catch { /* env may come from the shell instead */ }

const MODEL = 'claude-opus-5'
/** Published rates for the model above, used only for the per-run cost estimate. */
const USD_PER_MTOK_INPUT = 5
const USD_PER_MTOK_OUTPUT = 25

const TRACKED = ['BTC', 'ETH']

// ── CLI options ─────────────────────────────────────────────────────
const args = process.argv.slice(2)
const runOnce = args.includes('--once')

function argValue(flag) {
  const i = args.indexOf(flag)
  return i !== -1 && args[i + 1] ? args[i + 1] : null
}

/**
 * Default 15 minutes. Each run is a full model call with web search, so this is
 * the cost lever: at 15 min it's 96 runs/day, at 30s it would be 2,880. Set it
 * deliberately.
 */
const INTERVAL_SEC = Number(argValue('--interval') ?? process.env.LLM_PRICE_INTERVAL_SEC ?? 900)

/** Optional domain allowlist — restricts the search to sites you trust. */
const ALLOWED_DOMAINS = (argValue('--sources') ?? process.env.LLM_PRICE_SOURCES ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

const log = (...a) => console.log(`[${formatCET()}]`, ...a)

// ── The contract Claude must return ─────────────────────────────────
// Structured outputs constrain the response to this schema, so the result is
// parseable JSON instead of prose. Every object needs additionalProperties:false.
const PRICE_SCHEMA = {
  type: 'object',
  properties: {
    prices: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Ticker, e.g. BTC' },
          name: { type: 'string', description: 'Full name, e.g. Bitcoin' },
          priceUsd: { type: 'number', description: 'Current price in US dollars' },
          change24hPercent: {
            anyOf: [{ type: 'number' }, { type: 'null' }],
            description: '24-hour change as a percentage, or null if the page did not show one',
          },
          sourceUrl: { type: 'string', description: 'The page this price was read from' },
          sourceName: { type: 'string', description: 'Human-readable name of that source' },
          observedAtUtc: {
            type: 'string',
            description: 'Timestamp the source gave for this price (ISO 8601 UTC), or the time it was read',
          },
          confidence: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: 'low if the figure looked stale, ambiguous, or came from a single weak source',
          },
        },
        required: [
          'symbol', 'name', 'priceUsd', 'change24hPercent',
          'sourceUrl', 'sourceName', 'observedAtUtc', 'confidence',
        ],
        additionalProperties: false,
      },
    },
    notes: {
      type: 'string',
      description: 'Anything that went wrong or looked off. Empty string if the lookup was clean.',
    },
  },
  required: ['prices', 'notes'],
  additionalProperties: false,
}

const SYSTEM_PROMPT = `You look up current cryptocurrency prices on the web and report them as structured data.

Rules:
- Search the web for each requested asset. Never answer from memory: prices change constantly and your training data is stale by definition.
- Prefer a source that displays an explicit timestamp for the quote. Cross-check against a second source when the first looks doubtful.
- Report the price you actually saw, and the URL you saw it on. Never estimate, interpolate, or carry a figure over from a previous run.
- Mark confidence "low" rather than guessing when a figure is ambiguous, stale, or from a single weak source, and say why in notes.
- If you cannot find a price for an asset, omit it from the array and explain in notes. An omission is recoverable; a fabricated number is not.`

const client = new Anthropic() // resolves ANTHROPIC_API_KEY / auth profile

/** Anthropic's hosted search tool — the reason no price API is involved. */
const webSearchTool = {
  type: 'web_search_20260209',
  name: 'web_search',
  max_uses: 6, // bounds both latency and per-run search cost
  ...(ALLOWED_DOMAINS.length > 0 ? { allowed_domains: ALLOWED_DOMAINS } : {}),
}

function estimateCostUsd(usage) {
  const input = (usage?.input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0)
  const output = usage?.output_tokens ?? 0
  // Model tokens only — web searches are billed separately by Anthropic.
  return (input / 1e6) * USD_PER_MTOK_INPUT + (output / 1e6) * USD_PER_MTOK_OUTPUT
}

/** Collect the URLs Claude actually visited, so the output is auditable. */
function extractSearchedUrls(content) {
  const urls = []
  for (const block of content) {
    if (block.type !== 'web_search_tool_result') continue
    // On success `content` is a list of results; on failure it's an error object.
    if (!Array.isArray(block.content)) continue
    for (const result of block.content) {
      if (result.url) urls.push(result.url)
    }
  }
  return [...new Set(urls)]
}

/**
 * One lookup. Runs the model until it stops calling tools, then parses the
 * structured payload out of the final text block.
 */
async function lookupPrices() {
  const messages = [{
    role: 'user',
    content: `Look up the current price of ${TRACKED.join(' and ')} in US dollars. `
      + 'Search the web for each one and report what the page actually shows, '
      + 'including the source URL and the timestamp of the quote.',
  }]

  let response
  let pauses = 0
  const usageTotals = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 }
  const searchedUrls = []

  // Server-side tools run in a loop on Anthropic's side; if that loop hits its
  // iteration cap the turn comes back as `pause_turn` and we re-send to resume.
  // Without this, a slow multi-search turn would silently return truncated.
  do {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000, // caps thinking + response together — leave headroom
      system: SYSTEM_PROMPT,
      tools: [webSearchTool],
      output_config: {
        // A price lookup is a short, scoped task; low effort keeps it quick and
        // cheap. Raise this if you start asking the agent for judgement calls.
        effort: 'low',
        format: { type: 'json_schema', schema: PRICE_SCHEMA },
      },
      messages,
    })

    for (const key of Object.keys(usageTotals)) {
      usageTotals[key] += response.usage?.[key] ?? 0
    }
    searchedUrls.push(...extractSearchedUrls(response.content))

    if (response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content })
      pauses++
    }
  } while (response.stop_reason === 'pause_turn' && pauses < 5)

  // Safety classifiers can decline a request — check before reading content.
  if (response.stop_reason === 'refusal') {
    throw new Error(`model declined the request (${response.stop_details?.category ?? 'no category'})`)
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('response truncated at max_tokens — raise max_tokens')
  }

  const textBlock = response.content.find(b => b.type === 'text')
  if (!textBlock) throw new Error('no text block in response')

  let parsed
  try {
    parsed = JSON.parse(textBlock.text)
  } catch (err) {
    throw new Error(`response was not valid JSON: ${err.message}`)
  }

  return {
    parsed,
    usage: usageTotals,
    searchedUrls: [...new Set(searchedUrls)],
    costUsd: estimateCostUsd(usageTotals),
  }
}

function readExisting() {
  try {
    return JSON.parse(readFileSync(OUTPUT_FILE, 'utf-8'))
  } catch {
    return null
  }
}

/** Temp file + rename, so a reader never sees a partial write. */
function writeAtomic(payload) {
  mkdirSync(DATA_DIR, { recursive: true })
  const tmp = `${OUTPUT_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(payload, null, 2))
  renameSync(tmp, OUTPUT_FILE)
}

let runCount = 0
let errorCount = 0
let consecutiveErrors = 0
let totalCostUsd = 0
let timer = null

async function tick() {
  runCount++
  const previous = readExisting()

  let result
  try {
    result = await lookupPrices()
    consecutiveErrors = 0
  } catch (err) {
    errorCount++
    consecutiveErrors++
    log(`Run ${runCount} FAILED: ${err.message} — keeping previous file.`)
    return
  }

  totalCostUsd += result.costUsd

  const prices = {}
  for (const p of result.parsed.prices ?? []) {
    const symbol = String(p.symbol).toUpperCase()
    prices[symbol] = {
      symbol,
      name: p.name,
      type: 'crypto',
      price: p.priceUsd,
      change24h: p.change24hPercent,
      asOf: p.observedAtUtc,
      asOfCET: formatCET(p.observedAtUtc),
      confidence: p.confidence,
      sourceUrl: p.sourceUrl,
      sourceName: p.sourceName,
      source: 'llm-web-search',
    }
  }

  if (Object.keys(prices).length === 0) {
    errorCount++
    consecutiveErrors++
    log(`Run ${runCount}: model returned no prices (${result.parsed.notes}) — keeping previous file.`)
    return
  }

  const now = new Date().toISOString()
  writeAtomic({
    updatedAt: now,
    updatedAtCET: formatCET(now),
    baseCurrency: 'USD',
    method: 'llm-web-search',
    model: MODEL,
    intervalSeconds: INTERVAL_SEC,
    run: runCount,
    errors: errorCount,
    notes: result.parsed.notes || null,
    sourcesConsulted: result.searchedUrls,
    usage: result.usage,
    costUsdThisRun: Number(result.costUsd.toFixed(4)),
    costUsdSinceStart: Number(totalCostUsd.toFixed(4)),
    // Carried forward so you can see whether a run actually moved the price.
    previousUpdatedAt: previous?.updatedAt ?? null,
    prices,
  })

  const summary = Object.values(prices)
    .map(p => `${p.symbol} $${p.price.toLocaleString('en-US', { maximumFractionDigits: 2 })} (${p.confidence})`)
    .join('  ')
  log(`Run ${runCount}: ${summary}  ~$${result.costUsd.toFixed(4)}  [${result.searchedUrls.length} source(s)]`)
  if (result.parsed.notes) log(`  note: ${result.parsed.notes}`)
}

/** Chained rather than setInterval, so a slow run can't stack up behind itself. */
async function loop() {
  await tick()
  if (runOnce) return

  if (consecutiveErrors >= 5) {
    log(`Stopping after ${consecutiveErrors} consecutive failures. Total spend ~$${totalCostUsd.toFixed(2)}.`)
    process.exit(1)
  }
  timer = setTimeout(loop, INTERVAL_SEC * 1000)
}

function shutdown(signal) {
  log(`${signal} — stopping after ${runCount} run(s), ${errorCount} error(s), ~$${totalCostUsd.toFixed(2)} spent.`)
  if (timer) clearTimeout(timer)
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.error(
    'No Anthropic credentials found.\n'
    + 'Add ANTHROPIC_API_KEY to backend/.env or export it, then re-run.',
  )
  process.exit(1)
}

const runsPerDay = Math.round(86400 / INTERVAL_SEC)
log(
  runOnce
    ? `LLM price agent: single web lookup of ${TRACKED.join(', ')} via ${MODEL}`
    : `LLM price agent: ${TRACKED.join(', ')} every ${INTERVAL_SEC}s (~${runsPerDay} model calls/day) → data/llm-prices.json`,
)
if (ALLOWED_DOMAINS.length > 0) log(`Restricted to: ${ALLOWED_DOMAINS.join(', ')}`)

loop().catch((err) => {
  log('Fatal:', err.message)
  process.exit(1)
})
