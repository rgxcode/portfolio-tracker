<template>
  <div class="relative w-full h-full min-h-[250px] flex items-center justify-center">
    <div v-if="loading" class="text-gray-500 text-sm flex items-center gap-2">
      <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      Loading chart...
    </div>
    <div v-else-if="!hasData" class="text-center text-gray-500 text-sm">
      No price history available
    </div>
    <Line v-else :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup lang="ts">
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
} from 'chart.js'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)

const props = defineProps<{
  labels: string[]
  values: number[]
  loading: boolean
  positive: boolean
}>()

const hasData = computed(() => props.values.length > 1)

const lineColor = computed(() => props.positive ? '#10b981' : '#ef4444')
const fillColor = computed(() => props.positive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)')

const chartData = computed<ChartData<'line'>>(() => ({
  labels: props.labels,
  datasets: [
    {
      data: props.values,
      borderColor: lineColor.value,
      backgroundColor: fillColor.value,
      borderWidth: 2,
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      pointHitRadius: 10,
    },
  ],
}))

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false,
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        title(items) {
          return items[0]?.label ?? ''
        },
        label(ctx) {
          return `$${ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        },
      },
      backgroundColor: '#1f2937',
      titleColor: '#9ca3af',
      bodyColor: '#fff',
      borderColor: '#374151',
      borderWidth: 1,
      padding: 10,
    },
  },
  scales: {
    x: {
      display: false,
    },
    y: {
      display: true,
      position: 'right',
      grid: { color: 'rgba(255,255,255,0.04)' },
      ticks: {
        color: '#6b7280',
        font: { size: 11 },
        maxTicksLimit: 5,
        callback(val) {
          return `$${Number(val).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
        },
      },
      border: { display: false },
    },
  },
}))
</script>
