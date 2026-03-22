<template>
  <div class="relative w-full h-full min-h-[220px] flex items-center justify-center">
    <div v-if="!hasData" class="text-center text-gray-400">
      <p class="text-sm">No profit/loss data yet</p>
    </div>
    <Bar v-else :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup lang="ts">
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  type ChartOptions,
  type ChartData,
} from 'chart.js'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

interface AssetBarData {
  symbol: string
  profitLoss: number
  profitLossPercent: number
}

const props = defineProps<{
  assets: AssetBarData[]
}>()

const hasData = computed(() => props.assets.length > 0)

const chartData = computed<ChartData<'bar'>>(() => ({
  labels: props.assets.map(a => a.symbol.toUpperCase()),
  datasets: [
    {
      label: 'P&L (USD)',
      data: props.assets.map(a => parseFloat(a.profitLoss.toFixed(2))),
      backgroundColor: props.assets.map(a =>
        a.profitLoss >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)',
      ),
      borderColor: props.assets.map(a =>
        a.profitLoss >= 0 ? 'rgb(16, 185, 129)' : 'rgb(239, 68, 68)',
      ),
      borderWidth: 1,
      borderRadius: 6,
    },
  ],
}))

const chartOptions = computed<ChartOptions<'bar'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label(ctx) {
          const val = ctx.parsed.y
          const sign = val >= 0 ? '+' : ''
          return ` P&L: ${sign}$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        },
      },
    },
  },
  scales: {
    x: {
      ticks: { color: '#9ca3af' },
      grid: { color: 'rgba(255,255,255,0.05)' },
    },
    y: {
      ticks: {
        color: '#9ca3af',
        callback(val) {
          return `$${Number(val).toLocaleString()}`
        },
      },
      grid: { color: 'rgba(255,255,255,0.05)' },
    },
  },
}))
</script>
