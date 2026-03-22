<template>
  <div>
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-bold text-white">Manage Assets</h1>
        <p class="text-gray-400 text-sm mt-1">Add, view, and remove assets from your portfolio</p>
      </div>
      <NuxtLink
        to="/"
        class="text-gray-400 hover:text-white text-sm flex items-center gap-1 transition-colors"
      >
        ← Back to Dashboard
      </NuxtLink>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Add Asset Form -->
      <div>
        <AssetForm @added="onAssetAdded" />

        <!-- API key notice -->
        <div class="mt-4 bg-yellow-900/20 border border-yellow-700/50 rounded-xl p-4">
          <h3 class="text-yellow-400 font-semibold text-sm mb-1">⚙️ API Configuration</h3>
          <ul class="text-yellow-200/70 text-xs space-y-1">
            <li>
              <strong>Crypto prices</strong>: Powered by CoinGecko (free, no key required).
              Add <code class="bg-gray-800 px-1 rounded">NUXT_PUBLIC_COINGECKO_API_KEY</code> to your
              <code class="bg-gray-800 px-1 rounded">.env</code> for higher rate limits.
            </li>
            <li>
              <strong>Stock prices</strong>: Powered by Alpha Vantage. Add your free key as
              <code class="bg-gray-800 px-1 rounded">NUXT_PUBLIC_ALPHA_VANTAGE_API_KEY</code> in
              <code class="bg-gray-800 px-1 rounded">.env</code>.
              Get one at <span class="underline">alphavantage.co</span>.
            </li>
          </ul>
        </div>
      </div>

      <!-- Current Assets -->
      <div>
        <h2 class="text-base font-semibold text-white mb-4">
          Current Assets
          <span class="text-gray-500 font-normal text-sm ml-1">({{ store.assets.length }})</span>
        </h2>

        <div v-if="store.assets.length === 0" class="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center text-gray-500">
          <p>No assets added yet. Use the form to add your first investment.</p>
        </div>

        <div v-else class="space-y-3">
          <AssetCard
            v-for="asset in store.sortedAssets"
            :key="asset.id"
            v-bind="asset"
            @remove="store.removeAsset(asset.id)"
          />
        </div>

        <!-- Total summary -->
        <div v-if="store.assets.length > 0" class="mt-4 bg-gray-800 border border-gray-700 rounded-xl p-4">
          <div class="flex justify-between text-sm text-gray-400">
            <span>Portfolio Value</span>
            <span class="text-white font-semibold">
              ${{ store.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
            </span>
          </div>
          <div class="flex justify-between text-sm text-gray-400 mt-2">
            <span>Total P&L</span>
            <span
              class="font-semibold"
              :class="store.totalProfitLoss >= 0 ? 'text-emerald-400' : 'text-red-400'"
            >
              {{ store.totalProfitLoss >= 0 ? '+' : '' }}${{ store.totalProfitLoss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
              ({{ store.totalProfitLossPercent.toFixed(2) }}%)
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Storage Info -->
    <StorageInfo class="mt-6" />
  </div>
</template>

<script setup lang="ts">
import { usePortfolioStore } from '~/stores/portfolio'

const store = usePortfolioStore()

onMounted(() => {
  store.loadFromStorage()
})

function onAssetAdded() {
  // Asset was added via the form; store already updated
}

useHead({ title: 'Manage Assets – Portfolio Tracker' })
</script>
