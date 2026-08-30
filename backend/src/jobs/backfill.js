#!/usr/bin/env node
/**
 * One-time history backfill.
 *
 * The scheduled job only knows about prices from the moment it started running,
 * so the 1Y and ALL chart ranges would be empty for a year. This pulls daily
 * closes once — CoinGecko for crypto, Yahoo for stocks — and seeds the history
 * collection so every range works immediately. The 5-minute job then extends
 * the series forward at higher resolution.
 *
 * Safe to re-run: every write is an upsert keyed on (symbol, ts).
 *
 *   node src/jobs/backfill.js              # held assets + tracked coins
 *   node src/jobs/backfill.js BTC ETH AMD  # only these symbols
 *   node src/jobs/backfill.js --sp500      # every S&P 500 member, no crypto
 *   node src/jobs/backfill.js --crypto     # every tracked coin, no stocks
 *   node src/jobs/backfill.js --commodities # gold, silver, copper
 *
 * --sp500 is a deliberate operator action, not automatic traffic: it makes ~500
 * requests over roughly ten minutes and is therefore paced by STOCK_STAGGER_MS
 * rather than counted against the shared daily budget the scheduled job uses.
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import mongoose from 'mongoose'
import PriceHistory from '../models/PriceHistory.js'
import { COIN_IDS } from './coins.js'
import { formatCET } from './marketHours.js'
import { resolveStockSymbols } from './stocks.js'
import { refreshConstituents } from './sp500.js'
import { refreshCoins, coinIdMap } from './coinlist.js'
import Coin from '../models/Coin.js'
import { COMMODITIES } from './commodities.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

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
} catch { /* keys are optional */ }

const MONGO_URL =
  process.env.MONGODB_URI
  || process.env.COSMOS_DB_CONNECTION_STRING // legacy name, kept so existing .env files keep working
  || 'mongodb://127.0.0.1:27017/portfolio-tracker'
const CRYPTO_DAYS = 365
const STOCK_RANGE = '5y'
const STAGGER_MS = 2500 // CoinGecko's free tier allows ~30 calls/min
// Yahoo publishes no limit; this is slow enough to stay unobtrusive while still
// finishing the whole index in about ten minutes.
const STOCK_STAGGER_MS = 1000

const delay = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log(`[${formatCET()}]`, ...a)

async function getJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0', ...headers },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** Upsert a batch of {ts, price} points for one symbol. */
async function store(symbol, type, points) {
  if (points.length === 0) return 0
  const ops = points.map(p => ({
    updateOne: {
      filter: { symbol, ts: p.ts },
      update: {
        $set: { symbol, type, ts: p.ts, price: p.price, source: p.source, granularity: 'daily' },
      },
      upsert: true,
    },
  }))
  const res = await PriceHistory.bulkWrite(ops, { ordered: false })
  return res.upsertedCount ?? 0
}

/** The provider's current price, used to sanity-check a history series. */
async function coingeckoSpot(id) {
  const apiKey = process.env.COINGECKO_API_KEY
  const data = await getJson(
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
    apiKey ? { 'x-cg-demo-api-key': apiKey } : {},
  )
  return data?.[id]?.usd ?? null
}

/**
 * Five years of daily closes for a coin, from Yahoo.
 *
 * Not CoinGecko: its free tier refuses any window beyond 365 days, so a year is
 * all it will give. Yahoo carries five and costs nothing.
 *
 * The catch is that Yahoo's crypto tickers collide — SUI-USD returns a
 * different, near-worthless token that stopped trading in 2024. So the series
 * is only accepted when its final close is in the same ballpark as the
 * provider's current price. A wrong asset is worse than a short one.
 */
async function backfillCryptoHistory(symbol, coingeckoId) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}-USD?interval=1d&range=${STOCK_RANGE}`
  const data = await getJson(url)
  const result = data?.chart?.result?.[0]
  if (!result) throw new Error('no chart data')

  const stamps = result.timestamp ?? []
  const closes = result.indicators?.quote?.[0]?.close ?? []
  const points = stamps
    .map((s, i) => ({ ts: new Date(s * 1000), price: closes[i], source: 'yahoo-backfill' }))
    .filter(p => typeof p.price === 'number')

  if (points.length === 0) throw new Error('no usable closes')

  const spot = coingeckoId ? await coingeckoSpot(coingeckoId) : null
  if (spot != null && spot > 0) {
    const last = points[points.length - 1].price
    const ratio = last / spot
    // An order of magnitude apart means Yahoo answered about something else.
    if (ratio > 5 || ratio < 0.2) {
      throw new Error(`ticker mismatch — Yahoo last ${last}, provider spot ${spot}`)
    }
  }

  return store(symbol, 'crypto', points)
}

async function backfillCrypto(symbol, coinIds) {
  const id = coinIds[symbol]

  // Yahoo first: five years against CoinGecko's one.
  try {
    return await backfillCryptoHistory(symbol, id)
  } catch (err) {
    if (!id) throw err
    log(`  ${symbol}: Yahoo history unusable (${err.message}) — falling back to 1y`)
  }

  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${CRYPTO_DAYS}`
  const apiKey = process.env.COINGECKO_API_KEY
  const data = await getJson(url, apiKey ? { 'x-cg-demo-api-key': apiKey } : {})

  const points = (data.prices ?? []).map(([ms, price]) => ({
    ts: new Date(ms),
    price,
    source: 'coingecko-backfill',
  }))
  return store(symbol, 'crypto', points)
}

async function backfillStock(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${STOCK_RANGE}`
  const data = await getJson(url)
  const result = data?.chart?.result?.[0]
  if (!result) throw new Error('no chart data')

  const stamps = result.timestamp ?? []
  const closes = result.indicators?.quote?.[0]?.close ?? []

  const points = stamps
    .map((s, i) => ({ ts: new Date(s * 1000), price: closes[i], source: 'yahoo-backfill' }))
    // Yahoo emits nulls for halted/holiday sessions.
    .filter(p => typeof p.price === 'number')

  return store(symbol, 'stock', points)
}

async function main() {
  await mongoose.connect(MONGO_URL, { serverSelectionTimeoutMS: 10000 })
  await PriceHistory.syncIndexes()

  const args = process.argv.slice(2)
  const wantSp500 = args.includes('--sp500')
  const wantCrypto = args.includes('--crypto')
  const wantCommodities = args.includes('--commodities')
  const requested = args.filter(a => !a.startsWith('--')).map(s => s.toUpperCase())

  let cryptoSymbols
  let stockSymbols
  if (wantCommodities) {
    // Futures symbols contain '=', so the contract is looked up rather than
    // derived from the ticker the way an equity's is.
    let total = 0
    for (const [symbol, meta] of Object.entries(COMMODITIES)) {
      await delay(STOCK_STAGGER_MS)
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(meta.yahoo)}?interval=1d&range=${STOCK_RANGE}`
        const result = (await getJson(url))?.chart?.result?.[0]
        const stamps = result?.timestamp ?? []
        const closes = result?.indicators?.quote?.[0]?.close ?? []
        const points = stamps
          .map((t, i) => ({ ts: new Date(t * 1000), price: closes[i], source: 'yahoo-backfill' }))
          .filter(p => typeof p.price === 'number')
        const n = await store(symbol, 'commodity', points)
        total += n
        log(`  ${symbol} (${meta.yahoo}): +${n} daily points`)
      } catch (err) {
        log(`  ${symbol}: FAILED — ${err.message}`)
      }
    }
    log(`Done. Added ${total} points.`)
    await mongoose.disconnect()
    return
  }

  if (wantCrypto) {
    // Refresh the rankings first so a coin that has risen into range is caught.
    cryptoSymbols = await refreshCoins()
    stockSymbols = []
    log(`Crypto mode: ${cryptoSymbols.length} coins`)
  } else if (wantSp500) {
    // Refresh membership first: backfilling a list that is months out of date
    // would quietly miss recent additions.
    stockSymbols = await refreshConstituents()
    cryptoSymbols = []
    log(`S&P 500 mode: ${stockSymbols.length} members`)
  } else if (requested.length > 0) {
    cryptoSymbols = requested.filter(s => COIN_IDS[s])
    stockSymbols = requested.filter(s => !COIN_IDS[s])
  } else {
    cryptoSymbols = Object.keys(await coinIdMap(COIN_IDS))
    stockSymbols = await resolveStockSymbols(log)
  }

  // Symbol → provider id, for the sanity check on Yahoo's series.
  const coinIds = await coinIdMap(COIN_IDS)

  log(`Backfilling ${cryptoSymbols.length} crypto (${CRYPTO_DAYS}d) + ${stockSymbols.length} stocks (${STOCK_RANGE})`)

  let total = 0
  const failures = []

  for (const [i, symbol] of cryptoSymbols.entries()) {
    // Yahoo is the primary source now and tolerates a faster pace than
    // CoinGecko's free tier, which is what STAGGER_MS was sized for.
    if (i > 0) await delay(wantCrypto ? STOCK_STAGGER_MS : STAGGER_MS)
    try {
      const n = await backfillCrypto(symbol, coinIds)
      total += n
      log(`  ${symbol}: +${n} daily points`)
    } catch (err) {
      failures.push(`${symbol} (${err.message})`)
      log(`  ${symbol}: FAILED — ${err.message}`)
    }
  }

  for (const [i, symbol] of stockSymbols.entries()) {
    await delay(STOCK_STAGGER_MS)
    try {
      const n = await backfillStock(symbol)
      total += n
      // Five hundred success lines bury the failures that matter; in bulk mode
      // report progress periodically and keep per-symbol output for failures.
      if (!wantSp500) log(`  ${symbol}: +${n} daily points`)
    } catch (err) {
      failures.push(`${symbol} (${err.message})`)
      log(`  ${symbol}: FAILED — ${err.message}`)
    }
    if (wantSp500 && (i + 1) % 25 === 0) {
      log(`  ${i + 1}/${stockSymbols.length} symbols · ${total} points so far`)
    }
  }

  const totalDocs = await PriceHistory.estimatedDocumentCount()
  log(`Done. Added ${total} points; collection now holds ~${totalDocs}.`)
  if (failures.length > 0) log(`Failed: ${failures.join(', ')} — re-run to retry.`)

  await mongoose.disconnect()
}

main().catch(async (err) => {
  log('Backfill failed:', err.message)
  try { await mongoose.disconnect() } catch { /* not connected */ }
  process.exit(1)
})
