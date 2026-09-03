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

const SEARCH = 'https://api.coingecko.com/api/v3/search'
const SIMPLE_PRICE = 'https://api.coingecko.com/api/v3/simple/price'

function cgHeaders() {
  const key = process.env.COINGECKO_API_KEY
  return { Accept: 'application/json', ...(key ? { 'x-cg-demo-api-key': key } : {}) }
}

/**
 * Find one coin by ticker and start tracking it.
 *
 * The ranked list is a window, not the world — it was fifty deep, and Polkadot
 * at rank 56 and POL at 70 fell just outside it, so holding either meant a row
 * that never got a price. Stablecoins make that worse than the number suggests:
 * a dozen of the fifty slots go to dollar tokens nobody charts.
 *
 * So a coin outside the window is looked up on demand and stored, exactly as a
 * ticker nobody has charted yet is fetched on demand. From then on it is in the
 * collection and the scheduled job prices it like any other — the window
 * becomes a warm start rather than a limit.
 *
 * Ambiguity is resolved by market capitalisation: "DOT" matches Polkadot, but
 * also a rank-2290 token and something called Pippin's Friend. The most valuable
 * exact match is the one somebody means, and a symbol that matches nothing
 * exactly returns null rather than guessing at a near miss.
 */
export async function resolveCoin(symbol) {
  const sym = String(symbol ?? '').trim().toUpperCase()
  if (!sym) return null

  const known = await Coin.findById(sym).lean()
  if (known) return known

  if (!(await consume('coingecko'))) return null

  let rows
  try {
    const res = await fetch(`${SEARCH}?query=${encodeURIComponent(sym)}`, {
      headers: cgHeaders(),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    rows = (await res.json())?.coins
  } catch {
    return null
  }
  if (!Array.isArray(rows)) return null

  const exact = rows
    .filter(c => c?.id && String(c.symbol ?? '').toUpperCase() === sym)
    // An unranked coin sorts last rather than first: `null` is "no market cap
    // worth recording", which is the opposite of rank 1.
    .sort((a, b) => (a.market_cap_rank ?? Infinity) - (b.market_cap_rank ?? Infinity))

  const best = exact[0]
  if (!best) return null

  const doc = {
    coingeckoId: best.id,
    name: best.name ?? sym,
    image: best.large ?? best.thumb ?? null,
    rank: best.market_cap_rank ?? null,
    updatedAt: new Date(),
  }
  await Coin.updateOne({ _id: sym }, { $set: doc }, { upsert: true })
  log(`resolved ${sym} → ${best.id} (rank ${doc.rank ?? 'unranked'}) on demand`)
  return { _id: sym, ...doc }
}

/** One coin's current price, for the moment a holding is added. */
export async function fetchCoinQuote(coingeckoId) {
  if (!coingeckoId) return null
  if (!(await consume('coingecko'))) return null

  try {
    const url = `${SIMPLE_PRICE}?ids=${encodeURIComponent(coingeckoId)}`
      + '&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true'
    const res = await fetch(url, { headers: cgHeaders(), signal: AbortSignal.timeout(20000) })
    if (!res.ok) return null
    const v = (await res.json())?.[coingeckoId]
    if (typeof v?.usd !== 'number') return null
    return {
      price: v.usd,
      change24h: v.usd_24h_change ?? 0,
      asOf: v.last_updated_at
        ? new Date(v.last_updated_at * 1000).toISOString()
        : new Date().toISOString(),
    }
  } catch {
    return null
  }
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
