<template>
  <div class="n-card px-[18px] pt-4 pb-3">
    <div class="flex items-center gap-4 mb-3.5 flex-wrap">
      <span class="n-kicker">Portfolio value</span>
      <span class="flex items-center gap-1.5 text-[11.5px] text-n-400">
        <span class="w-3.5 h-0.5 rounded-sm bg-n-accent" />
        Portfolio
      </span>

      <!-- Prices poll on their own every 30s; this is for the moment you want
           to know now rather than in half a minute. It lost its old home when
           the total-worth card was replaced by the stat strip. -->
      <button
        class="ml-auto text-n-500 hover:text-n-text transition-colors disabled:opacity-40"
        title="Refresh prices"
        aria-label="Refresh prices"
        :disabled="d.store.isLoading"
        @click="d.refresh"
      >
        <svg class="w-4 h-4" :class="{ 'animate-spin': d.store.isLoading }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>

      <div class="flex gap-px border border-[rgba(233,233,237,.12)] rounded-[7px] p-0.5">
        <button
          v-for="p in d.periods"
          :key="p"
          class="text-[11.5px] px-[9px] py-1 rounded-[5px] transition-colors"
          :class="d.selectedPeriod === p
            ? 'bg-[rgba(145,132,217,.16)] text-na-300'
            : 'text-n-400 hover:text-n-text'"
          @click="d.selectPeriod(p)"
        >
          {{ p }}
        </button>
      </div>
    </div>

    <div class="h-[250px]">
      <PortfolioChart
        :labels="d.chartLabels"
        :values="d.chartValues"
        :loading="d.chartLoading"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The chart, its legend, and the period switch.
 *
 * The design also plots the S&P 500 as a dashed benchmark. This app has no
 * index series — no endpoint fetches one — so the legend names only what is
 * actually drawn rather than promising a second line that never appears.
 */
const d = inject<any>('dash')

if (!d && import.meta.client) console.error('DashboardValueChart: dashboard state was not provided')
</script>
