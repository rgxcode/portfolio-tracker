/**
 * Chart history, served entirely by our own backend.
 *
 * The series comes from the price history we collect ourselves (the 5-minute
 * job plus the one-time backfill), so the browser makes no third-party calls:
 * no API keys in the bundle, no CORS, and no rate limit that grows with how
 * often someone clicks a time period.
 */

export type TimePeriod = '1H' | '1D' | '1W' | '1M' | 'YTD' | '1Y' | 'ALL'

interface PricePoint {
  timestamp: number
  price: number
}

// Cached per symbol+period for the lifetime of the page. Cleared by the refresh
// button. Only successful, non-empty responses are cached so a transient
// failure doesn't stick.
const cache = new Map<string, PricePoint[]>()

export function useHistoricalPrices() {
  const config = useRuntimeConfig()

  async function fetchAssetHistory(
    symbol: string,
    _type: 'crypto' | 'stock',
    period: TimePeriod,
  ): Promise<PricePoint[]> {
    const key = `${symbol.toUpperCase()}:${period}`
    const cached = cache.get(key)
    if (cached) return cached

    try {
      const data = await $fetch<{ points: PricePoint[] }>(
        `${config.public.apiBaseUrl}/api/prices/${encodeURIComponent(symbol)}/history`,
        { params: { period } },
      )
      const points = data.points ?? []
      if (points.length > 0) cache.set(key, points)
      return points
    } catch {
      return []
    }
  }

  /**
   * Histories for several stocks. These are plain reads from our own database,
   * so unlike the old provider-backed version there is nothing to stagger and
   * they can all go at once.
   */
  async function fetchAllStockHistories(
    stocks: { symbol: string, type: 'stock' }[],
    period: TimePeriod,
  ): Promise<Map<string, PricePoint[]>> {
    const results = await Promise.all(
      stocks.map(async s => [s.symbol, await fetchAssetHistory(s.symbol, 'stock', period)] as const),
    )
    return new Map(results)
  }

  /** Clear cached series (e.g. on manual refresh). */
  function clearCache() {
    cache.clear()
  }

  return { fetchAssetHistory, fetchAllStockHistories, clearCache }
}
