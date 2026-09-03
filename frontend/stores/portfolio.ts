import { defineStore } from 'pinia'
import { useApi } from '~/composables/useApi'

export interface Asset {
  /** Provider logo, set for crypto; equities derive theirs from the ticker. */
  image?: string | null
  id: string
  _id?: string
  symbol: string
  name: string
  type: 'crypto' | 'stock' | 'commodity' | 'cash'
  /** Cash only: the ISO 4217 code the balance is held in. */
  currency?: string | null
  quantity: number
  purchasePrice: number
  currentPrice: number
  change24h: number
  lastUpdated: string | null
  /** When the price itself was taken (exchange/source timestamp, not fetch time). */
  priceAsOf?: string | null
  /** The same instant rendered in central European time, e.g. "19 Aug 2026, 22:00:01 CEST". */
  priceAsOfCET?: string | null
  /** Which provider the price came from. */
  priceSource?: string | null
  /**
   * Yahoo's word for the instrument — EQUITY, ETF, MUTUALFUND — carried on the
   * quote rather than stored on the holding, so it corrects itself as quotes
   * arrive instead of needing a migration. See utils/assetClass.
   */
  instrumentType?: string | null
}

/**
 * One recorded trade. Holdings say what is owned; these say how it got that
 * way, so a sale is a thing that happened rather than a quantity that silently
 * shrank.
 */
export interface Transaction {
  id: string
  _id?: string
  symbol: string
  name: string
  type: 'crypto' | 'stock' | 'commodity' | 'cash'
  side: 'buy' | 'sell'
  quantity: number
  /** What one unit changed hands at, in USD. */
  unitPrice: number
  date: string
  currency?: string | null
  /** Sells only: proceeds less the average cost at the moment of sale. */
  realizedPnl?: number | null
}

export interface PortfolioState {
  assets: Asset[]
  transactions: Transaction[]
  isLoading: boolean
  lastRefreshed: string | null
  error: string | null
}

function normalizeAsset(raw: any): Asset {
  return {
    ...raw,
    id: raw._id || raw.id,
  }
}

export const usePortfolioStore = defineStore('portfolio', {
  state: (): PortfolioState => ({
    assets: [],
    transactions: [],
    isLoading: false,
    lastRefreshed: null,
    error: null,
  }),

  getters: {
    totalValue(state): number {
      return state.assets.reduce(
        (sum, asset) => sum + asset.currentPrice * asset.quantity,
        0,
      )
    },

    totalCost(state): number {
      return state.assets.reduce(
        (sum, asset) => sum + asset.purchasePrice * asset.quantity,
        0,
      )
    },

    totalProfitLoss(): number {
      return this.totalValue - this.totalCost
    },

    totalProfitLossPercent(): number {
      if (this.totalCost === 0) return 0
      return (this.totalProfitLoss / this.totalCost) * 100
    },

    allocationData(state): { labels: string[], values: number[], colors: string[] } {
      const labels: string[] = []
      const values: number[] = []
      const colors: string[] = []

      const palette = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
        '#a855f7', '#eab308', '#6366f1', '#22c55e', '#fb923c',
      ]

      state.assets.forEach((asset, i) => {
        const value = asset.currentPrice * asset.quantity
        if (value > 0) {
          labels.push(asset.symbol.toUpperCase())
          values.push(parseFloat(value.toFixed(2)))
          colors.push(palette[i % palette.length])
        }
      })

      return { labels, values, colors }
    },

    sortedAssets(state): Asset[] {
      return [...state.assets].sort(
        (a, b) => b.currentPrice * b.quantity - a.currentPrice * a.quantity,
      )
    },
  },

  actions: {
    async fetchAssets() {
      const { apiFetch } = useApi()
      this.isLoading = true
      this.error = null
      try {
        const data = await apiFetch<any[]>('/api/assets')
        this.assets = data.map(normalizeAsset)
      } catch (err: any) {
        this.error = err?.data?.error || err?.message || 'Failed to load assets'
      } finally {
        this.isLoading = false
      }
    },

    async addAsset(asset: Omit<Asset, 'id' | '_id' | 'currentPrice' | 'change24h' | 'lastUpdated'>) {
      const { apiFetch } = useApi()
      try {
        const saved = normalizeAsset(await apiFetch<any>('/api/assets', {
          method: 'POST',
          body: asset,
        }))
        // Adding to something already held folds into that row rather than
        // making a second one, so the reply can be an existing holding. Putting
        // it back at the top unconditionally would show the same asset twice —
        // exactly the fault the merge exists to prevent, reintroduced in the
        // client.
        const idx = this.assets.findIndex(a => a.id === saved.id)
        if (idx === -1) this.assets.unshift(saved)
        else this.assets[idx] = { ...this.assets[idx], ...saved }
      } catch (err: any) {
        this.error = err?.data?.error || err?.message || 'Failed to add asset'
        throw err
      }
    },

    /**
     * Correct a holding in place.
     *
     * Adding to a position folds into it rather than making a second row, so a
     * mistyped quantity can no longer be fixed by deleting one of two rows —
     * there has to be a way to set the position outright.
     */
    async updateAsset(
      id: string,
      patch: { name?: string, quantity?: number, purchasePrice?: number },
    ) {
      const { apiFetch } = useApi()
      try {
        const saved = normalizeAsset(await apiFetch<any>(`/api/assets/${id}`, {
          method: 'PATCH',
          body: patch,
        }))
        const idx = this.assets.findIndex(a => a.id === id)
        // Merged over the existing row rather than replacing it: the reply
        // carries what is stored, while the live price and its timestamps are
        // only ever known here.
        if (idx !== -1) this.assets[idx] = { ...this.assets[idx], ...saved }
      } catch (err: any) {
        this.error = err?.data?.error || err?.message || 'Failed to update asset'
        throw err
      }
    },

    async fetchTransactions(symbol?: string) {
      const { apiFetch } = useApi()
      try {
        const rows = await apiFetch<any[]>(
          `/api/transactions${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ''}`,
        )
        this.transactions = rows.map(r => ({ ...r, id: r._id || r.id }))
      } catch {
        // The ledger is supporting detail; failing to load it must not take
        // the holdings down with it.
      }
    },

    /**
     * Record a trade and apply what it did to the position.
     *
     * The reply carries the holding as it now stands, so the client never
     * recomputes the arithmetic the server just did — the two cannot drift.
     * A sale that emptied the position returns no asset at all, which is the
     * signal to drop the row rather than leave one showing zero.
     */
    async addTransaction(tx: {
      symbol: string
      name?: string
      type: Asset['type']
      side: 'buy' | 'sell'
      quantity: number
      unitPrice: number
      date: string
      currency?: string | null
    }) {
      const { apiFetch } = useApi()
      try {
        const res = await apiFetch<any>('/api/transactions', { method: 'POST', body: tx })

        if (res.closed) {
          this.assets = this.assets.filter(a => a.symbol.toUpperCase() !== tx.symbol.toUpperCase())
        } else if (res.asset) {
          const saved = normalizeAsset(res.asset)
          const idx = this.assets.findIndex(a => a.id === saved.id)
          if (idx === -1) this.assets.unshift(saved)
          else this.assets[idx] = { ...this.assets[idx], ...saved }
        }

        if (res.transaction) {
          this.transactions.unshift({ ...res.transaction, id: res.transaction._id })
        }
        return res
      } catch (err: any) {
        this.error = err?.data?.error || err?.message || 'Failed to record the transaction'
        throw err
      }
    },

    async removeAsset(id: string) {
      const { apiFetch } = useApi()
      try {
        await apiFetch(`/api/assets/${id}`, { method: 'DELETE' })
        this.assets = this.assets.filter(a => a.id !== id)
      } catch (err: any) {
        this.error = err?.data?.error || err?.message || 'Failed to remove asset'
        throw err
      }
    },

    /**
     * `persist: false` updates local state only. Used by the LLM poll loop —
     * writing every asset back to Mongo every few seconds would be pure write
     * amplification, and prices.json is the source of truth anyway.
     */
    async updateAssetPrice(
      id: string,
      currentPrice: number,
      change24h: number,
      meta?: {
        asOf?: string
        asOfCET?: string
        source?: string
        image?: string | null
        instrumentType?: string | null
      },
      persist = true,
    ) {
      // Update local state immediately so the UI reflects fresh prices
      const idx = this.assets.findIndex(a => a.id === id)
      if (idx !== -1) {
        this.assets[idx] = {
          ...this.assets[idx],
          currentPrice,
          change24h,
          lastUpdated: new Date().toISOString(),
          // When the price was taken, which for a closed market is well before now
          priceAsOf: meta?.asOf ?? null,
          priceAsOfCET: meta?.asOfCET ?? null,
          priceSource: meta?.source ?? null,
          // Keep any logo already known rather than blanking it on a poll that
          // happens to carry none.
          image: meta?.image ?? this.assets[idx].image ?? null,
          // Same reasoning: a quote from the fallback provider carries no
          // instrument type, and forgetting one we already had would drop a
          // fund back among the companies until the next good quote.
          instrumentType: meta?.instrumentType ?? this.assets[idx].instrumentType ?? null,
        }
      }
      if (!persist) return

      // Persist to backend (fire-and-forget)
      const { apiFetch } = useApi()
      try {
        await apiFetch(`/api/assets/${id}/price`, {
          method: 'PATCH',
          body: { currentPrice, change24h },
        })
      } catch {
        // Backend sync failed — local state already updated
      }
    },

    setLoading(loading: boolean) {
      this.isLoading = loading
    },

    setError(error: string | null) {
      this.error = error
    },

    setLastRefreshed(date: string) {
      this.lastRefreshed = date
    },
  },
})
