#!/usr/bin/env node
/**
 * Writes an LLM read of each holding, grounded in articles we fetched.
 *
 * The division of labour is the whole point. Retrieval is mechanical
 * (news.js), so titles, publishers, dates and URLs are real. The model is shown
 * only that list, told to cite only from it, and anything it returns that is
 * not in the list is discarded before storage. That makes a fabricated citation
 * structurally impossible rather than merely discouraged — which matters,
 * because a made-up link next to a real one is indistinguishable to a reader.
 *
 * Runs in CI on the same free model as the price agent, so it costs nothing.
 *
 *   node src/jobs/insights.js          # every symbol any user holds
 *   node src/jobs/insights.js AMD BTC  # only these
 */

import { readFileSync, mkdirSync, existsSync } from 'fs'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import mongoose from 'mongoose'
import Insight from '../models/Insight.js'
import Constituent from '../models/Constituent.js'
import { fetchNews } from './news.js'
import { formatCET } from './marketHours.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const env = readFileSync(resolve(__dirname, '..', '..', '.env'), 'utf-8')
  for (const line of env.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim()
  }
} catch { /* optional */ }

const MONGO_URL = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/portfolio-tracker'

const DATA_DIR = resolve(__dirname, '..', '..', 'data')
mkdirSync(DATA_DIR, { recursive: true })

const OPENCODE_BIN = (() => {
  const local = resolve(__dirname, '..', '..', 'node_modules', '.bin', 'opencode')
  return existsSync(local) ? local : 'opencode'
})()

const MODELS = [
  'opencode/deepseek-v4-flash-free',
  'opencode/mimo-v2.5-free',
  'opencode/ling-3.0-flash-free',
]

/**
 * Skip anything refreshed more recently than this.
 *
 * The workflow sets it to 1 so an hourly schedule actually rewrites; the
 * default here stays conservative for a hand-run job, where re-analysing the
 * whole book because you ran the command twice is a waste.
 */
const FRESH_HOURS = Number(process.env.INSIGHTS_FRESH_HOURS ?? 12)

/**
 * Most holdings to analyse in one run.
 *
 * A ceiling on how long a run can take, so a portfolio that grows cannot
 * quietly turn a three-minute job into one that hits the workflow timeout and
 * writes nothing. Combined with the stalest-first ordering below, a book too
 * large for one pass still refreshes completely — just over several runs,
 * oldest first, instead of failing at the end of one.
 */
const MAX_PER_RUN = Number(process.env.INSIGHTS_MAX_PER_RUN ?? 25)
const TIMEOUT_MS = 180_000

const log = (...a) => console.log(`[${formatCET()}] insights:`, ...a)

function ask(model, text) {
  return new Promise((resolveP, reject) => {
    // stdin must be /dev/null: opencode probes the descriptor and stalls when
    // handed a pipe or socket.
    const child = spawn(OPENCODE_BIN, ['run', '-m', model, text], {
      cwd: DATA_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let err = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new Error(`timed out after ${TIMEOUT_MS / 1000}s`))
    }, TIMEOUT_MS)

    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('error', (e) => { if (!settled) { settled = true; clearTimeout(timer); reject(e) } })
    child.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      code === 0 ? resolveP(out) : reject(new Error(`exited ${code}: ${err.trim().split('\n')[0] ?? ''}`))
    })
  })
}

/** Last brace-balanced span in the output — models like to add a preamble. */
function extractJson(text) {
  for (let end = text.lastIndexOf('}'); end !== -1; end = text.lastIndexOf('}', end - 1)) {
    let depth = 0
    for (let i = end; i >= 0; i--) {
      if (text[i] === '}') depth++
      else if (text[i] === '{') {
        depth--
        if (depth === 0) {
          try { return JSON.parse(text.slice(i, end + 1)) } catch { break }
        }
      }
    }
  }
  return null
}

function prompt(symbol, name, articles) {
  const list = articles
    .map((a, i) => `${i + 1}. [${a.publisher}] ${a.title}`)
    .join('\n')

  return `Below are real, recently published headlines about ${name} (${symbol}).

${list}

Summarise what this coverage is saying for someone who holds ${symbol}.

Output ONLY this JSON object — no markdown fences, no commentary:
{"summary":"<2-3 sentences>","themes":["<short point>","<short point>"],"sentiment":"positive|negative|mixed|unclear","cite":[<article numbers you drew on>]}

Rules:
- Base everything on the headlines above. Do not use outside knowledge or invent events.
- "cite" must contain only numbers from the list above.
- themes: 2 to 4 short points, each under 15 words.
- sentiment describes the tone of the coverage, not a recommendation.
- If the headlines are not really about ${name}, set sentiment to "unclear" and say so in summary.`
}

const VALID_SENTIMENT = new Set(['positive', 'negative', 'mixed', 'unclear'])

async function analyse(symbol, name, type) {
  const articles = await fetchNews(symbol, type)
  if (articles.length === 0) throw new Error('no recent articles')

  let lastError = null
  for (const model of MODELS) {
    try {
      const parsed = extractJson(await ask(model, prompt(symbol, name, articles)))
      if (!parsed?.summary) throw new Error('no summary in response')

      /**
       * Citations are resolved by index into the list we supplied, so the model
       * never gets to author a URL. An index it invents simply falls outside
       * the array and disappears.
       */
      const cited = Array.isArray(parsed.cite)
        ? [...new Set(parsed.cite)]
          .map(n => articles[Number(n) - 1])
          .filter(Boolean)
        : []

      return {
        summary: String(parsed.summary).slice(0, 700),
        themes: (Array.isArray(parsed.themes) ? parsed.themes : [])
          .map(t => String(t).slice(0, 120)).slice(0, 4),
        sentiment: VALID_SENTIMENT.has(parsed.sentiment) ? parsed.sentiment : 'unclear',
        // Everything fetched is shown, so a reader can check the model's read
        // against the coverage rather than only the parts it chose.
        sources: (cited.length ? cited : articles).slice(0, 6),
        model,
      }
    } catch (err) {
      lastError = err
    }
  }
  throw lastError ?? new Error('all models failed')
}

/** Symbols any user actually holds — nothing else is worth spending a run on. */
async function heldSymbols() {
  const rows = await mongoose.connection.collection('assets')
    // Cash is excluded: there is no published commentary on a bank balance.
    // Asking anyway spent a news request per currency and then filed the
    // currency under "no coverage found", which reads as a gap in the data
    // rather than a category that was never going to have any.
    .aggregate([
      { $match: { type: { $ne: 'cash' } } },
      { $group: { _id: { symbol: '$symbol', type: '$type' } } },
    ])
    .toArray()
  return rows.map(r => ({
    symbol: String(r._id.symbol).toUpperCase(),
    type: r._id.type === 'crypto' ? 'crypto' : 'stock',
  }))
}

async function main() {
  await mongoose.connect(MONGO_URL, { serverSelectionTimeoutMS: 10000 })

  const requested = process.argv.slice(2).map(s => s.toUpperCase())
  let targets = await heldSymbols()
  if (requested.length) targets = targets.filter(t => requested.includes(t.symbol))

  if (targets.length === 0) {
    log('No holdings to analyse.')
    await mongoose.disconnect()
    return
  }

  const names = new Map(
    (await Constituent.find({ _id: { $in: targets.map(t => t.symbol) } }, { name: 1 }).lean())
      .map(c => [c._id, c.name]),
  )

  const cutoff = Date.now() - FRESH_HOURS * 3600e3

  // Read what is stored before deciding the order, so the run can start with
  // whatever has gone longest without a look. Never-analysed holdings sort
  // first: no coverage at all is a worse state than coverage from this morning.
  const stored = new Map(
    (await Insight.find({ _id: { $in: targets.map(t => t.symbol) } }, { generatedAt: 1 }).lean())
      .map(i => [i._id, new Date(i.generatedAt).getTime()]),
  )

  const due = targets
    .filter(t => (stored.get(t.symbol) ?? 0) <= cutoff)
    .sort((a, b) => (stored.get(a.symbol) ?? 0) - (stored.get(b.symbol) ?? 0))

  const skipped = targets.length - due.length
  if (skipped) log(`  ${skipped} still fresh, skipping`)

  const batch = due.slice(0, MAX_PER_RUN)
  if (due.length > batch.length) {
    log(`  ${due.length} due, taking the ${batch.length} stalest this run`)
  }

  let done = 0
  const failures = []

  for (const { symbol, type } of batch) {
    try {
      const result = await analyse(symbol, names.get(symbol) ?? symbol, type)
      await Insight.findByIdAndUpdate(
        symbol,
        { ...result, name: names.get(symbol) ?? symbol, type, generatedAt: new Date() },
        { upsert: true },
      )
      done++
      log(`  ${symbol}: ${result.sentiment}, ${result.sources.length} sources (${result.model})`)
    } catch (err) {
      failures.push(`${symbol} (${err.message})`)
      log(`  ${symbol}: FAILED — ${err.message}`)
    }
  }

  log(`Done. ${done} written, ${failures.length} failed.`)
  await mongoose.disconnect()
}

main().catch(async (err) => {
  log('Fatal:', err.message)
  try { await mongoose.disconnect() } catch { /* not connected */ }
  process.exit(1)
})
