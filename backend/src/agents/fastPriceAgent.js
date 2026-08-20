#!/usr/bin/env node
/**
 * Fast price agent — BTC and ETH, every 30 seconds.
 *
 * A long-running worker rather than a launchd timer: at this cadence, spawning
 * a fresh Node process every 30s would spend more time starting up than working.
 * It ticks on an interval, writes data/fast-prices.json, and keeps going.
 *
 * Source: Kraken's public ticker returns both pairs in a single request and
 * includes the 24h open, so one call per tick covers everything (2,880/day).
 * Binance is the per-symbol fallback if Kraken fails.
 *
 *   node src/agents/fastPriceAgent.js              # run forever, 30s ticks
 *   node src/agents/fastPriceAgent.js --once       # single tick, then exit
 *   node src/agents/fastPriceAgent.js --interval 10  # custom seconds
 *
 * This writes its own file and never touches prices.json — the 5-minute job
 * owns that one, and two writers on one file would race.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { formatCET } from '../jobs/marketHours.js'
import { consume } from '../jobs/rateBudget.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, '..', '..', 'data')
const OUTPUT_FILE = resolve(DATA_DIR, 'fast-prices.json')

/** Kraken names Bitcoin XBT, and its result keys carry asset-class prefixes. */
const TRACKED = {
  BTC: { kraken: 'XBTUSD', krakenResult: 'XXBTZUSD', binance: 'BTCUSDT', name: 'Bitcoin' },
  ETH: { kraken: 'ETHUSD', krakenResult: 'XETHZUSD', binance: 'ETHUSDT', name: 'Ethereum' },
}

const KRAKEN_URL = 'https://api.kraken.com/0/public/Ticker'
const BINANCE_URL = 'https://api.binance.com/api/v3/ticker/24hr'
const REQUEST_TIMEOUT_MS = 10000

// ── CLI options ─────────────────────────────────────────────────────
const args = process.argv.slice(2)
const runOnce = args.includes('--once')
const intervalArg = args.indexOf('--interval')
const INTERVAL_SEC =
  intervalArg !== -1 && args[intervalArg + 1]
    ? Math.max(5, Number(args[intervalArg + 1]))
    : Number(process.env.FAST_PRICE_INTERVAL_SEC ?? 30)

const log = (...a) => console.log(`[${formatCET()}]`, ...a)

async function getJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'portfolio-tracker/1.0' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** Both symbols in one request. Returns a map keyed by our own symbols. */
async function fetchFromKraken() {
  if (!consume('kraken')) throw new Error('daily kraken budget exhausted')

  const pairs = Object.values(TRACKED).map(t => t.kraken).join(',')
  const data = await getJson(`${KRAKEN_URL}?pair=${pairs}`)
  if (data.error?.length) throw new Error(data.error.join('; '))

  const now = new Date().toISOString()
  const out = {}
  for (const [symbol, meta] of Object.entries(TRACKED)) {
    const row = data.result?.[meta.krakenResult]
    if (!row) continue
    const price = parseFloat(row.c?.[0])
    const open = parseFloat(row.o)
    if (!Number.isFinite(price)) continue
    out[symbol] = {
      symbol,
      name: meta.name,
      type: 'crypto',
      price,
      // Kraken gives the rolling 24h open, so the change is ours to compute.
      change24h: Number.isFinite(open) && open !== 0 ? ((price - open) / open) * 100 : null,
      asOf: now,
      asOfCET: formatCET(now),
      source: 'kraken',
    }
  }
  if (Object.keys(out).length === 0) throw new Error('no usable rows in Kraken response')
  return out
}

/** Fallback: one request per symbol, used only when Kraken fails. */
async function fetchFromBinance(symbol) {
  if (!consume('binance')) throw new Error('daily binance budget exhausted')

  const meta = TRACKED[symbol]
  const t = await getJson(`${BINANCE_URL}?symbol=${meta.binance}`)
  const price = parseFloat(t.lastPrice)
  if (!Number.isFinite(price)) throw new Error('no price in Binance response')

  const asOf = t.closeTime ? new Date(t.closeTime).toISOString() : new Date().toISOString()
  return {
    symbol,
    name: meta.name,
    type: 'crypto',
    price,
    change24h: parseFloat(t.priceChangePercent) || 0,
    asOf,
    asOfCET: formatCET(asOf),
    source: 'binance',
  }
}

function readExisting() {
  try {
    return JSON.parse(readFileSync(OUTPUT_FILE, 'utf-8'))
  } catch {
    return null
  }
}

/** Temp file + rename, so a reader never catches a partial write. */
function writeAtomic(payload) {
  mkdirSync(DATA_DIR, { recursive: true })
  const tmp = `${OUTPUT_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(payload, null, 2))
  renameSync(tmp, OUTPUT_FILE)
}

// ── State kept across ticks ─────────────────────────────────────────
let tickCount = 0
let errorCount = 0
let consecutiveErrors = 0

async function tick() {
  tickCount++
  const previous = readExisting()
  let prices = {}

  try {
    prices = await fetchFromKraken()
    consecutiveErrors = 0
  } catch (krakenErr) {
    log(`Kraken failed (${krakenErr.message}) — falling back to Binance`)
    for (const symbol of Object.keys(TRACKED)) {
      try {
        prices[symbol] = await fetchFromBinance(symbol)
      } catch (binanceErr) {
        log(`  ${symbol}: Binance failed too (${binanceErr.message}) — keeping previous value`)
        if (previous?.prices?.[symbol]) prices[symbol] = previous.prices[symbol]
      }
    }
    if (Object.keys(prices).length === 0) {
      errorCount++
      consecutiveErrors++
      log(`Tick ${tickCount}: no data from any source — leaving file untouched.`)
      return
    }
    errorCount++
    consecutiveErrors++
  }

  const now = new Date().toISOString()
  writeAtomic({
    updatedAt: now,
    updatedAtCET: formatCET(now),
    intervalSeconds: INTERVAL_SEC,
    baseCurrency: 'USD',
    tick: tickCount,
    errors: errorCount,
    prices,
  })

  const summary = Object.values(prices)
    .map(p => `${p.symbol} $${p.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`)
    .join('  ')
  log(`Tick ${tickCount}: ${summary}  (via ${Object.values(prices)[0].source})`)
}

/**
 * Ticks are chained rather than run on a bare setInterval: if one tick is slow,
 * the next waits its full interval instead of stacking up behind it.
 */
async function loop() {
  await tick()
  if (runOnce) return

  if (consecutiveErrors >= 10) {
    log(`Stopping: ${consecutiveErrors} consecutive failures — check connectivity.`)
    process.exit(1)
  }
  timer = setTimeout(loop, INTERVAL_SEC * 1000)
}

let timer = null

function shutdown(signal) {
  log(`${signal} received — stopping after ${tickCount} tick(s), ${errorCount} error(s).`)
  if (timer) clearTimeout(timer)
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

log(
  runOnce
    ? 'Fast price agent: single tick (BTC, ETH)'
    : `Fast price agent: BTC and ETH every ${INTERVAL_SEC}s → data/fast-prices.json (Ctrl-C to stop)`,
)
loop().catch((err) => {
  log('Fatal:', err.message)
  process.exit(1)
})
