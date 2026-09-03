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
        <!--
          The ledger, newest first. It starts at the first transaction
          recorded, not at the beginning of the portfolio: the holdings here
          predate it, and inventing dates and prices for them would be a
          history rather than a record.
        -->
        <section v-if="store.transactions.length" class="mb-6">
          <h2 class="text-base font-semibold text-white mb-3">
            Transactions
            <span class="text-gray-500 font-normal text-sm ml-1">({{ store.transactions.length }})</span>
          </h2>
          <ul class="bg-gray-800 border border-gray-700 rounded-xl divide-y divide-gray-700 overflow-hidden">
            <li
              v-for="t in store.transactions.slice(0, 12)"
              :key="t.id"
              class="flex items-center gap-3 px-4 py-2.5 text-sm"
            >
              <span
                class="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 w-11 text-center"
                :class="t.side === 'sell'
                  ? 'bg-rose-900/60 text-rose-300'
                  : 'bg-emerald-900/60 text-emerald-300'"
              >{{ t.side }}</span>
              <span class="font-medium text-white w-16 shrink-0">{{ t.symbol }}</span>
              <span class="text-gray-400 tabular-nums">
                {{ t.quantity.toLocaleString('en-US', { maximumFractionDigits: 8 }) }}
                <span class="text-gray-600">@</span>
                ${{ t.unitPrice.toLocaleString('en-US', { maximumFractionDigits: 6 }) }}
              </span>
              <!-- Only a sale has a result; a purchase has not resolved yet. -->
              <span
                v-if="t.side === 'sell' && t.realizedPnl !== null && t.realizedPnl !== undefined"
                class="text-xs tabular-nums"
                :class="t.realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'"
              >
                {{ t.realizedPnl >= 0 ? '+' : '−' }}${{ Math.abs(t.realizedPnl).toLocaleString('en-US', { maximumFractionDigits: 2 }) }}
              </span>
              <span class="ml-auto text-xs text-gray-500 shrink-0">{{ shortDate(t.date) }}</span>
            </li>
          </ul>
        </section>

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
  // The store already holds the result — a buy folds into an existing holding
  // rather than appending, a sale that emptied one removed the row, and the
  // new transaction was put at the top of the ledger. All from the reply.
}

/** "3 Sep 2026" — enough to place a trade without spelling out the year twice. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

onMounted(() => {
  store.fetchTransactions()
})

useHead({ title: 'Manage Assets – Portfolio Tracker' })
</script>
