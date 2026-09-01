<template>
  <!-- One placeable section. The mapping lives here so the page can render a
       list of ids without knowing what any of them are. -->
  <DashboardPortfolio v-if="id === 'portfolio'" />
  <DashboardHoldings v-else-if="id === 'holdings'" />
  <DashboardAllocation v-else-if="id === 'allocation'" />
  <DashboardMetrics v-else-if="id === 'metrics'" />
  <PortfolioInsights v-else-if="id === 'insights'" />
</template>

<script setup lang="ts">
defineProps<{ id: string }>()
</script>
