<template>
  <div>
  <!-- Total Worth section -->
  <div class="mb-2">
    <div class="flex items-center justify-between">
      <p class="text-gray-400 text-xs font-semibold tracking-wider uppercase">Total Worth</p>

      <!-- How current the figures are. Which job wrote them is an
           implementation detail, so it is not surfaced. -->
      <p v-if="d.snapshotAge" class="text-[11px] text-gray-500">{{ d.snapshotAge }}</p>
    </div>

    <div class="flex items-baseline gap-3 mt-1">
      <span class="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
        {{ d.formatCurrency(d.convert(d.filteredTotalValue)) }}
      </span>
      <button
        class="text-gray-400 text-lg font-medium hover:text-white transition-colors"
        title="Switch currency"
        @click="d.toggleCurrency"
      >
        {{ d.selectedCurrency }} ⇆
      </button>
      <button
        class="ml-1 text-gray-500 hover:text-gray-300 transition-colors"
        title="Refresh prices"
        :disabled="d.store.isLoading"
        @click="d.refresh"
      >
        <svg
          class="w-5 h-5"
          :class="{ 'animate-spin': d.store.isLoading }"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
    <!-- P&L summary -->
    <div class="flex items-center gap-3 mt-1">
      <span class="text-sm font-semibold" :class="d.filteredProfitLoss >= 0 ? 'text-emerald-400' : 'text-red-400'">
        {{ d.filteredProfitLoss >= 0 ? '+' : '-' }}{{ d.formatCurrency(Math.abs(d.convert(d.filteredProfitLoss))) }}
      </span>
      <span
        class="text-xs font-bold px-1.5 py-0.5 rounded"
        :class="d.filteredProfitLoss >= 0 ? 'bg-emerald-900/60 text-emerald-400' : 'bg-red-900/60 text-red-400'"
      >
        {{ d.filteredProfitLoss >= 0 ? '+' : '' }}{{ d.filteredPLPercent.toFixed(2) }}%
      </span>
    </div>
  </div>

  <!-- Portfolio chart -->
  <div class="mt-4 mb-2">
    <div class="h-64 sm:h-72 xl:h-80 2xl:h-96">
      <PortfolioChart
        :labels="d.chartLabels"
        :values="d.chartValues"
        :loading="d.chartLoading"
        :positive="d.filteredProfitLoss >= 0"
      />
    </div>
  </div>

  <!-- Time period selector -->
  <div class="flex items-center justify-center gap-1 mb-8">
    <button
      v-for="p in d.periods"
      :key="p"
      class="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
      :class="d.selectedPeriod === p
        ? 'bg-gray-700 text-white'
        : 'text-gray-500 hover:text-gray-300'"
      @click="d.selectPeriod(p)"
    >
      {{ p }}
    </button>
  </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Portfolio value, profit, and the chart of both over time.
 *
 * A section of the dashboard, split out so the order and placement of these can
 * be chosen rather than fixed by the markup. Shared state arrives through
 * inject rather than a long prop list: every section reads from the same
 * portfolio, and passing it down piece by piece would be noise.
 */
const d = inject<any>('dash')
</script>
