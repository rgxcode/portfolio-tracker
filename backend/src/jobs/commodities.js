/**
 * Spot metals, priced from the front-month futures contract on Yahoo.
 *
 * A small fixed list rather than a fetched one: there is no ranking to track,
 * the set changes about never, and each entry needs a hand-checked mapping to
 * the right contract — a wrong ticker here would price copper as something else
 * entirely and nothing downstream would notice.
 *
 * Symbols are the plain words rather than the metal codes (XAU, XAG). Those are
 * correct but unreadable, and the search is already scoped by asset type — so
 * GOLD under Commodities means the metal, while GOLD under Stocks still finds
 * Barrick, which is what someone typing it in each place expects.
 */

import { consume } from './rateBudget.js'
import { formatCET } from './marketHours.js'

const CHART = 'https://query1.finance.yahoo.com/v8/finance/chart'

export const COMMODITIES = {
  GOLD: { yahoo: 'GC=F', name: 'Gold', unit: 'troy ounce' },
  SILVER: { yahoo: 'SI=F', name: 'Silver', unit: 'troy ounce' },
  COPPER: { yahoo: 'HG=F', name: 'Copper', unit: 'pound' },
}

export const COMMODITY_SYMBOLS = Object.keys(COMMODITIES)

export function isCommodity(symbol) {
  return Object.hasOwn(COMMODITIES, String(symbol).toUpperCase())
}

/** Yahoo's contract symbol, URL-encoded — these all contain '='. */
export function yahooSymbol(symbol) {
  const c = COMMODITIES[String(symbol).toUpperCase()]
  return c ? encodeURIComponent(c.yahoo) : null
}

const log = (...a) => console.log(`[${formatCET()}] commodities:`, ...a)

/**
 * Current prices for every tracked metal.
 *
 * Futures trade nearly around the clock, so unlike equities these are not
 * gated by the exchange window — there is almost always a fresh price.
 */
export async function fetchCommodityPrices() {
  const prices = {}

  for (const [symbol, meta] of Object.entries(COMMODITIES)) {
    if (!(await consume('yahoo'))) {
      log('daily Yahoo budget exhausted — skipping the rest')
      break
    }

    try {
      const res = await fetch(
        `${CHART}/${encodeURIComponent(meta.yahoo)}?interval=1d&range=5d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const m = (await res.json())?.chart?.result?.[0]?.meta
      if (typeof m?.regularMarketPrice !== 'number') throw new Error('no price in response')

      const asOf = m.regularMarketTime
        ? new Date(m.regularMarketTime * 1000).toISOString()
        : new Date().toISOString()

      const previous = m.chartPreviousClose ?? m.previousClose ?? null
      prices[symbol] = {
        symbol,
        name: meta.name,
        type: 'commodity',
        price: m.regularMarketPrice,
        change24h: previous ? ((m.regularMarketPrice - previous) / previous) * 100 : 0,
        unit: meta.unit,
        currency: m.currency ?? 'USD',
        asOf,
        asOfCET: formatCET(asOf),
        source: 'yahoo',
      }
    } catch (err) {
      log(`${symbol}: ${err.message}`)
    }
  }

  return prices
}
