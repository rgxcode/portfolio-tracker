<template>
  <div class="bg-gray-800 border border-gray-700 rounded-xl p-5">
    <h2 class="text-lg font-semibold text-white mb-4">Add New Asset</h2>

    <form class="space-y-4" @submit.prevent="handleSubmit">
      <!-- Asset Type -->
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-1">Asset Type</label>
        <div class="flex gap-3">
          <button
            type="button"
            class="flex-1 py-2 rounded-lg text-sm font-medium border transition-colors"
            :class="form.type === 'crypto'
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'"
            @click="form.type = 'crypto'"
          >
            🪙 Crypto
          </button>
          <button
            type="button"
            class="flex-1 py-2 rounded-lg text-sm font-medium border transition-colors"
            :class="form.type === 'stock'
              ? 'bg-purple-600 border-purple-500 text-white'
              : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'"
            @click="form.type = 'stock'"
          >
            📈 Stock
          </button>
        </div>
      </div>

      <!-- Symbol -->
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-1">
          Symbol
          <span class="text-gray-500 font-normal">
            {{ form.type === 'crypto' ? '(e.g. BTC, ETH, SOL)' : '(e.g. AAPL, TSLA, MSFT)' }}
          </span>
        </label>
        <input
          v-model="form.symbol"
          type="text"
          required
          placeholder="BTC"
          class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase"
          @input="form.symbol = (form.symbol as string).toUpperCase()"
        />
      </div>

      <!-- Name -->
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-1">Name</label>
        <input
          v-model="form.name"
          type="text"
          required
          placeholder="Bitcoin"
          class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <!-- Quantity & Purchase Price -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">Quantity</label>
          <input
            v-model.number="form.quantity"
            type="number"
            required
            min="0.000001"
            step="any"
            placeholder="1.0"
            class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">Purchase Price (USD)</label>
          <input
            v-model.number="form.purchasePrice"
            type="number"
            required
            min="0.000001"
            step="any"
            placeholder="50000"
            class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <!-- Crypto hint -->
      <p v-if="form.type === 'crypto' && !isSupportedCrypto" class="text-yellow-400 text-xs">
        ⚠️ Symbol not in the auto-fetch list. Price will not be auto-updated. Supported symbols:
        {{ supportedSymbols.join(', ') }}
      </p>

      <button
        type="submit"
        class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="!isValid"
      >
        Add Asset
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { useMarketData } from '~/composables/useMarketData'

const emit = defineEmits<{ added: [] }>()

const store = usePortfolioStore()
const { COINGECKO_ID_MAP, refreshAllPrices } = useMarketData()

const supportedSymbols = Object.keys(COINGECKO_ID_MAP).map(s => s.toUpperCase())

const form = reactive({
  type: 'crypto' as 'crypto' | 'stock',
  symbol: '',
  name: '',
  quantity: null as number | null,
  purchasePrice: null as number | null,
})

const isValid = computed(() =>
  form.symbol.trim().length > 0
  && form.name.trim().length > 0
  && (form.quantity ?? 0) > 0
  && (form.purchasePrice ?? 0) > 0,
)

const isSupportedCrypto = computed(() => {
  if (form.type !== 'crypto') return true
  return !!COINGECKO_ID_MAP[form.symbol.toLowerCase()]
})

async function handleSubmit() {
  if (!isValid.value) return

  store.addAsset({
    symbol: form.symbol.trim(),
    name: form.name.trim(),
    type: form.type,
    quantity: form.quantity!,
    purchasePrice: form.purchasePrice!,
  })

  // Attempt to fetch current price immediately
  await refreshAllPrices()

  // Reset form
  form.symbol = ''
  form.name = ''
  form.quantity = null
  form.purchasePrice = null

  emit('added')
}
</script>
