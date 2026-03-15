<template>
  <div
    class="bg-gray-800 border border-gray-700 rounded-xl p-5 flex items-center gap-4"
    :class="colorClass"
  >
    <div class="p-3 rounded-lg" :class="iconBgClass">
      <slot name="icon" />
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-gray-400 text-sm">{{ label }}</p>
      <p class="text-xl font-bold text-white mt-0.5 truncate">{{ value }}</p>
    </div>
    <div v-if="badge !== undefined" class="text-right">
      <span
        class="text-sm font-semibold px-2 py-1 rounded-lg"
        :class="badgePositive ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'"
      >
        {{ badgePositive ? '▲' : '▼' }} {{ Math.abs(badge).toFixed(2) }}%
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  value: string
  badge?: number
  badgePositive?: boolean
  colorClass?: string
  iconBgClass?: string
}>()
</script>
