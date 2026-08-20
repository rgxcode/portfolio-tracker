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
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import mongoose from 'mongoose'
import PriceHistory from '../models/PriceHistory.js'
import { COIN_IDS } from './coins.js'
import { formatCET } from './marketHours.js'
import { resolveStockSymbols } from './stocks.js'

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
  process.env.COSMOS_DB_CONNECTION_STRING || 'mongodb://127.0.0.1:27017/portfolio-tracker'
const CRYPTO_DAYS = 365
const STOCK_RANGE = '5y'
const STAGGER_MS = 2500 // CoinGecko's free tier allows ~30 calls/min

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

async function backfillCrypto(symbol) {
  const id = COIN_IDS[symbol]
  if (!id) throw new Error(`unknown coin ${symbol}`)

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

  const requested = process.argv.slice(2).map(s => s.toUpperCase())

  let cryptoSymbols
  let stockSymbols
  if (requested.length > 0) {
    cryptoSymbols = requested.filter(s => COIN_IDS[s])
    stockSymbols = requested.filter(s => !COIN_IDS[s])
  } else {
    cryptoSymbols = Object.keys(COIN_IDS)
    stockSymbols = await resolveStockSymbols(log)
  }

  log(`Backfilling ${cryptoSymbols.length} crypto (${CRYPTO_DAYS}d) + ${stockSymbols.length} stocks (${STOCK_RANGE})`)

  let total = 0
  const failures = []

  for (const [i, symbol] of cryptoSymbols.entries()) {
    if (i > 0) await delay(STAGGER_MS)
    try {
      const n = await backfillCrypto(symbol)
      total += n
      log(`  ${symbol}: +${n} daily points`)
    } catch (err) {
      failures.push(`${symbol} (${err.message})`)
      log(`  ${symbol}: FAILED — ${err.message}`)
    }
  }

  for (const symbol of stockSymbols) {
    await delay(1500)
    try {
      const n = await backfillStock(symbol)
      total += n
      log(`  ${symbol}: +${n} daily points`)
    } catch (err) {
      failures.push(`${symbol} (${err.message})`)
      log(`  ${symbol}: FAILED — ${err.message}`)
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
