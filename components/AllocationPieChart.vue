<template>
  <div class="relative w-full h-full min-h-[280px] flex items-center justify-center">
    <div v-if="!hasData" class="text-center text-gray-400">
      <svg class="w-16 h-16 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
          d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
          d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
      </svg>
      <p class="text-sm">Add assets to see allocation</p>
    </div>
    <Doughnut v-else :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup lang="ts">
import { Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  type ChartOptions,
  type ChartData,
} from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

const props = defineProps<{
  labels: string[]
  values: number[]
  colors: string[]
}>()

const hasData = computed(() => props.values.length > 0 && props.values.some(v => v > 0))

const chartData = computed<ChartData<'doughnut'>>(() => ({
  labels: props.labels,
  datasets: [
    {
      data: props.values,
      backgroundColor: props.colors,
      borderColor: '#1f2937',
      borderWidth: 2,
      hoverOffset: 8,
    },
  ],
}))

const chartOptions = computed<ChartOptions<'doughnut'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '60%',
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        color: '#d1d5db',
        padding: 16,
        font: { size: 12 },
        boxWidth: 12,
        boxHeight: 12,
      },
    },
    tooltip: {
      callbacks: {
        label(ctx) {
          const total = (ctx.chart.data.datasets[0].data as number[]).reduce(
            (a, b) => a + b,
            0,
          )
          const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0.0'
          return ` ${ctx.label}: $${ctx.parsed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pct}%)`
        },
      },
    },
  },
}))
</script>
