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
import { assetClass, assetClassLabel, type AssetClass } from '~/utils/assetClass'

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
  // Restarting a running timer would put the next tick a full POLL_MS away
  // again. Tab focus changes call this, and someone switching tabs more often
  // than every thirty seconds reset the countdown every time — so the interval
  // never elapsed and the figures never moved.
  if (pollTimer) return
  pollTimer = setInterval(pollTick, POLL_MS)
}

/**
 * Poll while the tab is visible; a hidden tab has nobody to inform.
 *
 * Coming back has to fetch, not merely schedule a fetch. Browsers throttle a
 * hidden tab's timers to about once a minute and freeze them altogether once
 * the tab is fully backgrounded, so a dashboard left in another window is
 * showing whatever the numbers were when it lost focus — minutes or hours
 * stale. Scheduling alone left that number on screen for another thirty
 * seconds after the tab was looked at again, which reads as a dashboard that
 * does not update and invites a manual reload.
 */
function syncPolling() {
  const visible = !import.meta.client || document.visibilityState === 'visible'
  if (!visible) {
    stopPolling()
    return
  }
  if (!pollTimer) pollTick()
  startPolling()
}

onUnmounted(() => {
  stopPolling()
  if (import.meta.client) document.removeEventListener('visibilitychange', syncPolling)
})

const { fetchAssetHistory, fetchAllStockHistories, clearCache } = useHistoricalPrices()
const { selectedCurrency, currencySymbol, convert, toggleCurrency, loadPreference, fetchEurRate } = useCurrency()

// ── Asset class filter ──────────────────────────────────────────────
/**
 * Funds get their own tab rather than sharing the equities' one. A holding is
 * filtered by what it is, not by which snapshot bucket priced it — see
 * utils/assetClass for why those differ.
 */
const assetTabs = [
  { label: 'All', value: 'all' },
  { label: 'Crypto', value: 'crypto' },
  { label: 'Stocks', value: 'stock' },
  { label: 'ETFs', value: 'etf' },
  { label: 'Metals', value: 'commodity' },
  { label: 'Cash', value: 'cash' },
] as const

type TabValue = 'all' | AssetClass
const activeTab = ref<TabValue>('all')

const filteredAssets = computed(() => {
  if (activeTab.value === 'all') return store.assets
  return store.assets.filter(a => assetClass(a) === activeTab.value)
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

    /**
     * The time axis is every instant any holding was priced at, not one
     * holding's instants.
     *
     * It used to borrow the timestamps of whichever asset happened to have the
     * most points — usually a coin, sampled every five minutes. Every other
     * holding was then read at those instants, so a stock's own moves landed on
     * the coin's clock and anything that moved between two crypto samples was
     * invisible. The union is the honest axis: a point appears exactly where a
     * price was actually observed.
     */
    const timestamps = [...new Set(histories.flatMap(h => h.points.map(p => p.timestamp)))]
      .sort((a, b) => a - b)

    if (timestamps.length === 0) {
      chartLabels.value = []
      chartValues.value = []
      return
    }

    /**
     * Value the book at each instant, carrying each holding's last known price
     * forward.
     *
     * One cursor per holding rather than a rescan per timestamp: the axis is a
     * union now, so the old nested scan would have been the product of every
     * series' length against every other's. The cursors only ever move forward,
     * which makes this one pass over each series however long the axis is.
     */
    const cursors = histories.map(() => 0)
    const values = timestamps.map((ts) => {
      let total = 0
      histories.forEach(({ asset, points }, i) => {
        // Never priced at all — a holding added minutes ago, or one whose
        // provider has nothing. Its current price is the only figure we have,
        // and it is better than dropping it from a total shown as complete.
        if (points.length === 0) {
          total += asset.currentPrice * asset.quantity
          return
        }
        let c = cursors[i]
        while (c + 1 < points.length && points[c + 1].timestamp <= ts) c++
        cursors[i] = c
        // Before its first observation a holding has no price yet, so its
        // earliest one stands in — the alternative is a line that starts at a
        // total the portfolio never had.
        total += points[c].price * asset.quantity
      })
      return parseFloat(total.toFixed(2))
    })

    const formatter = labelFormatter(selectedPeriod.value)
    const drawn = thin(timestamps.map((ts, i) => ({ ts, value: values[i] })))
    chartLabels.value = drawn.map(p => formatter(p.ts))
    chartValues.value = drawn.map(p => p.value)
  } catch {
    chartLabels.value = []
    chartValues.value = []
  } finally {
    chartLoading.value = false
  }
}

/**
 * Evenly thin the drawn series. Merging fourteen histories can produce several
 * thousand instants, and a chart 700 pixels wide has nothing to do with them.
 * The last point is always kept so the line ends where the portfolio is now.
 */
function thin<T>(points: T[], max = 400): T[] {
  if (points.length <= max) return points
  const step = points.length / max
  const out: T[] = []
  for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)])
  const last = points[points.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
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
 * The band a holding is shown in. Named for the sections rather than for the
 * pricing bucket, because a semiconductor ETF is priced like a share and is
 * not one — see utils/assetClass.
 */
const groupLabel = (a: Asset) => assetClassLabel(a)

const typeAllocation = computed(() => {
  const typeMap: Record<string, number> = {}
  for (const a of filteredAssets.value) {
    const label = groupLabel(a)
    typeMap[label] = (typeMap[label] || 0) + a.currentPrice * a.quantity
  }
  // Fixed order, so a slice keeps its colour as holdings come and go rather
  // than being repainted by whichever type happens to sort first.
  const order = ['Crypto', 'Stocks', 'ETFs', 'Commodities', 'Cash']
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
  typeAllocation, groupLabel,
}))


// ── Lifecycle ───────────────────────────────────────────────────────
onMounted(async () => {
  loadPreference()
  document.addEventListener('visibilitychange', syncPolling)
  // Only start the clock here. This path fetches prices itself a few lines
  // down, so syncPolling's catch-up poll would be a duplicate request on every
  // page load; it exists for coming *back* to the tab, not for arriving.
  if (!import.meta.client || document.visibilityState === 'visible') startPolling()
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

/**
 * What the browser tab says.
 *
 * The total goes first so it survives the truncation a narrow tab applies —
 * the point is to read the portfolio at a glance from a background tab, and a
 * title that has to be widened to show the number is no use for that.
 *
 * Whole units, no cents: a tab has room for one fact, and the cents on a
 * five-figure balance are not it. The figure is in the currency currently
 * selected on the dashboard, so the tab never disagrees with the page.
 *
 * It follows the whole portfolio rather than the type filter — a tab reading
 * "$15,061" because Stocks happened to be selected would be a quiet lie about
 * net worth.
 *
 * No total, no number: before the assets load, and for someone who has not
 * added any, this is the plain title rather than "$0.00".
 */
const tabTitle = computed(() => {
  const total = convert(store.totalValue)
  // Anything that would not round to at least a cent has no number worth
  // printing, and printing it anyway produces the "$0.00" this is meant to
  // avoid. Covers the empty portfolio, the not-yet-loaded one, and a balance
  // too small to render.
  if (!Number.isFinite(total) || total < 0.005) return 'Home – Portfolio Tracker'
  // Whole units read best, but rounding a small balance to zero would print
  // the one thing this is not allowed to say. Under a unit, the cents are the
  // number.
  const amount = total >= 1
    ? Math.round(total).toLocaleString('en-US')
    : total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${currencySymbol.value}${amount} · Portfolio Tracker`
})

// Re-rendered whenever the total changes, which the 30-second poll and any
// manual refresh both do — so the tab keeps up without a timer of its own.
useHead({ title: tabTitle })
</script>
