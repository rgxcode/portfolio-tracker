<template>
  <section class="bg-gray-800 border border-gray-700 rounded-2xl p-5 mb-6">
    <div class="flex items-baseline justify-between gap-3 flex-wrap mb-3">
      <div>
        <h2 class="font-semibold text-white">Price history</h2>
        <p class="text-xs text-gray-500">
          <template v-if="stats">
            {{ stats.change >= 0 ? '+' : '' }}{{ stats.change.toFixed(1) }}% over {{ periodLabel }}
            · low ${{ fmt(stats.low) }} · high ${{ fmt(stats.high) }}
          </template>
          <template v-else-if="!loading">No stored history for {{ symbol }}.</template>
        </p>
      </div>
      <div class="flex items-center gap-1">
        <button
          v-for="p in PERIODS"
          :key="p"
          class="px-2.5 py-1 rounded-full text-xs font-semibold transition-colors"
          :class="period === p ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'"
          @click="select(p)"
        >{{ p }}</button>
      </div>
    </div>

    <div class="h-64">
      <div v-if="loading && !points.length" class="h-full flex items-center justify-center text-gray-500 text-sm">
        Loading…
      </div>
      <div v-else-if="!points.length" class="h-full flex items-center justify-center text-gray-500 text-sm">
        Nothing stored for this range.
      </div>
      <Line v-else :data="chartData" :options="chartOptions" />
    </div>

    <p v-if="carried" class="text-xs text-amber-400/80 mt-2">
      Market closed for this window — the line holds the last close rather than showing movement.
    </p>
  </section>
</template>

<script setup lang="ts">
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip,
} from 'chart.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)

const props = defineProps<{ symbol: string }>()

const PERIODS = ['1M', '6M', '1Y', '3Y', '5Y', 'ALL'] as const
const config = useRuntimeConfig()

const period = ref<string>('1Y')
const points = ref<Array<{ timestamp: number, price: number }>>([])
const carried = ref(false)
const loading = ref(false)

const periodLabel = computed(() =>
  period.value === 'ALL' ? 'all stored history' : period.value)

async function load() {
  if (!props.symbol) return
  loading.value = true
  try {
    // Prices are public, so this needs no token — the same endpoint the
    // dashboard chart reads, which is where the stored history already lives.
    const res = await $fetch<any>(
      `${config.public.apiBaseUrl}/api/prices/${encodeURIComponent(props.symbol)}/history?period=${period.value}`,
    )
    points.value = res.points ?? []
    carried.value = Boolean(res.carriedForward)
  } catch {
    points.value = []
  } finally {
    loading.value = false
  }
}

function select(p: string) {
  period.value = p
  load()
}

/** Headline numbers for the range, so the chart is readable without hovering. */
const stats = computed(() => {
  if (points.value.length < 2) return null
  const prices = points.value.map(p => p.price)
  const first = prices[0]
  const last = prices[prices.length - 1]
  return {
    change: first ? ((last - first) / first) * 100 : 0,
    low: Math.min(...prices),
    high: Math.max(...prices),
  }
})

/** Sub-dollar assets need real precision; a $78,000 one does not. */
function fmt(v: number) {
  if (v == null) return '—'
  if (Math.abs(v) >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (Math.abs(v) >= 1) return v.toFixed(2)
  return v.toPrecision(3)
}

const rising = computed(() => (stats.value?.change ?? 0) >= 0)

/** Short over days, month-and-year over years — the span decides the format. */
function tickLabel(ms: number) {
  const span = points.value.length
    ? points.value[points.value.length - 1].timestamp - points.value[0].timestamp
    : 0
  const d = new Date(ms)
  if (span > 400 * 86400e3) return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
  if (span > 60 * 86400e3) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/**
 * Points carry their own x value, so the axis is proportional to time.
 *
 * With a category axis Chart.js spaces points by index, which is only honest
 * when samples are evenly spaced in time. They are not: the series is thinned
 * for display, and markets close at weekends, so equal steps across the axis
 * covered unequal spans and the tick dates came out irregular.
 */
const chartData = computed(() => ({
  datasets: [{
    data: points.value.map(p => ({ x: p.timestamp, y: p.price })),
    borderColor: rising.value ? '#199e70' : '#e66767',
    backgroundColor: rising.value ? 'rgba(25,158,112,0.12)' : 'rgba(230,103,103,0.12)',
    borderWidth: 2,
    fill: true,
    tension: 0.25,
    pointRadius: 0,
    pointHitRadius: 10,
  }],
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false as const,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#111827', borderColor: '#374151', borderWidth: 1, padding: 10,
      titleColor: '#f3f4f6', bodyColor: '#d1d5db',
      callbacks: {
        title: (items: any[]) => new Date(items[0].parsed.x).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'short', year: 'numeric',
        }),
        label: (c: any) => ` $${fmt(c.parsed.y)}`,
      },
    },
  },
  scales: {
    x: {
      // Linear over epoch milliseconds: true time spacing without pulling in a
      // date adapter for the sake of one axis.
      type: 'linear' as const,
      bounds: 'data' as const,
      grid: { display: false },
      ticks: {
        color: '#9ca3af',
        font: { size: 10 },
        maxTicksLimit: 7,
        maxRotation: 0,
        autoSkip: true,
        callback: (v: any) => tickLabel(Number(v)),
      },
    },
    y: {
      grid: { color: 'rgba(148,163,184,0.12)', drawTicks: false },
      border: { display: false },
      ticks: { color: '#9ca3af', font: { size: 10 }, callback: (v: any) => `$${fmt(v)}` },
    },
  },
}))

watch(() => props.symbol, load)
onMounted(load)
</script>
