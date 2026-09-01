<template>
  <div class="mb-8">
    <h3 class="text-white font-bold text-lg mb-4">Allocation</h3>
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-4">
      <!-- By Type -->
      <div class="bg-gray-800/50 rounded-2xl border border-gray-700 p-5">
        <p class="text-gray-400 text-xs font-semibold tracking-wider uppercase mb-3">By Type</p>
        <div class="h-72 xl:h-64">
          <AllocationPieChart
            :labels="d.typeAllocation.labels"
            :values="d.typeAllocation.values"
            :colors="d.typeAllocation.colors"
          />
        </div>
      </div>

      <!-- By Asset -->
      <div class="bg-gray-800/50 rounded-2xl border border-gray-700 p-5">
        <p class="text-gray-400 text-xs font-semibold tracking-wider uppercase mb-3">By Asset</p>
        <div class="h-72 xl:h-64">
          <AllocationPieChart
            :labels="d.assetAllocation.labels"
            :values="d.assetAllocation.values"
            :colors="d.assetAllocation.colors"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * How the portfolio splits, by type and by individual asset.
 *
 * A section of the dashboard, split out so the order and placement of these can
 * be chosen rather than fixed by the markup. Shared state arrives through
 * inject rather than a long prop list: every section reads from the same
 * portfolio, and passing it down piece by piece would be noise.
 */
const d = inject<any>('dash')

// Rendering nothing at all would look like an empty dashboard rather than a
// wiring fault, and take an hour to tell apart.
if (!d && import.meta.client) console.error('DashboardAllocation: dashboard state was not provided')
</script>
