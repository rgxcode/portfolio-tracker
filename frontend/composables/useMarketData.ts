/**
 * Composable for reading market price data.
 *
 * Every price comes from our own backend (`/api/prices`), which serves the
 * snapshot written by the scheduled job in backend/src/jobs/. The browser makes
 * no third-party calls, so there are no API keys in this bundle, no CORS, and
 * no provider rate limit that scales with page views.
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

  /** Shape of one quote in the snapshot our backend serves. */
  interface Quote {
    price: number
    change24h: number
    asOf: string
    asOfCET: string
    source: string
    /** Set for crypto only; equity logos are derived from the ticker. */
    image?: string | null
  }

  interface PriceSnapshot {
    updatedAt: string
    updatedAtCET: string
    ageMinutes: number
    eurRate: number
    crypto: Record<string, Quote>
    stocks: Record<string, Quote>
    commodities?: Record<string, Quote>
    stocksUpdatedAtCET: string | null
    stocksAgeMinutes: number | null
    stockWindow: { open: boolean, status: string, hoursCET: string }
    /** Units of each currency per US dollar. Cash is priced from this. */
    fxRates?: Record<string, number> | null
  }

  /** Window status from the last snapshot, for display in the UI. */
  const stockWindow = useState<PriceSnapshot['stockWindow'] | null>('stockWindow', () => null)
  const snapshotCET = useState<string | null>('snapshotCET', () => null)
  // The same instant as snapshotCET, kept machine-readable so the UI can show
  // how old the data is rather than only when it was taken.
  const snapshotAt = useState<string | null>('snapshotAt', () => null)
  /** Coins the backend actually tracks — the list the Add Asset form validates against. */
  const supportedCrypto = useState<string[]>('supportedCrypto', () => [])
  /** Currencies a cash balance can be held in, and what each is worth. */
  const fxRates = useState<Record<string, number> | null>('fxRates', () => null)

  /**
   * Which snapshot the dashboard reads.
   *   'standard' — the 5-minute job (CoinGecko + Yahoo), covers crypto and stocks
   *   'llm'      — the OpenCode agent reading prices off web pages, crypto only
   * Persisted so a reload keeps the choice.
   */
  const priceSource = useState<'standard' | 'llm'>('priceSource', () => 'standard')

  function loadSourcePreference() {
    if (!import.meta.client) return
    const saved = localStorage.getItem('priceSource')
    if (saved === 'llm' || saved === 'standard') priceSource.value = saved
  }

  function setPriceSource(source: 'standard' | 'llm') {
    priceSource.value = source
    if (import.meta.client) localStorage.setItem('priceSource', source)
  }

  /**
   * Ensure we know which symbols the backend tracks, without forcing a full
   * price refresh. Used by forms that render before any dashboard fetch.
   */
  async function loadSupportedCrypto(): Promise<string[]> {
    if (supportedCrypto.value.length > 0) return supportedCrypto.value
    try {
      const data = await $fetch<PriceSnapshot>(`${config.public.apiBaseUrl}/api/prices`)
      supportedCrypto.value = Object.keys(data.crypto ?? {})
    } catch {
      // Backend unreachable — fall back to the built-in list.
      supportedCrypto.value = Object.keys(COINGECKO_ID_MAP).map(s => s.toUpperCase())
    }
    return supportedCrypto.value
  }

  /**
   * One call fetches every price the portfolio needs. The backend serves the
   * snapshot written by the scheduled job (backend/src/jobs/fetchPrices.js), so
   * the browser never touches CoinGecko, Yahoo or Alpha Vantage — no CORS, and
   * no rate limit that scales with page views.
   */
  async function fetchAllPrices({ persist = true } = {}): Promise<void> {
    // One endpoint. Which job wrote a given price is an implementation detail
    // the backend resolves; the dashboard just asks for the latest.
    const data = await $fetch<PriceSnapshot>(`${config.public.apiBaseUrl}/api/prices`)

    // The LLM snapshot has no stock window; leave the standard one in place
    // rather than blanking the label when the user toggles.
    if (data.stockWindow) stockWindow.value = data.stockWindow
    snapshotCET.value = data.updatedAtCET
    snapshotAt.value = data.updatedAt
    supportedCrypto.value = Object.keys(data.crypto ?? {})

    if (data.fxRates) fxRates.value = data.fxRates

    for (const asset of store.assets) {
      /**
       * Cash is priced from the FX table rather than from a quote: one unit is
       * worth whatever a dollar buys of it, inverted. A dollar is worth a
       * dollar, so USD never needs a rate and never waits on one.
       */
      if (asset.type === 'cash') {
        const code = (asset.currency ?? asset.symbol).toUpperCase()
        const rate = code === 'USD' ? 1 : data.fxRates?.[code]
        if (!rate) continue
        store.updateAssetPrice(asset.id, 1 / rate, 0, {
          asOf: data.updatedAt,
          asOfCET: data.updatedAtCET,
          source: code === 'USD' ? 'base currency' : 'ECB reference rate',
        }, persist)
        continue
      }

      const bucket = asset.type === 'crypto'
        ? data.crypto
        : asset.type === 'commodity'
          ? data.commodities
          : data.stocks
      const quote = bucket?.[asset.symbol.toUpperCase()]
      if (!quote) continue

      store.updateAssetPrice(asset.id, quote.price, quote.change24h ?? 0, {
        asOf: quote.asOf,
        asOfCET: quote.asOfCET,
        source: quote.source,
        // Crypto logos travel with the quote; equity logos derive from the
        // ticker, so there is nothing to carry for those.
        image: quote.image ?? null,
      }, persist)
    }
  }

  /**
   * Quiet refresh for the poll loop: no spinner, no database writes, no error
   * banner — a single failed poll shouldn't flash an error over live data.
   */
  async function pollPrices(): Promise<void> {
    try {
      await fetchAllPrices({ persist: false })
    } catch {
      // Next tick will try again.
    }
  }

  /**
   * Refreshes all asset prices in the portfolio.
   */
  async function refreshAllPrices(): Promise<void> {
    store.setLoading(true)
    store.setError(null)

    try {
      await fetchAllPrices()
      store.setLastRefreshed(new Date().toISOString())
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
    fetchAllPrices,
    pollPrices,
    loadSupportedCrypto,
    supportedCrypto,
    stockWindow,
    fxRates,
    snapshotCET,
    snapshotAt,
    priceSource,
    setPriceSource,
    loadSourcePreference,
    COINGECKO_ID_MAP,
  }
}
