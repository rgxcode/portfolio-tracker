/**
 * Valuation ratios computed from data we already hold.
 *
 * These used to come from a metered provider capped at 25 requests a day, which
 * made them the app's real scaling limit: six new companies a day for every user
 * combined. Every backward-looking ratio is arithmetic over figures already in
 * the database — reported financials from SEC filings and our own price history
 * — so computing them removes the quota entirely and, unlike a cached figure,
 * they track the live price instead of going stale.
 *
 * What genuinely cannot be computed is anything forward-looking: a forward P/E
 * needs an analyst consensus, and no amount of filed history contains one. Those
 * fields still come from the provider when available and are simply absent when
 * not.
 */

import PriceHistory from '../models/PriceHistory.js'

/** Four quarters. Any fewer and a trailing-twelve-month figure is a fiction. */
const TTM_QUARTERS = 4

/**
 * Sum a field across the most recent four quarters.
 *
 * Returns null unless all four are present: a partial sum silently understates
 * the year and would quietly deflate every ratio built on it.
 */
function ttm(quarters, field) {
  const recent = quarters.slice(0, TTM_QUARTERS)
  if (recent.length < TTM_QUARTERS) return null
  let total = 0
  for (const q of recent) {
    const v = q[field]
    if (v == null) return null
    total += v
  }
  return total
}

/** The most recent non-null value — balance-sheet items are point-in-time. */
function latest(quarters, field) {
  for (const q of quarters) {
    if (q[field] != null) return q[field]
  }
  return null
}

const ratio = (a, b) => (a != null && b != null && b !== 0 ? a / b : null)
const round = (n, dp = 2) => (n == null ? null : +n.toFixed(dp))

/** Highest and lowest close over the past year, from our own history. */
export async function priceRange52w(symbol) {
  const since = new Date(Date.now() - 365 * 86400e3)
  const [agg] = await PriceHistory.aggregate([
    { $match: { symbol: symbol.toUpperCase(), ts: { $gte: since } } },
    { $group: { _id: null, high: { $max: '$price' }, low: { $min: '$price' } } },
  ])
  return { week52High: round(agg?.high), week52Low: round(agg?.low) }
}

/**
 * Compute what we can from filings plus a current price.
 *
 * `quarters` must be newest-first, as stored. `price` may be null — the
 * fundamentals that do not involve price are still returned.
 */
export function computeMetrics(quarters, price) {
  if (!quarters?.length) return {}

  const revenueTTM = ttm(quarters, 'revenue')
  const netIncomeTTM = ttm(quarters, 'netIncome')
  const operatingIncomeTTM = ttm(quarters, 'operatingIncome')
  const grossProfitTTM = ttm(quarters, 'grossProfit')

  const shares = latest(quarters, 'sharesOutstanding')
  const equity = latest(quarters, 'equity')
  const assets = latest(quarters, 'assets')
  const liabilities = latest(quarters, 'liabilities')

  const marketCap = price != null && shares != null ? price * shares : null
  const epsTTM = ratio(netIncomeTTM, shares)
  const bookValue = ratio(equity, shares)

  /**
   * A price/earnings ratio needs positive earnings to mean anything. For a
   * loss-making company the arithmetic yields a negative number that reads like
   * a cheap valuation, so it is reported as absent instead — Intel's loss-making
   * quarters are exactly the case this protects.
   */
  const peRatio = netIncomeTTM > 0 ? ratio(marketCap, netIncomeTTM) : null

  return {
    revenueTTM,
    netIncomeTTM,
    grossProfitTTM,
    sharesOutstanding: shares,
    marketCap: round(marketCap, 0),
    eps: round(epsTTM),
    bookValue: round(bookValue),
    peRatio: round(peRatio),
    priceToBook: round(ratio(marketCap, equity)),
    priceToSales: round(ratio(marketCap, revenueTTM)),
    profitMargin: round(ratio(netIncomeTTM, revenueTTM), 4),
    operatingMargin: round(ratio(operatingIncomeTTM, revenueTTM), 4),
    grossMargin: round(ratio(grossProfitTTM, revenueTTM), 4),
    returnOnEquity: round(ratio(netIncomeTTM, equity), 4),
    debtToEquity: round(ratio(liabilities, equity)),
    totalAssets: assets,
    totalEquity: equity,
  }
}

/** Which of these the provider owns and we cannot derive. */
export const PROVIDER_ONLY = [
  'forwardPE',
  'pegRatio',
  'analystTargetPrice',
  'beta',
  'dividendYield',
]
