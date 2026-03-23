import { useMarketData } from '~/composables/useMarketData'

export type TimePeriod = '1H' | '1D' | '1W' | '1M' | 'YTD' | '1Y' | 'ALL'

interface PricePoint {
  timestamp: number
  price: number
}

// CoinGecko market_chart params per time period
const CG_PARAMS: Record<TimePeriod, { days: string; interval?: string }> = {
  '1H':  { days: '1',   interval: undefined },
  '1D':  { days: '1' },
  '1W':  { days: '7' },
  '1M':  { days: '30' },
  'YTD': { days: '365' },
  '1Y':  { days: '365' },
  'ALL': { days: 'max' },
}

function cutoffTimestamp(period: TimePeriod): number {
  const now = Date.now()
  switch (period) {
    case '1H':  return now - 60 * 60 * 1000
    case '1D':  return now - 24 * 60 * 60 * 1000
    case '1W':  return now - 7 * 24 * 60 * 60 * 1000
    case '1M':  return now - 30 * 24 * 60 * 60 * 1000
    case 'YTD': return new Date(new Date().getFullYear(), 0, 1).getTime()
    case '1Y':  return now - 365 * 24 * 60 * 60 * 1000
    case 'ALL': return 0
  }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// ── Caches: fetch once per stock, derive all periods client-side ───
// Only populated on successful responses — empty/error results are NOT cached
const stockDailyCache = new Map<string, PricePoint[]>()
const stockIntradayCache = new Map<string, PricePoint[]>()

export function useHistoricalPrices() {
  const config = useRuntimeConfig()
  const { COINGECKO_ID_MAP } = useMarketData()

  async function fetchCryptoHistory(symbol: string, period: TimePeriod): Promise<PricePoint[]> {
    const cgId = COINGECKO_ID_MAP[symbol.toLowerCase()]
    if (!cgId) return []

    const params = CG_PARAMS[period]
    const apiKey = config.public.coinGeckoApiKey
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (apiKey) headers['x-cg-demo-api-key'] = apiKey

    let url = `https://api.coingecko.com/api/v3/coins/${cgId}/market_chart?vs_currency=usd&days=${params.days}`
    if (params.interval) url += `&interval=${params.interval}`

    try {
      const data = await $fetch<{ prices: [number, number][] }>(url, { headers })
      const cutoff = cutoffTimestamp(period)
      return data.prices
        .filter(([ts]) => ts >= cutoff)
        .map(([timestamp, price]) => ({ timestamp, price }))
    } catch {
      return []
    }
  }

  /**
   * Fetch and cache Alpha Vantage daily data for a stock symbol.
   * Uses compact output (~100 trading days). Only caches successful results.
   */
  async function ensureStockDailyCache(symbol: string): Promise<PricePoint[]> {
    const key = symbol.toUpperCase()
    if (stockDailyCache.has(key)) return stockDailyCache.get(key)!

    const apiKey = config.public.alphaVantageApiKey
    if (!apiKey) return []

    try {
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(key)}&apikey=${apiKey}&outputsize=compact`
      const data = await $fetch<Record<string, any>>(url)
      const seriesKey = Object.keys(data).find(k => k.startsWith('Time Series'))
      if (!seriesKey) return [] // rate limited or error — do NOT cache so we can retry

      const series = data[seriesKey] as Record<string, Record<string, string>>
      const points: PricePoint[] = []
      for (const [dateStr, values] of Object.entries(series)) {
        points.push({ timestamp: new Date(dateStr).getTime(), price: parseFloat(values['4. close']) })
      }
      points.sort((a, b) => a.timestamp - b.timestamp)
      stockDailyCache.set(key, points)
      return points
    } catch {
      return [] // don't cache — allow retry
    }
  }

  /**
   * Fetch and cache Alpha Vantage intraday (5min) data for a stock symbol.
   * Only caches successful results.
   */
  async function ensureStockIntradayCache(symbol: string): Promise<PricePoint[]> {
    const key = symbol.toUpperCase()
    if (stockIntradayCache.has(key)) return stockIntradayCache.get(key)!

    const apiKey = config.public.alphaVantageApiKey
    if (!apiKey) return []

    try {
      const url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(key)}&interval=5min&apikey=${apiKey}&outputsize=compact`
      const data = await $fetch<Record<string, any>>(url)
      const seriesKey = Object.keys(data).find(k => k.startsWith('Time Series'))
      if (!seriesKey) return []

      const series = data[seriesKey] as Record<string, Record<string, string>>
      const points: PricePoint[] = []
      for (const [dateStr, values] of Object.entries(series)) {
        points.push({ timestamp: new Date(dateStr).getTime(), price: parseFloat(values['4. close']) })
      }
      points.sort((a, b) => a.timestamp - b.timestamp)
      stockIntradayCache.set(key, points)
      return points
    } catch {
      return []
    }
  }

  async function fetchStockHistory(symbol: string, period: TimePeriod): Promise<PricePoint[]> {
    const cutoff = cutoffTimestamp(period)
    let allPoints: PricePoint[]

    if (period === '1H' || period === '1D') {
      allPoints = await ensureStockIntradayCache(symbol)
      if (allPoints.length === 0) {
        allPoints = await ensureStockDailyCache(symbol)
      }
    } else {
      allPoints = await ensureStockDailyCache(symbol)
    }

    return allPoints.filter(p => p.timestamp >= cutoff)
  }

  /**
   * Fetch history for multiple stock symbols sequentially with a delay
   * to respect Alpha Vantage rate limits (5 requests/minute).
   */
  async function fetchAllStockHistories(
    stocks: { symbol: string; type: 'stock' }[],
    period: TimePeriod,
  ): Promise<Map<string, PricePoint[]>> {
    const result = new Map<string, PricePoint[]>()
    for (let i = 0; i < stocks.length; i++) {
      if (i > 0) await delay(1500) // stagger requests to avoid rate limit
      const points = await fetchStockHistory(stocks[i].symbol, period)
      result.set(stocks[i].symbol, points)
    }
    return result
  }

  async function fetchAssetHistory(
    symbol: string,
    type: 'crypto' | 'stock',
    period: TimePeriod,
  ): Promise<PricePoint[]> {
    return type === 'crypto'
      ? fetchCryptoHistory(symbol, period)
      : fetchStockHistory(symbol, period)
  }

  /** Clear caches (e.g. on manual refresh) */
  function clearCache() {
    stockDailyCache.clear()
    stockIntradayCache.clear()
  }

  return { fetchAssetHistory, fetchAllStockHistories, clearCache }
}
