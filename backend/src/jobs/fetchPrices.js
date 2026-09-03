#!/usr/bin/env node
/**
 * Scheduled price fetcher.
 *
 * Reads current prices once, from one place, and stores them as the 'standard'
 * snapshot in MongoDB. The API serves that snapshot, so no browser ever talks to
 * a third-party API and rate limits stop being the app's problem.
 *
 * The snapshot lives in the database rather than on disk so the job and the API
 * can run on different hosts — which is what a deployed setup requires.
 *
 * Cadence (launchd fires this every 5 minutes):
 *   crypto — every run, since crypto trades 24/7
 *   stocks — only inside the 10:00–22:00 CET weekday window, and at most once
 *            every STOCK_INTERVAL_MIN, because one request per symbol is needed
 *
 * Run manually:   node src/jobs/fetchPrices.js
 * Force stocks:   node src/jobs/fetchPrices.js --force-stocks
 *
 * On failure the previous snapshot is left untouched — stale data beats no
 * data, and the next run gets another chance.
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import mongoose from 'mongoose'
import { COIN_IDS, COIN_NAMES, ID_TO_SYMBOL } from './coins.js'
import Coin from '../models/Coin.js'
import { fetchCommodityPrices } from './commodities.js'
import { formatCET, isStockWindowOpen, stockWindowStatus } from './marketHours.js'
import { resolveStockSymbols, fetchStockPrices } from './stocks.js'
import { consume, usage } from './rateBudget.js'
import { saveSnapshot, loadSnapshot, STANDARD } from './snapshotStore.js'
import { recordSnapshot, pruneIntraday } from './history.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

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
/**
 * Currencies a cash balance can be held in, and the rates the dashboard
 * converts with. All ECB reference rates, from the same free endpoint the euro
 * rate has always come from — one request covers the lot, so supporting the
 * list costs no more than supporting the euro did.
 *
 * USD is deliberately absent: it is the base, its rate is 1, and asking the
 * endpoint for it would only invite a null to divide by.
 */
export const CASH_CURRENCIES = [
  'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'SGD', 'HKD',
  'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'NZD', 'ZAR', 'BRL', 'MXN', 'KRW',
  'TRY', 'THB', 'MYR', 'IDR', 'PHP', 'ILS', 'HUF', 'RON',
]

const FX_URL = `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${CASH_CURRENCIES.join(',')}`
const TIMEOUT_MS = 20000
const MONGO_URL =
  process.env.MONGODB_URI
  || process.env.COSMOS_DB_CONNECTION_STRING // legacy name, kept so existing .env files keep working
  || 'mongodb://127.0.0.1:27017/portfolio-tracker'

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

/**
 * The coins to price: the stored rankings, plus anything a user actually holds.
 *
 * The stored list is refreshed by the crypto backfill, so a coin that climbs
 * into range appears without a code change. Held symbols are unioned in
 * regardless of rank — someone holding a rank-200 coin should still see a
 * price, which the old hardcoded top-30 could never do.
 */
async function resolveCoins() {
  const [tracked, held] = await Promise.all([
    Coin.find({}, { coingeckoId: 1, name: 1, image: 1 }).lean(),
    mongoose.connection.collection('assets').distinct('symbol', { type: 'crypto' }),
  ])

  const map = new Map(tracked.map(c => [c._id, { id: c.coingeckoId, name: c.name, image: c.image }]))

  // Fall back to the static list when nothing is stored yet, so a fresh
  // database still prices the majors rather than nothing at all.
  if (map.size === 0) {
    for (const [sym, id] of Object.entries(COIN_IDS)) {
      map.set(sym, { id, name: COIN_NAMES[sym] ?? sym })
    }
  }

  for (const raw of held) {
    const sym = String(raw).toUpperCase()
    if (map.has(sym)) continue
    const known = await Coin.findById(sym).lean()
    if (known) map.set(sym, { id: known.coingeckoId, name: known.name })
    else if (COIN_IDS[sym]) map.set(sym, { id: COIN_IDS[sym], name: COIN_NAMES[sym] ?? sym })
  }

  return map
}

async function fetchCryptoPrices() {
  if (!await consume('coingecko')) throw new Error('daily CoinGecko budget exhausted')

  const coins = await resolveCoins()
  const idToSymbol = Object.fromEntries([...coins].map(([sym, c]) => [c.id, sym]))
  const nameOf = Object.fromEntries([...coins].map(([sym, c]) => [sym, c.name]))
  const imageOf = Object.fromEntries([...coins].map(([sym, c]) => [sym, c.image ?? null]))

  const ids = [...coins.values()].map(c => c.id).join(',')
  const url = `${COINGECKO_URL}?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_last_updated_at=true`

  const apiKey = process.env.COINGECKO_API_KEY || process.env.NUXT_PUBLIC_COINGECKO_API_KEY
  const data = await getJson(url, apiKey ? { 'x-cg-demo-api-key': apiKey } : {})

  const prices = {}
  for (const [id, values] of Object.entries(data)) {
    const symbol = idToSymbol[id] ?? ID_TO_SYMBOL[id]
    if (!symbol || typeof values?.usd !== 'number') continue
    // CoinGecko reports when it last saw this price; fall back to fetch time.
    const asOf = values.last_updated_at
      ? new Date(values.last_updated_at * 1000).toISOString()
      : new Date().toISOString()
    prices[symbol] = {
      symbol,
      name: nameOf[symbol] ?? COIN_NAMES[symbol] ?? symbol,
      image: imageOf[symbol] ?? null,
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

/**
 * Units of each currency per US dollar, and the day they are the rates for.
 *
 * Returns null rather than a partial map on failure, so a bad response cannot
 * quietly halve someone's cash: the caller keeps the previous snapshot's rates
 * instead, which are stale but coherent.
 *
 * The date is the ECB's publication day, not our fetch time. These are daily
 * reference rates, so that is the instant each one actually belongs to — and
 * keying history by it means the five-minute job records one point per
 * currency per day instead of the same figure 288 times.
 */
async function fetchFxRates() {
  try {
    const data = await getJson(FX_URL)
    const rates = data?.rates
    if (!rates || typeof rates !== 'object') return null

    const clean = {}
    for (const code of CASH_CURRENCIES) {
      const rate = Number(rates[code])
      if (Number.isFinite(rate) && rate > 0) clean[code] = rate
    }
    if (!Object.keys(clean).length) return null
    return { rates: clean, date: typeof data.date === 'string' ? data.date : null }
  } catch (err) {
    log('FX rate fetch failed (keeping previous):', err.message)
    return null
  }
}

/**
 * One history point per currency, in the shape recordSnapshot expects.
 *
 * Priced the way a cash holding is: what one unit is worth in US dollars, so a
 * rupee balance charts against the same axis as everything else in the book.
 *
 * Keyed `FX:<code>` rather than the bare code. A currency code is not a ticker
 * and the two namespaces collide — INR is the rupee here and Infinity Natural
 * Resources on the NYSE — which once had the chart value a 420,000 rupee
 * balance as 420,000 shares of an oil company.
 *
 * USD is left out on purpose: it is the base, always worth exactly itself, and
 * a flat line of ones is not history.
 */
function fxQuotes(rates, asOf) {
  if (!rates || !asOf) return {}
  const quotes = {}
  for (const [code, rate] of Object.entries(rates)) {
    if (!(rate > 0)) continue
    const symbol = `FX:${code}`
    quotes[symbol] = {
      symbol,
      type: 'cash',
      price: 1 / rate,
      asOf,
      source: 'frankfurter',
      granularity: 'daily',
    }
  }
  return quotes
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
  // The snapshot lives in the database now, so the connection has to come
  // first — there is no local file to fall back on.
  try {
    await mongoose.connect(MONGO_URL, { serverSelectionTimeoutMS: 8000 })
  } catch (err) {
    log(`Database unavailable (${err.message}) — cannot read or write the snapshot. Aborting.`)
    process.exit(1)
  }
  const dbConnected = true
  const previous = await loadSnapshot(STANDARD)

  // ── Crypto: every run ───────────────────────────────────────────
  let crypto
  try {
    crypto = await fetchCryptoPrices()
  } catch (err) {
    log('Crypto fetch FAILED:', err.message)
    crypto = previous?.crypto ?? {}
  }
  if (Object.keys(crypto).length === 0) {
    log('No crypto prices available — leaving the previous snapshot in place.')
    process.exit(1)
  }

  // ── Exchange rates ──────────────────────────────────────────────
  // Fetched before stocks, not after: a listing quoted in euros is converted
  // as it arrives, so the rates have to be in hand by then.
  const fx = await fetchFxRates()
  const fxRates = fx?.rates ?? previous?.fxRates ?? null
  // Only a freshly fetched day gets recorded; a rate carried over from the
  // previous snapshot has already been written under the date it belongs to.
  const fxDate = fx?.date ?? null
  // Kept alongside the full map: the currency toggle has read `eurRate` since
  // long before cash existed, and older clients still do.
  const eurRate = fxRates?.EUR ?? previous?.eurRate ?? 0.86

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
      fxRates,
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

  // Metals trade nearly around the clock, so unlike equities they are fetched
  // every run rather than gated by an exchange window.
  let commodities = previous?.commodities ?? {}
  try {
    const fresh = await fetchCommodityPrices()
    if (Object.keys(fresh).length > 0) commodities = fresh
  } catch (err) {
    log(`Commodities failed (${err.message}) — keeping the previous values.`)
  }

  const now = new Date().toISOString()

  await saveSnapshot(STANDARD, {
    updatedAt: now,
    updatedAtCET: formatCET(now),
    baseCurrency: 'USD',
    eurRate,
    fxRates,
    crypto,
    stocks,
    commodities,
    stocksUpdatedAt,
    stocksUpdatedAtCET: stocksUpdatedAt ? formatCET(stocksUpdatedAt) : null,
    stockWindow: {
      status: windowStatus,
      open: isStockWindowOpen(),
      hoursCET: '10:00–22:00',
      refreshEveryMin: STOCK_INTERVAL_MIN,
    },
    rateBudget: await usage(),
  })

  // ── History: append this snapshot so charts have a series to draw ──
  if (dbConnected) {
    try {
      await recordSnapshot(
        { ...crypto, ...stocks, ...commodities, ...fxQuotes(fx?.rates, fxDate) },
        log,
      )
      // Housekeeping is cheap and idempotent; once an hour is plenty.
      if (new Date().getMinutes() < 5) await pruneIntraday(log)
    } catch (err) {
      log('History write failed (the snapshot is still current):', err.message)
    }
    await mongoose.disconnect()
  }

  const btc = crypto.BTC ? `BTC $${crypto.BTC.price.toLocaleString()}` : 'BTC n/a'
  log(
    `Wrote ${Object.keys(crypto).length} crypto + ${Object.keys(stocks).length} stocks ` +
      `(${btc}, EUR ${eurRate}) → snapshot:standard`,
  )
}

main().catch((err) => {
  log('Unexpected failure:', err)
  process.exit(1)
})
