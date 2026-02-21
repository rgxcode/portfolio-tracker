<template>
  <div>
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
      <div>
        <h1 class="text-2xl font-bold text-white">Dashboard</h1>
        <p v-if="store.lastRefreshed" class="text-gray-400 text-sm mt-1">
          Last updated: {{ formatDate(store.lastRefreshed) }}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <NuxtLink
          to="/assets"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Add Asset
        </NuxtLink>
        <button
          class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
          :disabled="store.isLoading"
          @click="refresh"
        >
          <svg
            class="w-4 h-4"
            :class="{ 'animate-spin': store.isLoading }"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>
    </div>

    <!-- Error banner -->
    <div v-if="store.error" class="mb-6 bg-red-900/30 border border-red-700 rounded-xl p-4 flex items-center gap-3">
      <svg class="w-5 h-5 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p class="text-red-300 text-sm">{{ store.error }}</p>
    </div>

    <!-- Empty state -->
    <div v-if="store.assets.length === 0" class="text-center py-20">
      <div class="bg-gray-800 rounded-2xl p-10 max-w-md mx-auto border border-gray-700">
        <svg class="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2 class="text-xl font-bold text-white mb-2">No assets yet</h2>
        <p class="text-gray-400 mb-6 text-sm">Start by adding your first investment to track your portfolio performance.</p>
        <NuxtLink
          to="/assets"
          class="inline-block px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          Add Your First Asset
        </NuxtLink>
      </div>
    </div>

    <template v-else>
      <!-- Stats row -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard
          label="Total Portfolio Value"
          :value="`$${store.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`"
          icon-bg-class="bg-blue-900/50"
        >
          <template #icon>
            <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </template>
        </StatsCard>

        <StatsCard
          label="Total Cost Basis"
          :value="`$${store.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`"
          icon-bg-class="bg-gray-700"
        >
          <template #icon>
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </template>
        </StatsCard>

        <StatsCard
          label="Total Profit / Loss"
          :value="`${store.totalProfitLoss >= 0 ? '+' : ''}$${store.totalProfitLoss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`"
          :badge="store.totalProfitLossPercent"
          :badge-positive="store.totalProfitLoss >= 0"
          icon-bg-class="bg-emerald-900/50"
        >
          <template #icon>
            <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </template>
        </StatsCard>

        <StatsCard
          label="Assets Tracked"
          :value="String(store.assets.length)"
          icon-bg-class="bg-purple-900/50"
        >
          <template #icon>
            <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </template>
        </StatsCard>
      </div>

      <!-- Charts row -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <!-- Allocation Pie Chart -->
        <div class="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 class="text-base font-semibold text-white mb-4">Portfolio Allocation</h2>
          <div class="h-72">
            <AllocationPieChart
              :labels="store.allocationData.labels"
              :values="store.allocationData.values"
              :colors="store.allocationData.colors"
            />
          </div>
        </div>

        <!-- P&L Bar Chart -->
        <div class="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 class="text-base font-semibold text-white mb-4">Profit / Loss by Asset</h2>
          <div class="h-72">
            <ProfitLossBarChart :assets="profitLossData" />
          </div>
        </div>
      </div>

      <!-- Asset list -->
      <div>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-base font-semibold text-white">Holdings</h2>
          <NuxtLink to="/assets" class="text-blue-400 hover:text-blue-300 text-sm transition-colors">
            Manage →
          </NuxtLink>
        </div>
        <div class="space-y-3">
          <AssetCard
            v-for="asset in store.sortedAssets"
            :key="asset.id"
            v-bind="asset"
            @remove="store.removeAsset(asset.id)"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { usePortfolioStore } from '~/stores/portfolio'
import { useMarketData } from '~/composables/useMarketData'

const store = usePortfolioStore()
const { refreshAllPrices } = useMarketData()

// Load assets from localStorage on mount
onMounted(() => {
  store.loadFromStorage()
  if (store.assets.length > 0) {
    refreshAllPrices()
  }
})

async function refresh() {
  await refreshAllPrices()
}

const profitLossData = computed(() =>
  store.sortedAssets.map(a => ({
    symbol: a.symbol,
    profitLoss: (a.currentPrice - a.purchasePrice) * a.quantity,
    profitLossPercent:
      a.purchasePrice > 0
        ? ((a.currentPrice - a.purchasePrice) / a.purchasePrice) * 100
        : 0,
  })),
)

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

useHead({ title: 'Dashboard – Portfolio Tracker' })
</script>
