import { useMarketData } from '~/composables/useMarketData'

export type TimePeriod = '1H' | '1D' | '1W' | '1M' | 'YTD' | '1Y' | 'ALL'

interface PricePoint {
  timestamp: number
  price: number
}

// CoinGecko market_chart params per time period
const CG_PARAMS: Record<TimePeriod, { days: string; interval?: string }> = {
  '1H':  { days: '1',   interval: undefined },   // 5-min granularity auto
  '1D':  { days: '1' },
  '1W':  { days: '7' },
  '1M':  { days: '30' },
  'YTD': { days: '365' },                        // will be trimmed client-side
  '1Y':  { days: '365' },
  'ALL': { days: 'max' },
}

// Alpha Vantage function per period
function avParams(period: TimePeriod): { fn: string; interval?: string; outputsize: string } {
  switch (period) {
    case '1H':
    case '1D':
      return { fn: 'TIME_SERIES_INTRADAY', interval: '5min', outputsize: 'full' }
    case '1W':
    case '1M':
      return { fn: 'TIME_SERIES_DAILY', outputsize: 'compact' }
    default:
      return { fn: 'TIME_SERIES_DAILY', outputsize: 'full' }
  }
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

  async function fetchStockHistory(symbol: string, period: TimePeriod): Promise<PricePoint[]> {
    const apiKey = config.public.alphaVantageApiKey
    if (!apiKey) return []

    const p = avParams(period)
    let url = `https://www.alphavantage.co/query?function=${p.fn}&symbol=${symbol.toUpperCase()}&apikey=${apiKey}&outputsize=${p.outputsize}`
    if (p.interval) url += `&interval=${p.interval}`

    try {
      const data = await $fetch<Record<string, any>>(url)
      // Alpha Vantage returns data under a key like "Time Series (5min)" or "Time Series (Daily)"
      const seriesKey = Object.keys(data).find(k => k.startsWith('Time Series'))
      if (!seriesKey) return []

      const series = data[seriesKey] as Record<string, Record<string, string>>
      const cutoff = cutoffTimestamp(period)
      const points: PricePoint[] = []

      for (const [dateStr, values] of Object.entries(series)) {
        const ts = new Date(dateStr).getTime()
        if (ts >= cutoff) {
          points.push({ timestamp: ts, price: parseFloat(values['4. close']) })
        }
      }

      return points.sort((a, b) => a.timestamp - b.timestamp)
    } catch {
      return []
    }
  }

  /**
   * Fetch historical price data for a single asset.
   */
  async function fetchAssetHistory(
    symbol: string,
    type: 'crypto' | 'stock',
    period: TimePeriod,
  ): Promise<PricePoint[]> {
    return type === 'crypto'
      ? fetchCryptoHistory(symbol, period)
      : fetchStockHistory(symbol, period)
  }

  return { fetchAssetHistory }
}
