<template>
  <div>
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-bold text-white">Manage Assets</h1>
        <p class="text-gray-400 text-sm mt-1">Add, edit, and remove the holdings in your portfolio</p>
      </div>
      <NuxtLink
        to="/"
        class="text-gray-400 hover:text-white text-sm flex items-center gap-1 transition-colors"
      >
        ← Back to Home
      </NuxtLink>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Add Asset Form -->
      <div>
        <AssetForm @added="onAssetAdded" />

        <!-- Where prices come from -->
        <div class="mt-4 bg-gray-800/40 border border-gray-700 rounded-xl p-4">
          <h3 class="text-gray-300 font-semibold text-sm mb-1">📈 Price data</h3>
          <ul class="text-gray-400 text-xs space-y-1">
            <li>
              <strong>Crypto</strong>: refreshed every 5 minutes by the local price job.
            </li>
            <li>
              <strong>Stocks</strong>: refreshed every 15 minutes between 10:00 and 22:00 CET,
              on weekdays.
            </li>
            <li>
              Prices and charts are served from this app's own database — no API keys are
              needed in the browser.
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

        <div v-if="store.error" class="mb-3 bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
          {{ store.error }}
        </div>

        <div v-if="store.assets.length === 0" class="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center text-gray-500">
          <p>No assets added yet. Use the form to add your first investment.</p>
        </div>

        <div v-else class="space-y-3">
          <AssetCard
            v-for="asset in store.sortedAssets"
            :key="asset.id"
            v-bind="asset"
            :on-save="patch => store.updateAsset(asset.id, patch)"
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
  </div>
</template>

<script setup lang="ts">
import { usePortfolioStore } from '~/stores/portfolio'

definePageMeta({ middleware: 'auth' })

const store = usePortfolioStore()

onMounted(() => {
  store.fetchAssets()
})

function onAssetAdded() {
  // The store already holds the result — adding folds into an existing holding
  // rather than appending, and it merged the reply over that row itself.
}

useHead({ title: 'Manage Assets – Portfolio Tracker' })
</script>
