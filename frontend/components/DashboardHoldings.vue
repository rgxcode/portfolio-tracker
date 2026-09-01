<template>
  <div>
  <!-- Sort & manage row -->
  <div class="flex items-center justify-between mb-4">
    <NuxtLink to="/assets" class="text-blue-400 hover:text-blue-300 text-sm transition-colors flex items-center gap-1">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
      </svg>
      Add Asset
    </NuxtLink>
    <div class="relative">
      <select
        v-model="d.sortMode"
        class="appearance-none bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-full px-4 py-1.5 pr-8 focus:outline-none focus:ring-1 focus:ring-gray-600 cursor-pointer"
      >
        <option value="value-desc">Highest value</option>
        <option value="gains-desc">Absolute gains (high to low)</option>
        <option value="gains-asc">Absolute gains (low to high)</option>
        <option value="pct-desc">% gains (high to low)</option>
        <option value="pct-asc">% gains (low to high)</option>
      </select>
      <svg class="w-4 h-4 text-gray-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  </div>

  <!-- Holdings list -->
  <div class="space-y-1">
    <div
      v-for="asset in d.sortedFilteredAssets"
      :key="asset.id"
      class="flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-gray-800/60 transition-colors group"
    >
      <!-- Icon -->
      <AssetLogo :symbol="asset.symbol" :type="asset.type" :image="asset.image" :size="40" />

      <!-- Name & details -->
      <div class="flex-1 min-w-0">
        <p class="text-white font-semibold text-sm">{{ asset.symbol.toUpperCase() }}</p>
        <p class="text-gray-500 text-xs">
          {{ asset.quantity }} × <span class="text-gray-300">{{ d.unitPrice(asset) }}</span>
          <span class="text-gray-600"> · paid {{ d.currencySymbol }}{{ d.convert(asset.purchasePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
        </p>
        <!-- When this price was actually taken, in CET -->
        <p v-if="asset.priceAsOfCET" class="text-gray-600 text-[10px] mt-0.5">
          @ {{ asset.priceAsOfCET }}
        </p>
      </div>

      <!-- Value & gain -->
      <div class="text-right shrink-0">
        <p class="text-white font-semibold text-sm">
          {{ d.formatCurrency(d.convert(asset.currentPrice * asset.quantity)) }}
        </p>
        <div class="flex items-center justify-end gap-1.5">
          <span class="text-xs" :class="d.assetGain(asset) >= 0 ? 'text-emerald-400' : 'text-red-400'">
            {{ d.assetGain(asset) >= 0 ? '+' : '-' }}{{ d.formatCurrency(Math.abs(d.convert(d.assetGain(asset)))) }}
          </span>
          <span
            class="text-[10px] font-bold px-1 py-0.5 rounded"
            :class="d.assetGain(asset) >= 0 ? 'bg-emerald-900/60 text-emerald-400' : 'bg-red-900/60 text-red-400'"
          >
            {{ d.assetGain(asset) >= 0 ? '+' : '' }}{{ d.assetGainPct(asset).toFixed(2) }}%
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- Footer summary -->
  <div class="mt-6 pt-4 border-t border-gray-800 flex items-center justify-between text-sm text-gray-500">
    <span>{{ d.filteredAssets.length }} asset{{ d.filteredAssets.length === 1 ? '' : 's' }}</span>
    <div class="text-right">
      <div v-if="d.snapshotCET" class="text-xs">Snapshot {{ d.snapshotCET }}</div>
      <div v-if="d.stockWindow" class="text-[10px] text-gray-600">
        Stocks {{ d.stockWindow.open ? 'live' : 'paused' }} · {{ d.stockWindow.status }}
      </div>
    </div>
  </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Every holding with its quantity, unit price, value and gain.
 *
 * A section of the dashboard, split out so the order and placement of these can
 * be chosen rather than fixed by the markup. Shared state arrives through
 * inject rather than a long prop list: every section reads from the same
 * portfolio, and passing it down piece by piece would be noise.
 */
const d = inject<any>('dash')
</script>
