import { defineStore } from 'pinia'

export interface Asset {
  id: string
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
    addAsset(asset: Omit<Asset, 'id' | 'currentPrice' | 'change24h' | 'lastUpdated'>) {
      const newAsset: Asset = {
        ...asset,
        id: `${asset.symbol}-${Date.now()}`,
        currentPrice: asset.purchasePrice,
        change24h: 0,
        lastUpdated: null,
      }
      this.assets.push(newAsset)
      this.persist()
    },

    removeAsset(id: string) {
      this.assets = this.assets.filter(a => a.id !== id)
      this.persist()
    },

    updateAssetPrice(symbol: string, price: number, change24h: number) {
      const asset = this.assets.find(
        a => a.symbol.toLowerCase() === symbol.toLowerCase(),
      )
      if (asset) {
        asset.currentPrice = price
        asset.change24h = change24h
        asset.lastUpdated = new Date().toISOString()
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

    persist() {
      if (import.meta.client) {
        localStorage.setItem('portfolio-assets', JSON.stringify(this.assets))
      }
    },

    loadFromStorage() {
      if (import.meta.client) {
        const stored = localStorage.getItem('portfolio-assets')
        if (stored) {
          try {
            this.assets = JSON.parse(stored)
          }
          catch {
            this.assets = []
          }
        }
      }
    },
  },
})
