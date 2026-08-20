#!/usr/bin/env node
/**
 * Scheduled price fetcher.
 *
 * Reads current prices once, from one place, and writes them to data/prices.json.
 * The app serves that file, so no browser ever talks to a third-party API and
 * rate limits stop being the app's problem.
 *
 * Cadence (launchd fires this every 5 minutes):
 *   crypto — every run, since crypto trades 24/7
 *   stocks — only inside the 10:00–22:00 CET weekday window, and at most once
 *            every STOCK_INTERVAL_MIN, because one request per symbol is needed
 *
 * Run manually:   node src/jobs/fetchPrices.js
 * Force stocks:   node src/jobs/fetchPrices.js --force-stocks
 *
 * On failure the existing prices.json is left untouched — stale data beats no
 * data, and the next run gets another chance.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import mongoose from 'mongoose'
import { COIN_IDS, COIN_NAMES, ID_TO_SYMBOL } from './coins.js'
import { formatCET, isStockWindowOpen, stockWindowStatus } from './marketHours.js'
import { resolveStockSymbols, fetchStockPrices } from './stocks.js'
import { consume, usage } from './rateBudget.js'
import { recordSnapshot, pruneIntraday } from './history.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, '..', '..', 'data')
const OUTPUT_FILE = resolve(DATA_DIR, 'prices.json')

/** Minimum gap between stock refreshes. 12h window ÷ 15min = 48 cycles/day. */
const STOCK_INTERVAL_MIN = 15

// Load .env for optional API keys.
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
} catch {
  // No .env — public endpoints work without keys.
}

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price'
const FX_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR'
const TIMEOUT_MS = 20000
const MONGO_URL =
  process.env.COSMOS_DB_CONNECTION_STRING || 'mongodb://127.0.0.1:27017/portfolio-tracker'

const forceStocks = process.argv.includes('--force-stocks')

function log(...args) {
  console.log(`[${formatCET()}]`, ...args)
}

async function getJson(url, headers = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', ...headers },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function fetchCryptoPrices() {
  if (!consume('coingecko')) throw new Error('daily CoinGecko budget exhausted')

  const ids = Object.values(COIN_IDS).join(',')
  const url = `${COINGECKO_URL}?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_last_updated_at=true`

  const apiKey = process.env.COINGECKO_API_KEY || process.env.NUXT_PUBLIC_COINGECKO_API_KEY
  const data = await getJson(url, apiKey ? { 'x-cg-demo-api-key': apiKey } : {})

  const prices = {}
  for (const [id, values] of Object.entries(data)) {
    const symbol = ID_TO_SYMBOL[id]
    if (!symbol || typeof values?.usd !== 'number') continue
    // CoinGecko reports when it last saw this price; fall back to fetch time.
    const asOf = values.last_updated_at
      ? new Date(values.last_updated_at * 1000).toISOString()
      : new Date().toISOString()
    prices[symbol] = {
      symbol,
      name: COIN_NAMES[symbol] ?? symbol,
      type: 'crypto',
      coingeckoId: id,
      price: values.usd,
      change24h: values.usd_24h_change ?? 0,
      marketCap: values.usd_market_cap ?? null,
      asOf,
      asOfCET: formatCET(asOf),
      source: 'coingecko',
    }
  }
  return prices
}

async function fetchEurRate() {
  try {
    const data = await getJson(FX_URL)
    return data?.rates?.EUR ?? null
  } catch (err) {
    log('FX rate fetch failed (keeping previous):', err.message)
    return null
  }
}

function readExisting() {
  try {
    return JSON.parse(readFileSync(OUTPUT_FILE, 'utf-8'))
  } catch {
    return null
  }
}

/** Write via temp file + rename so a reader never sees a half-written file. */
function writeAtomic(payload) {
  mkdirSync(DATA_DIR, { recursive: true })
  const tmp = `${OUTPUT_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(payload, null, 2))
  renameSync(tmp, OUTPUT_FILE)
}

/** Stocks are due if the window is open and enough time has passed. */
function stocksAreDue(previous) {
  if (forceStocks) return true
  if (!isStockWindowOpen()) return false
  const last = previous?.stocksUpdatedAt
  if (!last) return true
  return Date.now() - new Date(last).getTime() >= STOCK_INTERVAL_MIN * 60000
}

async function main() {
  const previous = readExisting()

  // One connection for the whole run: symbol lookup and history writes.
  let dbConnected = false
  try {
    await mongoose.connect(MONGO_URL, { serverSelectionTimeoutMS: 8000 })
    dbConnected = true
  } catch (err) {
    log(`Database unavailable (${err.message}) — prices.json still updates, history does not.`)
  }

  // ── Crypto: every run ───────────────────────────────────────────
  let crypto
  try {
    crypto = await fetchCryptoPrices()
  } catch (err) {
    log('Crypto fetch FAILED:', err.message)
    crypto = previous?.crypto ?? {}
  }
  if (Object.keys(crypto).length === 0) {
    log('No crypto prices available — keeping previous file untouched.')
    process.exit(1)
  }

  // ── Stocks: only inside the CET window, at most every 15 min ────
  const windowStatus = stockWindowStatus()
  let stocks = previous?.stocks ?? {}
  let stocksUpdatedAt = previous?.stocksUpdatedAt ?? null

  if (stocksAreDue(previous)) {
    const symbols = dbConnected ? await resolveStockSymbols(log) : Object.keys(previous?.stocks ?? {})
    log(`Stock window ${windowStatus} — fetching ${symbols.length} symbol(s): ${symbols.join(', ')}`)
    const fetched = await fetchStockPrices(symbols, {
      alphaVantageKey: process.env.ALPHA_VANTAGE_API_KEY || process.env.NUXT_PUBLIC_ALPHA_VANTAGE_API_KEY,
      previous: stocks,
      log,
    })
    if (Object.keys(fetched).length > 0) {
      // Stamp each quote with its CET rendering of the exchange timestamp.
      stocks = Object.fromEntries(
        Object.entries(fetched).map(([sym, q]) => [sym, { ...q, asOfCET: formatCET(q.asOf) }]),
      )
      stocksUpdatedAt = new Date().toISOString()
    }
  } else {
    const reason = isStockWindowOpen()
      ? `last refresh under ${STOCK_INTERVAL_MIN}min ago`
      : windowStatus
    log(`Skipping stocks — ${reason}.`)
  }

  const eurRate = (await fetchEurRate()) ?? previous?.eurRate ?? 0.86
  const now = new Date().toISOString()

  writeAtomic({
    updatedAt: now,
    updatedAtCET: formatCET(now),
    baseCurrency: 'USD',
    eurRate,
    crypto,
    stocks,
    stocksUpdatedAt,
    stocksUpdatedAtCET: stocksUpdatedAt ? formatCET(stocksUpdatedAt) : null,
    stockWindow: {
      status: windowStatus,
      open: isStockWindowOpen(),
      hoursCET: '10:00–22:00',
      refreshEveryMin: STOCK_INTERVAL_MIN,
    },
    rateBudget: usage(),
  })

  // ── History: append this snapshot so charts have a series to draw ──
  if (dbConnected) {
    try {
      await recordSnapshot({ ...crypto, ...stocks }, log)
      // Housekeeping is cheap and idempotent; once an hour is plenty.
      if (new Date().getMinutes() < 5) await pruneIntraday(log)
    } catch (err) {
      log('History write failed (prices.json is still current):', err.message)
    }
    await mongoose.disconnect()
  }

  const btc = crypto.BTC ? `BTC $${crypto.BTC.price.toLocaleString()}` : 'BTC n/a'
  log(
    `Wrote ${Object.keys(crypto).length} crypto + ${Object.keys(stocks).length} stocks ` +
      `(${btc}, EUR ${eurRate}) → prices.json`,
  )
}

main().catch((err) => {
  log('Unexpected failure:', err)
  process.exit(1)
})
