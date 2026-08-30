<template>
  <div>
    <!-- Header -->
    <div class="flex items-start justify-between gap-4 flex-wrap mb-6">
      <div class="flex items-center gap-3 min-w-0">
        <div
          class="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-white"
          :style="{ backgroundColor: iconColor(symbol) }"
        >
          {{ symbol.slice(0, 3) }}
        </div>
        <div class="min-w-0">
          <h1 class="text-2xl font-bold text-white leading-tight">{{ symbol }}</h1>
          <p class="text-gray-400 text-sm truncate">
            {{ data?.name || (loading ? 'Loading…' : '') }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <TickerSearch @select="go" />
        <NuxtLink to="/" class="px-3 py-1.5 rounded-lg text-sm bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700">
          Back
        </NuxtLink>
      </div>
    </div>

    <div v-if="error" class="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-6">
      <p class="text-red-300 text-sm">{{ error }}</p>
      <p v-if="detail" class="text-red-400/70 text-xs mt-1">{{ detail }}</p>
    </div>

    <div v-if="loading && !data" class="bg-gray-800 border border-gray-700 rounded-2xl p-8 text-center">
      <p class="text-gray-300">Fetching fundamentals for {{ symbol }}…</p>
      <p class="text-gray-500 text-xs mt-1">First look-up for a ticker takes a few seconds; after that it is stored.</p>
    </div>

    <template v-if="data">
      <!-- Financials missing: say what is missing and why, and still show the rest -->
      <div v-if="!data.statementsAvailable" class="bg-amber-900/25 border border-amber-700/60 rounded-xl p-4 mb-6">
        <p class="text-amber-200 text-sm font-medium">No financial statements for {{ symbol }} yet.</p>
        <p class="text-amber-300/70 text-xs mt-1">
          Statements come from SEC filings, which cover S&amp;P 500 members. Price and related
          tickers below are unaffected.
        </p>
      </div>

      <!-- Statements are present but the ratio provider is out of quota: a much
           smaller gap, and saying "unavailable" above a full income statement
           was simply wrong. -->
      <div v-else-if="!data.metricsAvailable" class="bg-gray-800/60 border border-gray-700 rounded-xl p-3 mb-6">
        <p class="text-gray-300 text-xs">
          Ratios aren't available for {{ symbol }} — that needs either filed financials to compute
          from, or the metered provider, and neither is present.
        </p>
      </div>

      <!-- Identity + price -->
      <section class="bg-gray-800 border border-gray-700 rounded-2xl p-5 mb-6">
        <div class="flex flex-wrap gap-x-8 gap-y-3 items-baseline">
          <div v-if="data.quote">
            <p class="text-xs text-gray-400 uppercase tracking-wide">Price</p>
            <p class="text-3xl font-extrabold text-white">${{ fmtNum(data.quote.price) }}</p>
            <p v-if="data.quote.asOfCET" class="text-xs text-gray-500 mt-0.5">@ {{ data.quote.asOfCET }}</p>
          </div>
          <div v-if="data.sector">
            <p class="text-xs text-gray-400 uppercase tracking-wide">Sector</p>
            <p class="text-gray-200">{{ title(data.sector) }}</p>
            <p class="text-xs text-gray-500">{{ title(data.industry) }}</p>
          </div>
          <div v-if="range52">
            <p class="text-xs text-gray-400 uppercase tracking-wide">52-week range</p>
            <p class="text-gray-200">${{ fmtNum(data.metrics.week52Low) }} – ${{ fmtNum(data.metrics.week52High) }}</p>
          </div>
          <div v-if="data.exchange">
            <p class="text-xs text-gray-400 uppercase tracking-wide">Listing</p>
            <p class="text-gray-200">{{ data.exchange }} · {{ data.currency }}</p>
          </div>
        </div>
        <p v-if="data.description" class="text-sm text-gray-400 mt-4 leading-relaxed">
          {{ expanded ? data.description : truncate(data.description, 320) }}
          <button
            v-if="data.description.length > 320"
            class="text-blue-400 hover:text-blue-300 ml-1"
            @click="expanded = !expanded"
          >{{ expanded ? 'less' : 'more' }}</button>
        </p>
      </section>

      <!-- Charts come before the tables: the shape of the trend is the thing
           most people want, and the numbers are there to check it against. -->
      <FundamentalsCharts
        :income="data.incomeQuarterly ?? []"
        :earnings="data.earningsQuarterly ?? []"
        :balance="data.balanceSheetQuarterly ?? []"
      />

      <!-- Valuation -->
      <section v-if="hasMetrics" class="mb-6">
        <h2 class="font-semibold text-white mb-3">Valuation &amp; ratios</h2>
        <div class="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <div v-for="m in metricTiles" :key="m.label" class="bg-gray-800 border border-gray-700 rounded-xl p-3">
            <p class="text-[11px] text-gray-400 uppercase tracking-wide">{{ m.label }}</p>
            <p class="text-lg font-bold text-white mt-0.5">{{ m.value }}</p>
            <p v-if="m.hint" class="text-[11px] text-gray-500">{{ m.hint }}</p>
          </div>
        </div>
      </section>

      <!-- Quarterly results -->
      <section v-if="data.incomeQuarterly?.length" class="bg-gray-800 border border-gray-700 rounded-2xl p-5 mb-6">
        <h2 class="font-semibold text-white mb-1">Quarterly results</h2>
        <p class="text-xs text-gray-500 mb-3">
          {{ shownIncome.length }} of {{ data.incomeQuarterly.length }} quarters, newest first.
          <button v-if="data.incomeQuarterly.length > 12" class="text-blue-400 hover:text-blue-300 ml-1" @click="allIncome = !allIncome">
            {{ allIncome ? 'show fewer' : 'show all' }}
          </button>
          <span v-if="data.financialsSource === 'edgar'" class="ml-1">· as filed with the SEC</span>
        </p>
        <div class="overflow-x-auto">
          <table class="w-full text-sm min-w-[42rem]">
            <thead>
              <tr class="text-gray-400 border-b border-gray-700">
                <th class="text-left font-medium py-2">Quarter</th>
                <th class="text-right font-medium py-2">Revenue</th>
                <th class="text-right font-medium py-2">Gross profit</th>
                <th class="text-right font-medium py-2">Operating income</th>
                <th class="text-right font-medium py-2">Net income</th>
                <th class="text-right font-medium py-2">R&amp;D</th>
                <th class="text-right font-medium py-2">Net margin</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="q in shownIncome" :key="q.fiscalDateEnding" class="border-b border-gray-800 last:border-0">
                <td class="py-2 text-gray-200">
                  {{ q.fiscalDateEnding }}
                  <span
                    v-if="q.derived"
                    class="text-[10px] text-amber-400/80 ml-1"
                    title="Not filed as a standalone quarter — the annual figure minus the three quarters that were filed."
                  >derived</span>
                </td>
                <td class="py-2 text-right text-gray-200">{{ big(q.totalRevenue) }}</td>
                <td class="py-2 text-right text-gray-300">{{ big(q.grossProfit) }}</td>
                <td class="py-2 text-right text-gray-300">{{ big(q.operatingIncome) }}</td>
                <td class="py-2 text-right font-medium" :class="(q.netIncome ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'">
                  {{ big(q.netIncome) }}
                </td>
                <td class="py-2 text-right text-gray-400">{{ big(q.researchAndDevelopment) }}</td>
                <td class="py-2 text-right text-gray-300">{{ pct(margin(q)) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Earnings surprises -->
      <section v-if="data.earningsQuarterly?.length" class="bg-gray-800 border border-gray-700 rounded-2xl p-5 mb-6">
        <h2 class="font-semibold text-white mb-1">Earnings vs expectations</h2>
        <p class="text-xs text-gray-500 mb-3">Reported EPS against the consensus estimate at the time.</p>
        <div class="overflow-x-auto">
          <table class="w-full text-sm min-w-[34rem]">
            <thead>
              <tr class="text-gray-400 border-b border-gray-700">
                <th class="text-left font-medium py-2">Quarter</th>
                <th class="text-left font-medium py-2">Reported on</th>
                <th class="text-right font-medium py-2">EPS</th>
                <th class="text-right font-medium py-2">Estimate</th>
                <th class="text-right font-medium py-2">Surprise</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in data.earningsQuarterly" :key="e.fiscalDateEnding" class="border-b border-gray-800 last:border-0">
                <td class="py-2 text-gray-200">{{ e.fiscalDateEnding }}</td>
                <td class="py-2 text-gray-400">{{ e.reportedDate || '—' }}</td>
                <td class="py-2 text-right text-white font-medium">{{ e.reportedEPS ?? '—' }}</td>
                <td class="py-2 text-right text-gray-400">{{ e.estimatedEPS ?? '—' }}</td>
                <td
                  class="py-2 text-right font-medium"
                  :class="(e.surprisePercentage ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'"
                >
                  {{ e.surprisePercentage != null ? (e.surprisePercentage >= 0 ? '+' : '') + e.surprisePercentage.toFixed(1) + '%' : '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Balance sheet -->
      <section v-if="data.balanceSheetQuarterly?.length" class="bg-gray-800 border border-gray-700 rounded-2xl p-5 mb-6">
        <h2 class="font-semibold text-white mb-1">Balance sheet</h2>
        <p class="text-xs text-gray-500 mb-3">
          {{ shownBalance.length }} of {{ data.balanceSheetQuarterly.length }} quarters, newest first.
          <button v-if="data.balanceSheetQuarterly.length > 12" class="text-blue-400 hover:text-blue-300 ml-1" @click="allBalance = !allBalance">
            {{ allBalance ? 'show fewer' : 'show all' }}
          </button>
        </p>
        <div class="overflow-x-auto">
          <table class="w-full text-sm min-w-[46rem]">
            <thead>
              <tr class="text-gray-400 border-b border-gray-700">
                <th class="text-left font-medium py-2">Quarter</th>
                <th class="text-right font-medium py-2">Total assets</th>
                <th class="text-right font-medium py-2">Cash</th>
                <th class="text-right font-medium py-2">Total liabilities</th>
                <th class="text-right font-medium py-2">Long-term debt</th>
                <th class="text-right font-medium py-2">Equity</th>
                <th class="text-right font-medium py-2">Current ratio</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in shownBalance" :key="b.fiscalDateEnding" class="border-b border-gray-800 last:border-0">
                <td class="py-2 text-gray-200">{{ b.fiscalDateEnding }}</td>
                <td class="py-2 text-right text-gray-200">{{ big(b.totalAssets) }}</td>
                <td class="py-2 text-right text-gray-300">{{ big(b.cashAndCashEquivalents) }}</td>
                <td class="py-2 text-right text-gray-300">{{ big(b.totalLiabilities) }}</td>
                <td class="py-2 text-right text-gray-400">{{ big(b.longTermDebt) }}</td>
                <td class="py-2 text-right text-white font-medium">{{ big(b.totalShareholderEquity) }}</td>
                <td class="py-2 text-right text-gray-300">{{ currentRatio(b) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Peers -->
      <section class="bg-gray-800 border border-gray-700 rounded-2xl p-5">
        <h2 class="font-semibold text-white mb-1">{{ data.peerBasis === 'gics' ? 'Peers' : 'Related tickers' }}</h2>
        <p v-if="data.peerBasis === 'gics'" class="text-xs text-gray-500 mb-3">
          Other S&amp;P 500 companies in the same GICS sub-industry — an actual peer group.
        </p>
        <p v-else class="text-xs text-gray-500 mb-3">
          What people viewing {{ symbol }} also look at, per Yahoo. That is co-viewing rather than a
          curated peer group, so an unrelated name can appear — use the box above to jump to any ticker.
        </p>
        <div v-if="data.peers?.length" class="flex flex-wrap gap-2">
          <NuxtLink
            v-for="p in data.peers"
            :key="p"
            :to="{ path: '/asset', query: { symbol: p } }"
            class="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-900 border border-gray-700 text-blue-300 hover:border-blue-500 hover:text-blue-200 transition-colors"
          >
            {{ p }}
          </NuxtLink>
        </div>
        <p v-else class="text-gray-500 text-sm">None returned.</p>
      </section>

      <p class="text-center text-xs text-gray-600 mt-6">
        {{ data.financialsSource === 'edgar' ? 'Statements as filed with the SEC (EDGAR)' : 'Statements from Alpha Vantage' }} ·
        {{ data.metricsSource === 'computed'
          ? 'ratios computed from those filings and the current price'
          : `ratios from Alpha Vantage, stored ${data.ageHours}h ago` }}
        <button class="text-blue-400 hover:text-blue-300 ml-2" :disabled="refreshing" @click="forceRefresh">
          {{ refreshing ? 'refreshing…' : 'refresh now' }}
        </button>
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const router = useRouter()
const { apiFetch } = useApi()

/**
 * The ticker travels as a query parameter rather than a path segment.
 *
 * This is a statically generated site: /asset/AMD would have to be prerendered
 * per ticker, which is impossible for symbols nobody has visited yet, and would
 * otherwise depend on the host rewriting unknown paths. One prerendered /asset
 * page reading ?symbol works for every ticker with nothing host-specific.
 */
const symbol = computed(() => String(route.query.symbol ?? '').toUpperCase().trim())

const data = ref<any>(null)
const loading = ref(false)
const refreshing = ref(false)
const error = ref<string | null>(null)
const detail = ref<string | null>(null)
const expanded = ref(false)
const allIncome = ref(false)
const allBalance = ref(false)

/** A long series is useful to have and unreadable to dump; show a window. */
const shownIncome = computed(() =>
  allIncome.value ? data.value.incomeQuarterly : (data.value?.incomeQuarterly ?? []).slice(0, 12),
)
const shownBalance = computed(() =>
  allBalance.value ? data.value.balanceSheetQuarterly : (data.value?.balanceSheetQuarterly ?? []).slice(0, 12),
)

async function load() {
  if (!symbol.value) return
  loading.value = true
  error.value = null
  detail.value = null
  data.value = null
  expanded.value = false
  try {
    data.value = await apiFetch(`/api/fundamentals/${symbol.value}`)
  } catch (err: any) {
    error.value = err?.data?.error || err?.message || 'Could not load this ticker'
    detail.value = err?.data?.detail ?? null
  } finally {
    loading.value = false
  }
}

async function forceRefresh() {
  refreshing.value = true
  try {
    data.value = await apiFetch(`/api/fundamentals/${symbol.value}/refresh`, { method: 'POST' })
  } catch (err: any) {
    error.value = err?.data?.error || 'Refresh failed'
  } finally {
    refreshing.value = false
  }
}

function go(s: string) {
  const t = s.trim().toUpperCase()
  if (t) router.push({ path: '/asset', query: { symbol: t } })
}

// ── Formatting ──────────────────────────────────────────────────────
/** Money in the billions is unreadable in full; scale it instead. */
function big(n: number | null | undefined) {
  if (n == null) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}
function fmtNum(n: number | null | undefined, dp = 2) {
  return n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}
/** Provider ratios arrive as fractions; percentages read better. */
function pct(n: number | null | undefined) {
  return n == null ? '—' : `${(n * 100).toFixed(1)}%`
}
function title(s?: string) {
  if (!s) return ''
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}
function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s
}
function margin(q: any) {
  if (!q.totalRevenue || q.netIncome == null) return null
  return q.netIncome / q.totalRevenue
}
function currentRatio(b: any) {
  if (!b.totalCurrentLiabilities || b.totalCurrentAssets == null) return '—'
  return (b.totalCurrentAssets / b.totalCurrentLiabilities).toFixed(2)
}
function iconColor(sym: string) {
  let h = 0
  for (let i = 0; i < sym.length; i++) h = sym.charCodeAt(i) + ((h << 5) - h)
  return `hsl(${Math.abs(h) % 360}, 62%, 45%)`
}

const range52 = computed(() => data.value?.metrics?.week52High != null)

/** Nothing numeric came back, so the ratio grid would be twelve dashes. */
const hasMetrics = computed(() =>
  Object.values(data.value?.metrics ?? {}).some(v => v != null),
)

const metricTiles = computed(() => {
  const m = data.value?.metrics ?? {}
  return [
    {
      label: 'P/E',
      value: fmtNum(m.peRatio),
      hint: m.peRatio == null && (m.netIncomeTTM ?? 0) <= 0 ? 'not meaningful — loss' : 'trailing',
    },
    { label: 'Forward P/E', value: fmtNum(m.forwardPE), hint: 'on estimates' },
    { label: 'PEG', value: fmtNum(m.pegRatio) },
    { label: 'EPS', value: m.eps != null ? `$${fmtNum(m.eps)}` : '—', hint: 'trailing 12m' },
    { label: 'Market cap', value: big(m.marketCap) },
    { label: 'Price / book', value: fmtNum(m.priceToBook) },
    { label: 'Price / sales', value: fmtNum(m.priceToSales) },
    { label: 'EV / EBITDA', value: fmtNum(m.evToEbitda) },
    { label: 'Net margin', value: pct(m.profitMargin) },
    { label: 'Gross margin', value: pct(m.grossMargin) },
    { label: 'Return on equity', value: pct(m.returnOnEquity) },
    { label: 'Debt / equity', value: fmtNum(m.debtToEquity) },
    { label: 'Revenue TTM', value: big(m.revenueTTM) },
    { label: 'Beta', value: fmtNum(m.beta) },
  ]
})

watch(symbol, load)
onMounted(load)
</script>
