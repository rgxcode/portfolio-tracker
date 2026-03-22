/**
 * Composable for fetching market price data.
 *
 * Crypto prices: CoinGecko public API (free, no key required for basic use).
 *   Optional: set NUXT_PUBLIC_COINGECKO_API_KEY in .env for higher rate limits.
 *
 * Stock prices: Alpha Vantage API (free key required).
 *   Set NUXT_PUBLIC_ALPHA_VANTAGE_API_KEY in .env.
 *   Get a free key at https://www.alphavantage.co/support/#api-key
 */

import { usePortfolioStore } from '~/stores/portfolio'

// Map of common symbols to CoinGecko IDs
const COINGECKO_ID_MAP: Record<string, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
  bnb: 'binancecoin',
  xrp: 'ripple',
  ada: 'cardano',
  doge: 'dogecoin',
  dot: 'polkadot',
  avax: 'avalanche-2',
  matic: 'matic-network',
  link: 'chainlink',
  uni: 'uniswap',
  ltc: 'litecoin',
  atom: 'cosmos',
  xlm: 'stellar',
  near: 'near',
  algo: 'algorand',
  icp: 'internet-computer',
  shib: 'shiba-inu',
  trx: 'tron',
}

export function useMarketData() {
  const config = useRuntimeConfig()
  const store = usePortfolioStore()

  /**
   * Fetches current prices for all crypto assets in the portfolio via CoinGecko.
   */
  async function fetchCryptoPrices(symbols: string[]): Promise<void> {
    if (symbols.length === 0) return

    const coinIds = symbols
      .map(s => COINGECKO_ID_MAP[s.toLowerCase()])
      .filter(Boolean)

    if (coinIds.length === 0) return

    const apiKey = config.public.coinGeckoApiKey
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    }
    if (apiKey) {
      headers['x-cg-demo-api-key'] = apiKey
    }

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(',')}&vs_currencies=usd&include_24hr_change=true`

    const data = await $fetch<Record<string, { usd: number, usd_24h_change: number }>>(url, { headers })

    // Map results back to symbols
    symbols.forEach((symbol) => {
      const id = COINGECKO_ID_MAP[symbol.toLowerCase()]
      if (id && data[id]) {
        store.updateAssetPrice(symbol, data[id].usd, data[id].usd_24h_change ?? 0)
      }
    })
  }

  /**
   * Fetches current price for a single stock via Alpha Vantage.
   * Requires NUXT_PUBLIC_ALPHA_VANTAGE_API_KEY to be set in .env
   */
  async function fetchStockPrice(symbol: string): Promise<void> {
    const apiKey = config.public.alphaVantageApiKey
    if (!apiKey || apiKey === 'YOUR_ALPHA_VANTAGE_API_KEY') {
      console.warn(`[Portfolio Tracker] Alpha Vantage API key not set. Stock prices for ${symbol} will not be updated. Add NUXT_PUBLIC_ALPHA_VANTAGE_API_KEY to your .env file.`)
      return
    }

    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol.toUpperCase()}&apikey=${apiKey}`
    const data = await $fetch<{ 'Global Quote': Record<string, string> }>(url)

    const quote = data?.['Global Quote']
    if (quote && quote['05. price']) {
      const price = parseFloat(quote['05. price'])
      const changePercent = parseFloat(
        (quote['10. change percent'] ?? '0%').replace('%', ''),
      )
      store.updateAssetPrice(symbol, price, changePercent)
    }
  }

  /**
   * Refreshes all asset prices in the portfolio.
   */
  async function refreshAllPrices(): Promise<void> {
    store.setLoading(true)
    store.setError(null)

    try {
      const cryptoSymbols = store.assets
        .filter(a => a.type === 'crypto')
        .map(a => a.symbol)

      const stockSymbols = store.assets
        .filter(a => a.type === 'stock')
        .map(a => a.symbol)

      const tasks: Promise<void>[] = []

      if (cryptoSymbols.length > 0) {
        tasks.push(fetchCryptoPrices(cryptoSymbols))
      }

      for (const sym of stockSymbols) {
        tasks.push(fetchStockPrice(sym))
      }

      await Promise.allSettled(tasks)
      store.setLastRefreshed(new Date().toISOString())
      store.persist()
    }
    catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch prices'
      store.setError(message)
    }
    finally {
      store.setLoading(false)
    }
  }

  return {
    refreshAllPrices,
    fetchCryptoPrices,
    fetchStockPrice,
    COINGECKO_ID_MAP,
  }
}
