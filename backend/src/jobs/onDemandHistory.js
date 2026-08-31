/**
 * Fetches five years of daily closes for a symbol we have never charted.
 *
 * Shared, because two different paths need it: the history endpoint drawing a
 * chart, and the fundamentals endpoint needing a price to compute a market cap
 * from. When only the chart triggered it, the first view of a newly-searched
 * company showed its financial statements with no valuation ratios at all —
 * they arrived on the second visit, which reads as a bug.
 *
 * Only for tickers already known to be real. The endpoints that call this need
 * no token, so without that check they would be a way to make us fetch
 * arbitrary strings from Yahoo.
 */

import PriceHistory from '../models/PriceHistory.js'
import Listing from '../models/Listing.js'
import { consume } from './rateBudget.js'

const inFlight = new Map()

async function fetchAndStore(symbol) {
  const listed = await Listing.findById(symbol, { _id: 1 }).lean()
  if (!listed) return 0
  if (!(await consume('yahoo'))) return 0

  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5y`,
    { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) },
  )
  if (!res.ok) return 0

  const result = (await res.json())?.chart?.result?.[0]
  const stamps = result?.timestamp ?? []
  const closes = result?.indicators?.quote?.[0]?.close ?? []

  const ops = stamps
    .map((t, i) => ({ ts: new Date(t * 1000), price: closes[i] }))
    .filter(p => typeof p.price === 'number')
    .map(p => ({
      updateOne: {
        filter: { symbol, ts: p.ts },
        update: {
          $set: {
            symbol, type: 'stock', ts: p.ts, price: p.price,
            source: 'yahoo-ondemand', granularity: 'daily',
          },
        },
        upsert: true,
      },
    }))

  if (ops.length === 0) return 0
  await PriceHistory.bulkWrite(ops, { ordered: false })
  return ops.length
}

/** Returns how many points were stored. Concurrent callers share one fetch. */
export async function ensureHistory(symbol) {
  const s = String(symbol).toUpperCase()
  if (inFlight.has(s)) return inFlight.get(s)

  const run = fetchAndStore(s).catch(() => 0).finally(() => inFlight.delete(s))
  inFlight.set(s, run)
  return run
}

/** True when we hold nothing at all for this symbol. */
export async function hasNoHistory(symbol) {
  return (await PriceHistory.countDocuments({ symbol }).limit(1)) === 0
}
