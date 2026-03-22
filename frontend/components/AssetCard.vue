<template>
  <div
    class="bg-gray-800 rounded-xl p-5 border border-gray-700 flex items-center gap-4 hover:border-gray-600 transition-colors"
  >
    <div
      class="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
      :style="{ backgroundColor: iconBg, color: '#fff' }"
    >
      {{ symbol.slice(0, 3).toUpperCase() }}
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <h3 class="font-semibold text-white truncate">{{ name }}</h3>
        <span
          class="text-xs px-2 py-0.5 rounded-full font-medium"
          :class="type === 'crypto' ? 'bg-blue-900/60 text-blue-300' : 'bg-purple-900/60 text-purple-300'"
        >
          {{ type }}
        </span>
      </div>
      <p class="text-gray-400 text-sm mt-0.5">
        {{ quantity }} {{ symbol.toUpperCase() }} ·
        <span class="text-gray-300">Avg. ${{ purchasePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
      </p>
    </div>
    <div class="text-right shrink-0">
      <p class="font-semibold text-white">
        ${{ (currentPrice * quantity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
      </p>
      <p class="text-sm" :class="change24h >= 0 ? 'text-emerald-400' : 'text-red-400'">
        {{ change24h >= 0 ? '▲' : '▼' }}
        {{ Math.abs(change24h).toFixed(2) }}% (24h)
      </p>
      <p class="text-xs mt-0.5" :class="profitLoss >= 0 ? 'text-emerald-500' : 'text-red-500'">
        {{ profitLoss >= 0 ? '+' : '' }}${{ profitLoss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
      </p>
    </div>
    <button
      class="ml-2 text-gray-600 hover:text-red-400 transition-colors shrink-0"
      title="Remove asset"
      @click="$emit('remove')"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  id: string
  symbol: string
  name: string
  type: 'crypto' | 'stock'
  quantity: number
  purchasePrice: number
  currentPrice: number
  change24h: number
}>()

defineEmits<{ remove: [] }>()

const profitLoss = computed(
  () => (props.currentPrice - props.purchasePrice) * props.quantity,
)

// Generate a deterministic color from symbol string
const iconBg = computed(() => {
  const colors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
    '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
  ]
  let hash = 0
  for (let i = 0; i < props.symbol.length; i++) {
    hash = (hash << 5) - hash + props.symbol.charCodeAt(i)
    hash |= 0
  }
  return colors[Math.abs(hash) % colors.length]
})
</script>
