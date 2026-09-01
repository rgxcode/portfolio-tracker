<template>
  <div class="mb-8">
    <h3 class="text-white font-bold text-lg mb-4">Breakdown</h3>
    <div class="bg-gray-800/50 rounded-2xl border border-gray-700 overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-700">
            <th class="text-left text-gray-400 font-semibold text-xs uppercase tracking-wider px-4 py-3">Asset</th>
            <th class="text-right text-gray-400 font-semibold text-xs uppercase tracking-wider px-4 py-3">Owned</th>
            <th class="text-right text-gray-400 font-semibold text-xs uppercase tracking-wider px-4 py-3">Cost Basis</th>
            <th class="text-right text-gray-400 font-semibold text-xs uppercase tracking-wider px-4 py-3">Value</th>
            <th class="text-right text-gray-400 font-semibold text-xs uppercase tracking-wider px-4 py-3">Unrealized Gain</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="asset in d.sortedFilteredAssets"
            :key="'tbl-' + asset.id"
            class="border-b border-gray-700/50 last:border-0 hover:bg-gray-700/30 transition-colors"
          >
            <td class="px-4 py-3">
              <NuxtLink
                :to="{ path: '/asset', query: { symbol: asset.symbol.toUpperCase() } }"
                class="flex items-center gap-2 group"
              >
                <AssetLogo :symbol="asset.symbol" :type="asset.type" :image="asset.image" :size="24" />
                <span class="text-white font-semibold group-hover:text-blue-400 transition-colors">
                  {{ asset.symbol.toUpperCase() }}
                </span>
                <svg class="w-3.5 h-3.5 text-gray-600 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </NuxtLink>
            </td>
            <td class="text-right px-4 py-3">
              <span class="text-gray-300">{{ asset.quantity }}</span>
              <span class="text-gray-500 text-xs block">at {{ d.unitPrice(asset) }}</span>
            </td>
            <td class="text-right text-gray-300 px-4 py-3">{{ d.formatCurrency(d.convert(asset.purchasePrice * asset.quantity)) }}</td>
            <td class="text-right text-white font-semibold px-4 py-3">{{ d.formatCurrency(d.convert(asset.currentPrice * asset.quantity)) }}</td>
            <td class="text-right px-4 py-3">
              <span :class="d.assetGain(asset) >= 0 ? 'text-emerald-400' : 'text-red-400'" class="font-semibold">
                {{ d.assetGain(asset) >= 0 ? '+' : '-' }}{{ d.formatCurrency(Math.abs(d.convert(d.assetGain(asset)))) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The same holdings as a table, for comparing numbers directly.
 *
 * A section of the dashboard, split out so the order and placement of these can
 * be chosen rather than fixed by the markup. Shared state arrives through
 * inject rather than a long prop list: every section reads from the same
 * portfolio, and passing it down piece by piece would be noise.
 */
const d = inject<any>('dash')
</script>
