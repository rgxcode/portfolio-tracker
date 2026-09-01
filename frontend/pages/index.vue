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

      <!-- On a wide screen this becomes a dashboard rather than a column:
           value and chart top-left, allocation to the right, holdings and
           metrics below them — so the whole portfolio is visible at once
           instead of being scrolled through. Below xl it stays a single
           column, which is the right shape for a phone. -->
      <div class="xl:grid xl:grid-cols-12 xl:gap-x-6 xl:items-start">
        <div class="xl:col-span-8">

      <!-- Total Worth section -->
      <div class="mb-2">
        <div class="flex items-center justify-between">
          <p class="text-gray-400 text-xs font-semibold tracking-wider uppercase">Total Worth</p>

          <!-- How current the figures are. Which job wrote them is an
               implementation detail, so it is not surfaced. -->
          <p v-if="snapshotAge" class="text-[11px] text-gray-500">{{ snapshotAge }}</p>
        </div>

        <div class="flex items-baseline gap-3 mt-1">
          <span class="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
            {{ formatCurrency(convert(filteredTotalValue)) }}
          </span>
          <button
            class="text-gray-400 text-lg font-medium hover:text-white transition-colors"
            title="Switch currency"
            @click="toggleCurrency"
          >
            {{ selectedCurrency }} ⇆
          </button>
          <button
            class="ml-1 text-gray-500 hover:text-gray-300 transition-colors"
            title="Refresh prices"
            :disabled="store.isLoading"
            @click="refresh"
          >
            <svg
              class="w-5 h-5"
              :class="{ 'animate-spin': store.isLoading }"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
        <!-- P&L summary -->
        <div class="flex items-center gap-3 mt-1">
          <span class="text-sm font-semibold" :class="filteredProfitLoss >= 0 ? 'text-emerald-400' : 'text-red-400'">
            {{ filteredProfitLoss >= 0 ? '+' : '-' }}{{ formatCurrency(Math.abs(convert(filteredProfitLoss))) }}
          </span>
          <span
            class="text-xs font-bold px-1.5 py-0.5 rounded"
            :class="filteredProfitLoss >= 0 ? 'bg-emerald-900/60 text-emerald-400' : 'bg-red-900/60 text-red-400'"
          >
            {{ filteredProfitLoss >= 0 ? '+' : '' }}{{ filteredPLPercent.toFixed(2) }}%
          </span>
        </div>
      </div>

      <!-- Portfolio chart -->
      <div class="mt-4 mb-2">
        <div class="h-64 sm:h-72 xl:h-80 2xl:h-96">
          <PortfolioChart
            :labels="chartLabels"
            :values="chartValues"
            :loading="chartLoading"
            :positive="filteredProfitLoss >= 0"
          />
        </div>
      </div>

      <!-- Time period selector -->
      <div class="flex items-center justify-center gap-1 mb-8">
        <button
          v-for="p in periods"
          :key="p"
          class="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
          :class="selectedPeriod === p
            ? 'bg-gray-700 text-white'
            : 'text-gray-500 hover:text-gray-300'"
          @click="selectPeriod(p)"
        >
          {{ p }}
        </button>
      </div>

      <!-- Sort & manage row -->
      <div class="flex items-center justify-between mb-4">
        <NuxtLink to="/assets" class="text-blue-400 hover:text-blue-300 text-sm transition-colors flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Add Asset
        </NuxtLink>
        <div class="relative">
          <select
            v-model="sortMode"
            class="appearance-none bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-full px-4 py-1.5 pr-8 focus:outline-none focus:ring-1 focus:ring-gray-600 cursor-pointer"
          >
            <option value="value-desc">Highest value</option>
            <option value="gains-desc">Absolute gains (high to low)</option>
            <option value="gains-asc">Absolute gains (low to high)</option>
            <option value="pct-desc">% gains (high to low)</option>
            <option value="pct-asc">% gains (low to high)</option>
          </select>
          <svg class="w-4 h-4 text-gray-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      <!-- Holdings list -->
      <div class="space-y-1">
        <div
          v-for="asset in sortedFilteredAssets"
          :key="asset.id"
          class="flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-gray-800/60 transition-colors group"
        >
          <!-- Icon -->
          <AssetLogo :symbol="asset.symbol" :type="asset.type" :image="asset.image" :size="40" />

          <!-- Name & details -->
          <div class="flex-1 min-w-0">
            <p class="text-white font-semibold text-sm">{{ asset.symbol.toUpperCase() }}</p>
            <p class="text-gray-500 text-xs">
              {{ asset.quantity }} × <span class="text-gray-300">{{ unitPrice(asset) }}</span>
              <span class="text-gray-600"> · paid {{ currencySymbol }}{{ convert(asset.purchasePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
            </p>
            <!-- When this price was actually taken, in CET -->
            <p v-if="asset.priceAsOfCET" class="text-gray-600 text-[10px] mt-0.5">
              @ {{ asset.priceAsOfCET }}
            </p>
          </div>

          <!-- Value & gain -->
          <div class="text-right shrink-0">
            <p class="text-white font-semibold text-sm">
              {{ formatCurrency(convert(asset.currentPrice * asset.quantity)) }}
            </p>
            <div class="flex items-center justify-end gap-1.5">
              <span class="text-xs" :class="assetGain(asset) >= 0 ? 'text-emerald-400' : 'text-red-400'">
                {{ assetGain(asset) >= 0 ? '+' : '-' }}{{ formatCurrency(Math.abs(convert(assetGain(asset)))) }}
              </span>
              <span
                class="text-[10px] font-bold px-1 py-0.5 rounded"
                :class="assetGain(asset) >= 0 ? 'bg-emerald-900/60 text-emerald-400' : 'bg-red-900/60 text-red-400'"
              >
                {{ assetGain(asset) >= 0 ? '+' : '' }}{{ assetGainPct(asset).toFixed(2) }}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer summary -->
      <div class="mt-6 pt-4 border-t border-gray-800 flex items-center justify-between text-sm text-gray-500">
        <span>{{ filteredAssets.length }} asset{{ filteredAssets.length === 1 ? '' : 's' }}</span>
        <div class="text-right">
          <div v-if="snapshotCET" class="text-xs">Snapshot {{ snapshotCET }}</div>
          <div v-if="stockWindow" class="text-[10px] text-gray-600">
            Stocks {{ stockWindow.open ? 'live' : 'paused' }} · {{ stockWindow.status }}
          </div>
        </div>
      </div>

        </div><!-- /left column -->

        <!-- Allocation and metrics: a sidebar on a wide screen, and the same
             stacked sections as before on a narrow one. -->
        <div class="xl:col-span-4">
      <div class="mt-8 pt-6 border-t border-gray-800 xl:mt-0 xl:pt-0 xl:border-t-0">
        <h3 class="text-white font-bold text-lg mb-5">Allocation</h3>

        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4 mb-8">
          <!-- By Type -->
          <div class="bg-gray-800/50 rounded-2xl border border-gray-700 p-5">
            <p class="text-gray-400 text-xs font-semibold tracking-wider uppercase mb-3">By Type</p>
            <div class="h-72 xl:h-64">
              <AllocationPieChart
                :labels="typeAllocation.labels"
                :values="typeAllocation.values"
                :colors="typeAllocation.colors"
              />
            </div>
          </div>

          <!-- By Asset -->
          <div class="bg-gray-800/50 rounded-2xl border border-gray-700 p-5">
            <p class="text-gray-400 text-xs font-semibold tracking-wider uppercase mb-3">By Asset</p>
            <div class="h-72 xl:h-64">
              <AllocationPieChart
                :labels="assetAllocation.labels"
                :values="assetAllocation.values"
                :colors="assetAllocation.colors"
              />
            </div>
          </div>
        </div>

        <!-- Metrics table -->
        <div class="bg-gray-800/50 rounded-2xl border border-gray-700 overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-700">
                <th class="text-left text-gray-400 font-semibold text-xs uppercase tracking-wider px-4 py-3">Asset</th>
                <th class="text-right text-gray-400 font-semibold text-xs uppercase tracking-wider px-4 py-3">Owned</th>
                <th class="text-right text-gray-400 font-semibold text-xs uppercase tracking-wider px-4 py-3">Cost Basis</th>
                <th class="text-right text-gray-400 font-semibold text-xs uppercase tracking-wider px-4 py-3">Value</th>
                <th class="text-right text-gray-400 font-semibold text-xs uppercase tracking-wider px-4 py-3">Unrealized Gain</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="asset in sortedFilteredAssets"
                :key="'tbl-' + asset.id"
                class="border-b border-gray-700/50 last:border-0 hover:bg-gray-700/30 transition-colors"
              >
                <td class="px-4 py-3">
                  <NuxtLink
                    :to="{ path: '/asset', query: { symbol: asset.symbol.toUpperCase() } }"
                    class="flex items-center gap-2 group"
                  >
                    <AssetLogo :symbol="asset.symbol" :type="asset.type" :image="asset.image" :size="24" />
                    <span class="text-white font-semibold group-hover:text-blue-400 transition-colors">
                      {{ asset.symbol.toUpperCase() }}
                    </span>
                    <svg class="w-3.5 h-3.5 text-gray-600 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </NuxtLink>
                </td>
                <td class="text-right px-4 py-3">
                  <span class="text-gray-300">{{ asset.quantity }}</span>
                  <span class="text-gray-500 text-xs block">at {{ unitPrice(asset) }}</span>
                </td>
                <td class="text-right text-gray-300 px-4 py-3">{{ formatCurrency(convert(asset.purchasePrice * asset.quantity)) }}</td>
                <td class="text-right text-white font-semibold px-4 py-3">{{ formatCurrency(convert(asset.currentPrice * asset.quantity)) }}</td>
                <td class="text-right px-4 py-3">
                  <span :class="assetGain(asset) >= 0 ? 'text-emerald-400' : 'text-red-400'" class="font-semibold">
                    {{ assetGain(asset) >= 0 ? '+' : '-' }}{{ formatCurrency(Math.abs(convert(assetGain(asset)))) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
        </div><!-- /right column -->
      </div><!-- /dashboard grid -->

      <!-- LLM read of the holdings, full width beneath the dashboard -->
      <PortfolioInsights />
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
  refreshAllPrices, pollPrices, stockWindow, snapshotAt,
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
