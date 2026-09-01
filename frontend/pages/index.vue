<template>
  <div>
    <!-- Error banner -->
    <div v-if="store.error" class="mb-4 bg-red-900/30 border border-red-700 rounded-xl p-3 flex items-center gap-3">
      <svg class="w-5 h-5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p class="text-red-300 text-sm">{{ store.error }}</p>
    </div>

    <!-- Empty state -->
    <div v-if="!store.isLoading && store.assets.length === 0" class="text-center py-20">
      <div class="bg-gray-800 rounded-2xl p-10 max-w-md mx-auto border border-gray-700">
        <svg class="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2 class="text-xl font-bold text-white mb-2">No assets yet</h2>
        <p class="text-gray-400 mb-6 text-sm">Start by adding your first investment to track your portfolio performance.</p>
        <NuxtLink
          to="/assets"
          class="inline-block px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          Add Your First Asset
        </NuxtLink>
      </div>
    </div>

    <!-- Look up any S&P 500 company without owning it -->
    <div class="flex items-center justify-between gap-3 mb-6 flex-wrap">
      <TickerSearch
        placeholder="Look up a ticker or company…"
        button-label="Open"
        width-class="w-64 sm:w-80"
        @select="openTicker"
      />
      <NuxtLink
        to="/compare"
        class="px-3 py-1.5 rounded-lg text-sm bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 transition-colors shrink-0"
      >
        Compare stocks
      </NuxtLink>
    </div>

    <template v-if="store.assets.length > 0">
      <!-- Asset type filter tabs -->
      <div class="flex items-center gap-2 mb-6">
        <button
          v-for="tab in assetTabs"
          :key="tab.value"
          class="px-4 py-1.5 rounded-full text-sm font-medium transition-colors border"
          :class="activeTab === tab.value
            ? 'bg-white text-gray-900 border-white'
            : 'bg-transparent text-gray-400 border-gray-600 hover:border-gray-400 hover:text-gray-200'"
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Named layouts, each with its own arrangement and column widths.
           Switching is one click; the editor behind "Customise" is opt-in, so
           the default view is the dashboard rather than its settings. -->
      <DashboardWorkspaceBar />

      <DashboardColumns />
    </template>
  </div>
</template>

<script setup lang="ts">
import { usePortfolioStore, type Asset } from '~/stores/portfolio'
import { useMarketData } from '~/composables/useMarketData'
import { useHistoricalPrices, type TimePeriod } from '~/composables/useHistoricalPrices'
import { useCurrency } from '~/composables/useCurrency'

definePageMeta({ middleware: 'auth' })

const store = usePortfolioStore()
const {
  refreshAllPrices, pollPrices, stockWindow, snapshotAt, snapshotCET,
} = useMarketData()

/**
 * Prices are rewritten by a scheduled job every ~5 minutes, so this only needs
 * to be frequent enough to notice a new snapshot, not to chase one.
 */
const POLL_MS = 30000
let pollTimer: ReturnType<typeof setInterval> | null = null

const now = ref(Date.now())

/** "just now" / "3 min ago" — how old the stored snapshot actually is. */
const snapshotAge = computed(() => {
  if (!snapshotAt.value) return ''
  const mins = Math.floor((now.value - new Date(snapshotAt.value).getTime()) / 60000)
  if (mins < 1) return 'Prices updated just now'
  if (mins === 1) return 'Prices updated 1 min ago'
  if (mins < 60) return `Prices updated ${mins} min ago`
  const hrs = Math.floor(mins / 60)
  return hrs === 1 ? 'Prices updated 1 hour ago' : `Prices updated ${hrs} hours ago`
})

function openTicker(symbol: string) {
  navigateTo({ path: '/asset', query: { symbol } })
}

/** Current price for one unit — what a share or a coin costs on its own. */
function unitPrice(asset: { currentPrice: number }) {
  const v = convert(asset.currentPrice ?? 0)
  if (!v) return '—'
  // Sub-cent assets need real precision; a five-figure one does not.
  const decimals = Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 1 ? 2 : 6
  return `${currencySymbol.value}${v.toLocaleString('en-US', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  })}`
}

async function pollTick() {
  await pollPrices()
  now.value = Date.now()
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(pollTick, POLL_MS)
}

/** Poll while the tab is visible; a hidden tab has nobody to inform. */
function syncPolling() {
  const visible = !import.meta.client || document.visibilityState === 'visible'
  if (visible) startPolling()
  else stopPolling()
}

onUnmounted(() => {
  stopPolling()
  if (import.meta.client) document.removeEventListener('visibilitychange', syncPolling)
})

const { fetchAssetHistory, fetchAllStockHistories, clearCache } = useHistoricalPrices()
const { selectedCurrency, currencySymbol, convert, toggleCurrency, loadPreference, fetchEurRate } = useCurrency()

// ── Asset type filter ───────────────────────────────────────────────
const assetTabs = [
  { label: 'All', value: 'all' },
  { label: 'Crypto', value: 'crypto' },
  { label: 'Stocks', value: 'stock' },
  { label: 'Commodities', value: 'commodity' },
] as const

type TabValue = 'all' | 'crypto' | 'stock' | 'commodity'
const activeTab = ref<TabValue>('all')

const filteredAssets = computed(() => {
  if (activeTab.value === 'all') return store.assets
  return store.assets.filter(a => a.type === activeTab.value)
})

const filteredTotalValue = computed(() =>
  filteredAssets.value.reduce((sum, a) => sum + a.currentPrice * a.quantity, 0),
)
const filteredTotalCost = computed(() =>
  filteredAssets.value.reduce((sum, a) => sum + a.purchasePrice * a.quantity, 0),
)
const filteredProfitLoss = computed(() => filteredTotalValue.value - filteredTotalCost.value)
const filteredPLPercent = computed(() => {
  if (filteredTotalCost.value === 0) return 0
  return (filteredProfitLoss.value / filteredTotalCost.value) * 100
})

// ── Sorting ─────────────────────────────────────────────────────────
const sortMode = ref('value-desc')

const sortedFilteredAssets = computed(() => {
  const arr = [...filteredAssets.value]
  switch (sortMode.value) {
    case 'gains-desc':
      return arr.sort((a, b) => assetGain(b) - assetGain(a))
    case 'gains-asc':
      return arr.sort((a, b) => assetGain(a) - assetGain(b))
    case 'pct-desc':
      return arr.sort((a, b) => assetGainPct(b) - assetGainPct(a))
    case 'pct-asc':
      return arr.sort((a, b) => assetGainPct(a) - assetGainPct(b))
    default: // value-desc
      return arr.sort((a, b) => b.currentPrice * b.quantity - a.currentPrice * a.quantity)
  }
})

// ── Period selection & chart data ───────────────────────────────────
const periods: TimePeriod[] = ['1H', '1D', '1W', '1M', 'YTD', '1Y', 'ALL']
const selectedPeriod = ref<TimePeriod>('1D')
const chartLabels = ref<string[]>([])
const chartValues = ref<number[]>([])
const chartLoading = ref(false)

async function loadChart() {
  const assets = filteredAssets.value
  if (assets.length === 0) {
    chartLabels.value = []
    chartValues.value = []
    return
  }

  chartLoading.value = true
  try {
    /**
     * Every holding is fetched the same way, whatever its type.
     *
     * This used to split into a crypto branch and a stock branch, staggered
     * against provider rate limits — an artefact of the days when the browser
     * called CoinGecko and Alpha Vantage directly. Both branches now read the
     * same endpoint backed by our own database, and the split had quietly
     * become a filter: a commodity matched neither branch, so gold was dropped
     * from the chart while still counting towards the total shown above it.
     */
    const histories = await Promise.all(
      assets.map(async asset => ({
        asset,
        points: await fetchAssetHistory(asset.symbol, asset.type, selectedPeriod.value),
      })),
    )

    // Find the asset with the most data points to use as the time axis
    const maxHistory = histories.reduce((a, b) => a.points.length >= b.points.length ? a : b)
    if (maxHistory.points.length === 0) {
      chartLabels.value = []
      chartValues.value = []
      return
    }

    const timestamps = maxHistory.points.map(p => p.timestamp)

    // For each timestamp, compute total portfolio value
    const values = timestamps.map((ts) => {
      let total = 0
      for (const { asset, points } of histories) {
        if (points.length === 0) {
          total += asset.currentPrice * asset.quantity
          continue
        }
        let price = points[0].price
        for (const pt of points) {
          if (pt.timestamp <= ts) price = pt.price
          else break
        }
        total += price * asset.quantity
      }
      return parseFloat(total.toFixed(2))
    })

    const formatter = labelFormatter(selectedPeriod.value)
    chartLabels.value = timestamps.map(formatter)
    chartValues.value = values
  } catch {
    chartLabels.value = []
    chartValues.value = []
  } finally {
    chartLoading.value = false
  }
}

function labelFormatter(period: TimePeriod): (ts: number) => string {
  return (ts: number) => {
    const d = new Date(ts)
    switch (period) {
      case '1H':
      case '1D':
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      case '1W':
        return d.toLocaleDateString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
      case '1M':
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      default:
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
    }
  }
}

function selectPeriod(p: TimePeriod) {
  selectedPeriod.value = p
  loadChart()
}

// ── Helpers ─────────────────────────────────────────────────────────
const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#84cc16', '#a855f7', '#14b8a6', '#eab308', '#6366f1', '#22c55e', '#fb923c']

function assetGain(a: Asset): number {
  return (a.currentPrice - a.purchasePrice) * a.quantity
}

function assetGainPct(a: Asset): number {
  if (a.purchasePrice === 0) return 0
  return ((a.currentPrice - a.purchasePrice) / a.purchasePrice) * 100
}

// ── Allocation data ─────────────────────────────────────────────────
/**
 * Display names per asset type. A lookup rather than a ternary: the previous
 * two-way test read "crypto, else stocks", so adding metals filed them silently
 * under Stocks — a gold holding inflated the equity slice instead of appearing
 * as its own. An unknown type now shows as itself rather than as something else.
 */
const TYPE_LABELS: Record<string, string> = {
  crypto: 'Crypto',
  stock: 'Stocks',
  commodity: 'Commodities',
}
const typeLabel = (t: string) =>
  TYPE_LABELS[t] ?? (t ? t[0].toUpperCase() + t.slice(1) : 'Other')

const typeAllocation = computed(() => {
  const typeMap: Record<string, number> = {}
  for (const a of filteredAssets.value) {
    const label = typeLabel(a.type)
    typeMap[label] = (typeMap[label] || 0) + a.currentPrice * a.quantity
  }
  // Fixed order, so a slice keeps its colour as holdings come and go rather
  // than being repainted by whichever type happens to sort first.
  const order = ['Crypto', 'Stocks', 'Commodities']
  const labels = Object.keys(typeMap).sort(
    (a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99),
  )
  const values = labels.map(l => parseFloat(typeMap[l].toFixed(2)))
  const colors = labels.map(l => PALETTE[(order.indexOf(l) + 1 || labels.indexOf(l) + 1) % PALETTE.length])
  return { labels, values, colors }
})

const assetAllocation = computed(() => {
  const labels: string[] = []
  const values: number[] = []
  const colors: string[] = []
  for (const [i, a] of filteredAssets.value.entries()) {
    const val = a.currentPrice * a.quantity
    if (val > 0) {
      labels.push(a.symbol.toUpperCase())
      values.push(parseFloat(val.toFixed(2)))
      colors.push(PALETTE[i % PALETTE.length])
    }
  }
  return { labels, values, colors }
})

function formatCurrency(n: number): string {
  return currencySymbol.value + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function iconColor(symbol: string): string {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899']
  let hash = 0
  for (let i = 0; i < symbol.length; i++) {
    hash = (hash << 5) - hash + symbol.charCodeAt(i)
    hash |= 0
  }
  return colors[Math.abs(hash) % colors.length]
}

/*
 * A "stale" badge used to sit beside prices older than their market's refresh
 * rhythm. It was removed deliberately: the timestamp beneath every price
 * already says when it was taken, which is the same information without the
 * implication that something is wrong. A Friday close is not stale on a
 * Sunday — it is the price.
 */

async function refresh() {
  clearCache()
  await refreshAllPrices()
  loadChart()
}

/**
 * Everything the sections read, in one reactive object.
 *
 * Provided rather than passed: each section works from the same portfolio, and
 * threading twenty values through props would add noise without adding
 * clarity. `reactive` unwraps the refs, so a section writes `d.totalValue`
 * rather than `d.totalValue.value`.
 */
provide('dash', reactive({
  store,
  snapshotAge, snapshotCET, stockWindow,
  formatCurrency, convert, currencySymbol, selectedCurrency, toggleCurrency,
  filteredAssets, sortedFilteredAssets, filteredTotalValue, filteredProfitLoss, filteredPLPercent,
  chartLabels, chartValues, chartLoading, periods, selectedPeriod, selectPeriod,
  sortMode, unitPrice, assetGain, assetGainPct, iconColor,
  typeAllocation, assetAllocation, refresh, openTicker,
}))

// Only the stored preference is read here; which sections go where, and how
// wide the columns are, is the workspace components' business.
const { load: loadLayout } = useDashboardLayout()

// ── Lifecycle ───────────────────────────────────────────────────────
onMounted(async () => {
  // Guarded and last-resort: a stored layout preference failing to parse must
  // never prevent the portfolio itself from loading, and this runs first.
  try { loadLayout() } catch { /* the default layout is a fine answer */ }
  loadPreference()
  document.addEventListener('visibilitychange', syncPolling)
  syncPolling()
  fetchEurRate()
  await store.fetchAssets()
  if (store.assets.length > 0) {
    // Await prices first so GLOBAL_QUOTE calls finish before TIME_SERIES calls
    await refreshAllPrices()
    loadChart()
  }
})

// Reload chart when tab changes
watch(activeTab, () => loadChart())

useHead({ title: 'Home – Portfolio Tracker' })
</script>
