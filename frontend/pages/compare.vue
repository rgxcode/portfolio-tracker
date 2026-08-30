<template>
  <div>
    <div class="flex items-start justify-between gap-4 flex-wrap mb-4">
      <div>
        <h1 class="text-2xl font-bold text-white">Compare stocks</h1>
        <p class="text-sm text-gray-400 mt-0.5">
          Add up to {{ MAX }} companies to see how they have grown and how the businesses compare.
        </p>
      </div>
      <TickerSearch
        placeholder="Add a company…"
        button-label="Add"
        width-class="w-64"
        @select="add"
      />
    </div>

    <!-- Chosen companies -->
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <span
        v-for="(s, i) in symbols"
        :key="s"
        class="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg bg-gray-800 border border-gray-700 text-sm"
      >
        <span class="w-2.5 h-2.5 rounded-sm" :style="{ backgroundColor: PALETTE[i % PALETTE.length] }" />
        <span class="text-white font-medium">{{ s }}</span>
        <button class="text-gray-500 hover:text-red-400 px-1" title="Remove" @click="remove(s)">×</button>
      </span>
      <span v-if="!symbols.length" class="text-sm text-gray-500">
        Nothing selected yet — search above, or
        <button class="text-blue-400 hover:text-blue-300" @click="loadExample">try an example</button>.
      </span>
    </div>

    <!-- Period -->
    <div v-if="symbols.length" class="flex items-center gap-1 mb-6">
      <button
        v-for="p in PERIODS"
        :key="p"
        class="px-3 py-1 rounded-full text-xs font-semibold transition-colors"
        :class="period === p ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'"
        @click="setPeriod(p)"
      >{{ p }}</button>
    </div>

    <div v-if="error" class="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-6">
      <p class="text-red-300 text-sm">{{ error }}</p>
    </div>
    <div v-if="loading" class="text-gray-400 text-sm mb-6">Loading…</div>

    <template v-if="series.length">
      <!-- Performance table -->
      <div class="bg-gray-800 border border-gray-700 rounded-2xl p-4 mb-6 overflow-x-auto">
        <table class="w-full text-sm min-w-[30rem]">
          <thead>
            <tr class="text-gray-400 border-b border-gray-700">
              <th class="text-left font-medium py-2">Company</th>
              <th class="text-right font-medium py-2">Change over {{ period }}</th>
              <th class="text-right font-medium py-2">Latest revenue</th>
              <th class="text-right font-medium py-2">Latest net income</th>
              <th class="text-right font-medium py-2">Net margin</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(s, i) in series" :key="s.symbol" class="border-b border-gray-800 last:border-0">
              <td class="py-2">
                <span class="inline-flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-sm" :style="{ backgroundColor: PALETTE[i % PALETTE.length] }" />
                  <NuxtLink :to="{ path: '/asset', query: { symbol: s.symbol } }" class="text-white font-semibold hover:text-blue-400">
                    {{ s.symbol }}
                  </NuxtLink>
                  <span class="text-gray-500 text-xs truncate hidden sm:inline">{{ s.name }}</span>
                </span>
              </td>
              <td class="py-2 text-right font-semibold" :class="(s.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'">
                {{ s.changePercent == null ? '—' : (s.changePercent >= 0 ? '+' : '') + s.changePercent.toFixed(1) + '%' }}
              </td>
              <td class="py-2 text-right text-gray-200">{{ big(latest(s)?.revenue) }}</td>
              <td class="py-2 text-right text-gray-200">{{ big(latest(s)?.netIncome) }}</td>
              <td class="py-2 text-right text-gray-300">
                {{ latest(s)?.margin == null ? '—' : (latest(s).margin * 100).toFixed(1) + '%' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <ComparisonChart
          v-for="c in charts"
          :key="c.title"
          v-bind="c"
        />
      </div>

      <p class="text-xs text-gray-500 mt-4">
        Quarters are grouped by calendar quarter: companies close their books on different
        days, so AMD's Q2 ending 27 June and NVIDIA's ending 26 July are the same period.
        A gap means that company had not reported that quarter.
      </p>
      <p v-if="missing.length" class="text-xs text-gray-500 mt-1">
        No financial statements stored for {{ missing.join(', ') }} — those come from SEC filings and
        cover S&P 500 members.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  Chart as ChartJS, BarElement, LineElement, PointElement,
  LinearScale, CategoryScale, Tooltip,
} from 'chart.js'

ChartJS.register(BarElement, LineElement, PointElement, LinearScale, CategoryScale, Tooltip)

definePageMeta({ middleware: 'auth' })

const MAX = 6
const PERIODS = ['1M', '6M', 'YTD', '1Y', '3Y', '5Y']

/**
 * Categorical slots in fixed order, from a palette validated against this
 * app's chart surface: all six pairs clear the colour-vision and contrast
 * gates. Colour follows the company, by its position in the selection, so
 * removing one never repaints the others.
 */
const PALETTE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9']
const INK = '#9ca3af'
const GRID = 'rgba(148, 163, 184, 0.12)'

const route = useRoute()
const router = useRouter()
const { apiFetch } = useApi()

const symbols = ref<string[]>([])
const period = ref('1Y')
const series = ref<any[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// The selection lives in the URL, so a comparison can be linked or bookmarked.
function syncUrl() {
  router.replace({ path: '/compare', query: symbols.value.length
    ? { symbols: symbols.value.join(','), period: period.value }
    : {} })
}

function add(symbol: string) {
  const s = symbol.toUpperCase()
  if (symbols.value.includes(s)) return
  if (symbols.value.length >= MAX) {
    error.value = `Up to ${MAX} companies — remove one first.`
    return
  }
  error.value = null
  symbols.value.push(s)
  syncUrl(); load()
}

function remove(s: string) {
  symbols.value = symbols.value.filter(x => x !== s)
  syncUrl(); load()
}

function setPeriod(p: string) {
  period.value = p
  syncUrl(); load()
}

function loadExample() {
  symbols.value = ['AMD', 'NVDA', 'INTC']
  syncUrl(); load()
}

async function load() {
  if (!symbols.value.length) { series.value = []; return }
  loading.value = true
  try {
    const res = await apiFetch<any>(
      `/api/compare?symbols=${symbols.value.join(',')}&period=${period.value}`,
    )
    series.value = res.series ?? []
  } catch (err: any) {
    error.value = err?.data?.error || err?.message || 'Could not load the comparison'
  } finally {
    loading.value = false
  }
}

const latest = (s: any) => s.quarters?.[s.quarters.length - 1] ?? null
const missing = computed(() => series.value.filter(s => !s.hasFinancials).map(s => s.symbol))

function big(n: number | null | undefined) {
  if (n == null) return '—'
  const a = Math.abs(n); const sign = n < 0 ? '-' : ''
  if (a >= 1e12) return `${sign}$${(a / 1e12).toFixed(2)}T`
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(0)}M`
  return `${sign}$${a.toFixed(0)}`
}

function frame(fmt: (v: number) => string) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    // Animation off: an export taken mid-animation captures a half-drawn chart.
    animation: false as const,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#111827', borderColor: '#374151', borderWidth: 1, padding: 10,
        titleColor: '#f3f4f6', bodyColor: '#d1d5db',
        callbacks: { label: (c: any) => ` ${c.dataset.label}: ${c.parsed.y == null ? '—' : fmt(c.parsed.y)}` },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: INK, font: { size: 10 }, maxTicksLimit: 8 } },
      y: {
        grid: { color: GRID, drawTicks: false }, border: { display: false },
        ticks: { color: INK, font: { size: 10 }, callback: (v: any) => fmt(v) },
      },
    },
  }
}

/**
 * Like `frame`, but with an x axis proportional to time. Used for the price
 * line; the quarterly bars keep a category axis, which is right for discrete
 * periods that genuinely are evenly spaced.
 */
function timeFrame(fmt: (v: number) => string) {
  const base = frame(fmt)
  return {
    ...base,
    scales: {
      ...base.scales,
      x: {
        type: 'linear' as const,
        bounds: 'data' as const,
        grid: { display: false },
        ticks: {
          color: INK, font: { size: 10 }, maxTicksLimit: 7, maxRotation: 0, autoSkip: true,
          callback: (v: any) => new Date(Number(v)).toLocaleDateString('en-GB', {
            month: 'short', year: '2-digit',
          }),
        },
      },
    },
    plugins: {
      ...base.plugins,
      tooltip: {
        ...base.plugins.tooltip,
        callbacks: {
          ...base.plugins.tooltip.callbacks,
          title: (items: any[]) => new Date(items[0].parsed.x).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric',
          }),
        },
      },
    },
  }
}

const BAR = { borderRadius: 4, borderSkipped: false as const, barPercentage: 0.74, categoryPercentage: 0.8 }
const key = computed(() => series.value.map((s, i) => ({ label: s.symbol, color: PALETTE[i % PALETTE.length] })))

/**
 * The shared axis: calendar quarters, not raw period-end dates.
 *
 * Fiscal calendars differ — the same business quarter ends 27 June for AMD and
 * 26 July for NVIDIA — so grouping on the end date gave every company its own
 * slots and one bar per column, which read as missing data. The server buckets
 * each quarter and sends the label; this just aligns on it.
 */
const quarterAxis = computed(() => {
  const all = new Set<string>()
  for (const s of series.value) {
    for (const q of s.quarters ?? []) if (q.period) all.add(q.period)
  }
  // "2026 Q2" sorts chronologically as text.
  return [...all].sort().slice(-12)
})

function quarterData(field: string) {
  return {
    labels: quarterAxis.value,
    datasets: series.value.map((s, i) => ({
      label: s.symbol,
      data: quarterAxis.value.map((period) => {
        const q = (s.quarters ?? []).find((x: any) => x.period === period)
        const v = q?.[field]
        return v == null ? null : (field === 'margin' ? v * 100 : v / 1e9)
      }),
      backgroundColor: PALETTE[i % PALETTE.length],
      borderColor: PALETTE[i % PALETTE.length],
      ...BAR,
    })),
  }
}

const charts = computed(() => {
  if (!series.value.length) return []
  const withPrices = series.value.filter(s => s.hasPrices)
  const out: any[] = []

  if (withPrices.length) {
    // Indexed, not absolute: a $470 share and a $217 one on one axis compares
    // price tags, not performance. Rebasing to 100 makes growth comparable and
    // keeps a single scale rather than a second axis.
    /**
     * Each series carries its own x values rather than being aligned by index
     * into a shared list of stamps. Two companies rarely have prices on exactly
     * the same instants, and an index-based axis both spaced them unevenly in
     * time and silently misaligned them against each other.
     */
    out.push({
      title: 'Share price growth',
      subtitle: `Indexed to 100 at the start of the ${period.value} window`,
      type: 'line',
      series: key.value.filter(k => withPrices.some(s => s.symbol === k.label)),
      caption: 'portfolio-tracker · prices as stored',
      data: {
        datasets: withPrices.map((s) => {
          const colour = PALETTE[series.value.findIndex(x => x.symbol === s.symbol) % PALETTE.length]
          return {
            label: s.symbol,
            data: s.points.map((p: any) => ({ x: p.t, y: p.indexed })),
            borderColor: colour,
            backgroundColor: colour,
            borderWidth: 2, pointRadius: 0, pointHitRadius: 8, tension: 0.2, spanGaps: true,
          }
        }),
      },
      options: timeFrame((v: number) => v.toFixed(0)),
    })
  }

  if (series.value.some(s => s.hasFinancials)) {
    out.push({
      title: 'Quarterly revenue',
      subtitle: 'Last 12 reported quarters, in billions of dollars',
      type: 'bar',
      series: key.value,
      caption: 'portfolio-tracker · as filed with the SEC',
      data: quarterData('revenue'),
      options: frame((v: number) => `$${v.toFixed(0)}B`),
    })
    out.push({
      title: 'Quarterly net income',
      subtitle: 'Last 12 reported quarters, in billions of dollars',
      type: 'bar',
      series: key.value,
      caption: 'portfolio-tracker · as filed with the SEC',
      data: quarterData('netIncome'),
      options: frame((v: number) => `$${v.toFixed(1)}B`),
    })
    out.push({
      title: 'Net margin',
      subtitle: 'Net income as a share of revenue, per quarter',
      type: 'bar',
      series: key.value,
      caption: 'portfolio-tracker · as filed with the SEC',
      data: quarterData('margin'),
      options: frame((v: number) => `${v.toFixed(0)}%`),
    })
  }

  return out
})

onMounted(() => {
  const q = String(route.query.symbols ?? '')
  if (q) symbols.value = q.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, MAX)
  if (route.query.period) period.value = String(route.query.period).toUpperCase()
  load()
})
</script>
