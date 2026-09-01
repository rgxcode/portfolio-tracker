<template>
  <div class="relative w-full h-full min-h-[250px] flex items-center justify-center">
    <div v-if="loading" class="text-n-500 text-sm flex items-center gap-2">
      <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      Loading chart…
    </div>
    <div v-else-if="!hasData" class="text-center text-n-600 text-sm">
      No price history available
    </div>
    <Line v-else :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup lang="ts">
/**
 * The portfolio's value over the selected period.
 *
 * The line is the accent colour whichever way the period went. Gain and loss
 * have their own two colours in this system and they are spent on the figures;
 * a chart that also turns red says the same thing twice and leaves the eye
 * nothing to rank.
 */
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  type ChartOptions,
  type ChartData,
  type ScriptableContext,
} from 'chart.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)

const props = defineProps<{
  labels: string[]
  values: number[]
  loading: boolean
}>()

const hasData = computed(() => props.values.length > 1)

const ACCENT = '#9184d9'

/**
 * The area under the line, faded to nothing at the bottom.
 *
 * Built from the canvas rather than declared as a colour because a CSS
 * gradient cannot be handed to Chart.js. `chartArea` is undefined on the very
 * first paint, before the layout is measured — returning a flat colour for
 * that one frame avoids the crash and is replaced on the next.
 */
function fill(ctx: ScriptableContext<'line'>) {
  const { chart } = ctx
  const { ctx: canvas, chartArea } = chart
  if (!chartArea) return 'rgba(145,132,217,0.18)'
  const g = canvas.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
  g.addColorStop(0, 'rgba(145,132,217,0.34)')
  g.addColorStop(1, 'rgba(145,132,217,0)')
  return g
}

const chartData = computed<ChartData<'line'>>(() => ({
  labels: props.labels,
  datasets: [
    {
      data: props.values,
      borderColor: ACCENT,
      backgroundColor: fill,
      borderWidth: 1.75,
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      pointHitRadius: 10,
      // The design marks where the series ends. Only the last point gets a
      // dot; the rest stay clean.
      pointHoverRadius: 3.5,
      pointHoverBackgroundColor: ACCENT,
      pointHoverBorderColor: ACCENT,
    },
  ],
}))

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        title: items => items[0]?.label ?? '',
        label: ctx => `$${ctx.parsed.y.toLocaleString('en-US', {
          minimumFractionDigits: 2, maximumFractionDigits: 2,
        })}`,
      },
      backgroundColor: '#232532',
      titleColor: '#9397ab',
      bodyColor: '#e9e9ed',
      borderColor: '#3f424d',
      borderWidth: 1,
      padding: 10,
      displayColors: false,
    },
  },
  scales: {
    x: {
      display: true,
      grid: { display: false },
      border: { display: false },
      ticks: {
        color: '#75798c',
        font: { size: 10.5 },
        // Five dates across the foot, as in the design — a label per point
        // would be an unreadable smear at a month's resolution.
        maxTicksLimit: 5,
        maxRotation: 0,
        autoSkip: true,
      },
    },
    y: {
      display: true,
      position: 'right',
      grid: { color: 'rgba(233,233,237,0.07)' },
      border: { display: false },
      ticks: {
        color: '#75798c',
        font: { size: 10.5 },
        maxTicksLimit: 5,
        callback: val => compact(Number(val)),
      },
    },
  },
}))

/** "252k" rather than "252,431" — the axis is for scale, not for precision. */
function compact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}m`
  if (abs >= 1_000) return `${Math.round(n / 1_000)}k`
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
</script>
