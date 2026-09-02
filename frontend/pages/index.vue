<template>
  <div>
    <!-- Error banner -->
    <div v-if="store.error" class="mb-4 rounded-lg border border-[rgba(224,121,140,.4)] bg-[rgba(224,121,140,.08)] p-3 flex items-center gap-3">
      <svg class="w-5 h-5 text-down shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p class="text-down text-sm">{{ store.error }}</p>
    </div>

    <!-- Empty state -->
    <div v-if="!store.isLoading && store.assets.length === 0" class="text-center py-20">
      <div class="n-card p-10 max-w-md mx-auto">
        <svg class="w-14 h-14 mx-auto mb-4 text-n-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2 class="text-xl font-medium mb-2">No assets yet</h2>
        <p class="text-n-400 mb-6 text-sm">Add your first investment to start tracking the portfolio.</p>
        <NuxtLink
          to="/assets"
          class="inline-flex items-center justify-center h-10 px-6 rounded-lg border border-n-accent text-n-accent text-sm font-medium hover:bg-[rgba(145,132,217,.12)] transition-colors no-underline"
        >
          Add your first asset
        </NuxtLink>
      </div>
    </div>

    <!--
      The command deck: everything on one screen. A wide fixed rail rather than
      an adjustable split — the arrangement is the design's answer, so there is
      nothing here to configure. Below xl the rail drops beneath the main
      column instead of squeezing it.
    -->
    <div v-else-if="store.assets.length > 0" class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-[18px]">
      <div class="flex flex-col gap-4 min-w-0">
        <DashboardStatStrip />
        <DashboardValueChart />
        <DashboardHoldingsTable />
      </div>

      <div class="flex flex-col gap-4">
        <DashboardAllocationBar />
        <DashboardCoverage />
      </div>
    </div>
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
  refreshAllPrices, pollPrices,
} = useMarketData()

/**
 * Prices are rewritten by a scheduled job every ~5 minutes, so this only needs
 * to be frequent enough to notice a new snapshot, not to chase one.
 */
const POLL_MS = 30000
let pollTimer: ReturnType<typeof setInterval> | null = null

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
  { label: 'Metals', value: 'commodity' },
  { label: 'Cash', value: 'cash' },
] as const

type TabValue = 'all' | 'crypto' | 'stock' | 'commodity' | 'cash'
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
  cash: 'Cash',
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
  const order = ['Crypto', 'Stocks', 'Commodities', 'Cash']
  const labels = Object.keys(typeMap).sort(
    (a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99),
  )
  const values = labels.map(l => parseFloat(typeMap[l].toFixed(2)))
  return { labels, values }
})

function formatCurrency(n: number): string {
  return currencySymbol.value + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
/**
 * What the book did over the last 24 hours, in money.
 *
 * Derived from each holding's own 24h percentage rather than from a stored
 * snapshot of yesterday's total, because no such snapshot exists: the value a
 * day ago is `price / (1 + change)`, summed. Holdings whose provider reported
 * no 24h figure are left out of both sides of the subtraction, so they cannot
 * drag the total toward zero — and if none of them reported one, the answer is
 * "not known" rather than a confident 0.00.
 */
const todayChange = computed(() => {
  let now = 0
  let before = 0
  let known = 0

  for (const a of filteredAssets.value) {
    if (!Number.isFinite(a.change24h)) continue
    const value = a.currentPrice * a.quantity
    const prior = (a.currentPrice / (1 + a.change24h / 100)) * a.quantity
    if (!Number.isFinite(prior)) continue
    now += value
    before += prior
    known++
  }

  if (!known || before === 0) return { value: null as number | null, percent: 0 }
  return { value: now - before, percent: ((now - before) / before) * 100 }
})

/** The largest position, and what share of the book it is. */
const topHolding = computed(() => {
  const total = filteredTotalValue.value
  if (!total || !filteredAssets.value.length) return null
  const top = filteredAssets.value.reduce((a, b) =>
    b.currentPrice * b.quantity > a.currentPrice * a.quantity ? b : a,
  )
  return {
    symbol: top.symbol.toUpperCase(),
    weight: ((top.currentPrice * top.quantity) / total) * 100,
  }
})

/** Changing the filter re-reads the chart, so it goes through one function. */
function setTab(value: TabValue) {
  activeTab.value = value
}

provide('dash', reactive({
  store,
  formatCurrency, convert, currencySymbol, selectedCurrency, toggleCurrency,
  filteredAssets, sortedFilteredAssets, filteredTotalValue, filteredProfitLoss, filteredPLPercent,
  chartLabels, chartValues, chartLoading, periods, selectedPeriod, selectPeriod,
  unitPrice, openTicker, refresh,
  assetTabs, activeTab, setTab, filteredTotalCost, todayChange, topHolding,
  typeAllocation,
}))


// ── Lifecycle ───────────────────────────────────────────────────────
onMounted(async () => {
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
