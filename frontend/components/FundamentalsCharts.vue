<template>
  <section v-if="hasAny" class="mb-6">
    <h2 class="font-semibold text-white mb-3">At a glance</h2>
    <div class="grid gap-4 lg:grid-cols-2">
      <figure v-for="c in charts" :key="c.title" class="bg-gray-800 border border-gray-700 rounded-2xl p-4">
        <figcaption class="mb-1">
          <h3 class="text-sm font-semibold text-gray-100">{{ c.title }}</h3>
          <p class="text-xs text-gray-500">{{ c.subtitle }}</p>
        </figcaption>

        <!-- Identity never rests on colour alone: every series is named here. -->
        <ul class="flex flex-wrap gap-x-4 gap-y-1 my-2">
          <li v-for="s in c.series" :key="s.label" class="flex items-center gap-1.5 text-xs text-gray-400">
            <span class="w-2.5 h-2.5 rounded-sm shrink-0" :style="{ backgroundColor: s.color }" />
            {{ s.label }}
          </li>
        </ul>

        <div class="h-52">
          <Bar v-if="c.type === 'bar'" :data="c.data" :options="c.options" />
          <Line v-else :data="c.data" :options="c.options" />
        </div>
      </figure>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Bar, Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  BarElement,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
} from 'chart.js'

ChartJS.register(BarElement, LineElement, PointElement, LinearScale, CategoryScale, Tooltip)

const props = defineProps<{
  income: any[]
  earnings: any[]
  balance: any[]
}>()

/**
 * Categorical slots in fixed order, taken from the validated dark-mode palette
 * and checked against this app's chart surface (#1f2937): every pair clears the
 * colour-vision and contrast gates. Assigned by series identity, never by rank,
 * so a chart with fewer series keeps the same colours.
 */
const BLUE = '#3987e5'
const ORANGE = '#d95926'
const AQUA = '#199e70'

const INK = '#9ca3af'      // axis and tick text — never a series colour
const GRID = 'rgba(148, 163, 184, 0.12)' // recessive: present, not competing

/** Tables read newest-first; a time axis has to read oldest-first. */
const chrono = (rows: any[]) => [...(rows ?? [])].reverse()

/** "2026-06-30" → "Jun '26" — enough to place the quarter without crowding. */
function quarterLabel(d: string) {
  if (!d) return ''
  const [y, m] = d.split('-')
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]
  return `${month} '${y.slice(2)}`
}

function billions(n: number | null) {
  return n == null ? null : n / 1e9
}

const money = (v: number) =>
  Math.abs(v) >= 1 ? `$${v.toFixed(2)}B` : `$${(v * 1000).toFixed(0)}M`

/** Shared frame: recessive grid, no chart-level legend (named above instead). */
function baseOptions(valueFormat: (v: number) => string) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#111827',
        borderColor: '#374151',
        borderWidth: 1,
        padding: 10,
        titleColor: '#f3f4f6',
        bodyColor: '#d1d5db',
        callbacks: {
          label: (ctx: any) =>
            ` ${ctx.dataset.label}: ${ctx.parsed.y == null ? '—' : valueFormat(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: INK, font: { size: 10 } } },
      y: {
        grid: { color: GRID, drawTicks: false },
        border: { display: false },
        ticks: { color: INK, font: { size: 10 }, callback: (v: any) => valueFormat(v) },
      },
    },
  }
}

/** Thin bars with a rounded, baseline-anchored data end and a gap between them. */
const BAR = { borderRadius: 4, borderSkipped: false as const, barPercentage: 0.72, categoryPercentage: 0.78 }

const charts = computed(() => {
  const out: any[] = []

  const inc = chrono(props.income)
  if (inc.length) {
    const labels = inc.map(q => quarterLabel(q.fiscalDateEnding))

    // Revenue and net income share a unit, so they belong on one axis. Margin is
    // a percentage and gets its own chart rather than a second y-scale.
    out.push({
      title: 'Revenue and net income',
      subtitle: 'Per quarter, in billions of dollars',
      type: 'bar',
      series: [{ label: 'Revenue', color: BLUE }, { label: 'Net income', color: ORANGE }],
      data: {
        labels,
        datasets: [
          { label: 'Revenue', data: inc.map(q => billions(q.totalRevenue)), backgroundColor: BLUE, ...BAR },
          { label: 'Net income', data: inc.map(q => billions(q.netIncome)), backgroundColor: ORANGE, ...BAR },
        ],
      },
      options: baseOptions(money),
    })

    const margins = inc.map(q =>
      q.totalRevenue && q.netIncome != null ? (q.netIncome / q.totalRevenue) * 100 : null,
    )
    if (margins.some(m => m != null)) {
      out.push({
        title: 'Net margin',
        subtitle: 'Net income as a share of revenue',
        type: 'line',
        series: [{ label: 'Net margin', color: AQUA }],
        data: {
          labels,
          datasets: [{
            label: 'Net margin',
            data: margins,
            borderColor: AQUA,
            backgroundColor: AQUA,
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            // A 2px surface ring keeps points legible where the line crosses them.
            pointBorderColor: '#1f2937',
            pointBorderWidth: 2,
            tension: 0.25,
            spanGaps: true,
          }],
        },
        options: baseOptions((v: number) => `${v.toFixed(1)}%`),
      })
    }
  }

  const earn = chrono(props.earnings).filter(e => e.reportedEPS != null)
  if (earn.length) {
    out.push({
      title: 'Earnings per share',
      subtitle: 'Reported against the consensus estimate',
      type: 'bar',
      series: [{ label: 'Reported', color: BLUE }, { label: 'Estimate', color: ORANGE }],
      data: {
        labels: earn.map(e => quarterLabel(e.fiscalDateEnding)),
        datasets: [
          { label: 'Reported', data: earn.map(e => e.reportedEPS), backgroundColor: BLUE, ...BAR },
          { label: 'Estimate', data: earn.map(e => e.estimatedEPS), backgroundColor: ORANGE, ...BAR },
        ],
      },
      options: baseOptions((v: number) => `$${v.toFixed(2)}`),
    })
  }

  const bal = chrono(props.balance)
  if (bal.length) {
    // Grouped rather than stacked: assets already equal liabilities plus equity,
    // so stacking them would double-count the total.
    out.push({
      title: 'Balance sheet',
      subtitle: 'Assets, liabilities and equity per quarter, in billions',
      type: 'bar',
      series: [
        { label: 'Total assets', color: BLUE },
        { label: 'Total liabilities', color: ORANGE },
        { label: 'Equity', color: AQUA },
      ],
      data: {
        labels: bal.map(b => quarterLabel(b.fiscalDateEnding)),
        datasets: [
          { label: 'Total assets', data: bal.map(b => billions(b.totalAssets)), backgroundColor: BLUE, ...BAR },
          { label: 'Total liabilities', data: bal.map(b => billions(b.totalLiabilities)), backgroundColor: ORANGE, ...BAR },
          { label: 'Equity', data: bal.map(b => billions(b.totalShareholderEquity)), backgroundColor: AQUA, ...BAR },
        ],
      },
      options: baseOptions(money),
    })
  }

  return out
})

const hasAny = computed(() => charts.value.length > 0)
</script>
