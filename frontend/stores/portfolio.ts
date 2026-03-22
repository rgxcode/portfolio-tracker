import { defineStore } from 'pinia'
import { useApi } from '~/composables/useApi'

export interface Asset {
  id: string
  _id?: string
  symbol: string
  name: string
  type: 'crypto' | 'stock'
  quantity: number
  purchasePrice: number
  currentPrice: number
  change24h: number
  lastUpdated: string | null
}

export interface PortfolioState {
  assets: Asset[]
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
        const created = await apiFetch<any>('/api/assets', {
          method: 'POST',
          body: asset,
        })
        this.assets.unshift(normalizeAsset(created))
      } catch (err: any) {
        this.error = err?.data?.error || err?.message || 'Failed to add asset'
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

    async updateAssetPrice(id: string, currentPrice: number, change24h: number) {
      const { apiFetch } = useApi()
      try {
        const updated = await apiFetch<any>(`/api/assets/${id}/price`, {
          method: 'PATCH',
          body: { currentPrice, change24h },
        })
        const idx = this.assets.findIndex(a => a.id === id)
        if (idx !== -1) {
          this.assets[idx] = normalizeAsset(updated)
        }
      } catch {
        // Silently fail price updates — they'll retry on next refresh
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
