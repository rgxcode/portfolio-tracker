/**
 * The set of cryptocurrencies the app tracks, by market capitalisation.
 *
 * Replaces a hardcoded list that had frozen at whatever the rankings were the
 * day it was written. Refreshing from the provider means a coin that rises into
 * range is picked up without a code change — which is how CRO came to be
 * missing despite being a top-40 asset.
 */

import Coin from '../models/Coin.js'
import { consume } from './rateBudget.js'
import { formatCET } from './marketHours.js'

const MARKETS = 'https://api.coingecko.com/api/v3/coins/markets'

/** Deep enough to cover anything a user is plausibly holding. */
const TOP_N = Number(process.env.CRYPTO_TOP_N ?? 50)

const log = (...a) => console.log(`[${formatCET()}] coins:`, ...a)

export async function refreshCoins() {
  if (!(await consume('coingecko'))) throw new Error('daily CoinGecko budget exhausted')

  const key = process.env.COINGECKO_API_KEY
  const url = `${MARKETS}?vs_currency=usd&order=market_cap_desc&per_page=${TOP_N}&page=1`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', ...(key ? { 'x-cg-demo-api-key': key } : {}) },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`coin list: HTTP ${res.status}`)

  const rows = await res.json()
  if (!Array.isArray(rows) || rows.length < 10) {
    throw new Error(`coin list: only ${rows?.length ?? 0} rows, refusing to store`)
  }

  const now = new Date()
  const ops = rows
    .filter(c => c.symbol && c.id)
    .map(c => ({
      updateOne: {
        filter: { _id: c.symbol.toUpperCase() },
        update: {
          $set: {
            coingeckoId: c.id,
            name: c.name,
            image: c.image ?? null,
            rank: c.market_cap_rank ?? null,
            updatedAt: now,
          },
        },
        upsert: true,
      },
    }))

  await Coin.bulkWrite(ops, { ordered: false })
  log(`${ops.length} coins stored (top ${TOP_N} by market cap)`)
  return ops.map(o => o.updateOne.filter._id)
}

/**
 * Symbol → CoinGecko id for every tracked coin.
 *
 * Falls back to the static list when the collection is empty, so a fresh
 * database still fetches prices instead of silently tracking nothing.
 */
export async function coinIdMap(fallback = {}) {
  const docs = await Coin.find({}, { coingeckoId: 1 }).lean()
  if (docs.length === 0) return fallback
  return Object.fromEntries(docs.map(d => [d._id, d.coingeckoId]))
}
