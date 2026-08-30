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
        <div class="relative">
          <input
            v-model="form.symbol"
            type="text"
            required
            autocomplete="off"
            placeholder="BTC"
            class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase"
            @input="onSymbolInput"
            @blur="closeSuggestionsSoon"
          />

          <!-- Picking a suggestion fills the name and type, so neither has to be
               typed and neither can disagree with the symbol. -->
          <ul
            v-if="suggestions.length"
            class="absolute top-full left-0 right-0 mt-1 z-30 bg-gray-900 border border-gray-600 rounded-lg shadow-xl overflow-hidden"
          >
            <li
              v-for="s in suggestions"
              :key="s.symbol"
              class="px-3 py-2 cursor-pointer flex items-baseline gap-2 hover:bg-gray-700"
              @mousedown.prevent="applySuggestion(s)"
            >
              <span class="font-semibold text-white text-sm w-14 shrink-0">{{ s.symbol }}</span>
              <span class="text-gray-300 text-sm truncate">{{ s.name }}</span>
              <span
                class="text-[10px] ml-auto shrink-0 px-1.5 py-0.5 rounded"
                :class="s.type === 'crypto' ? 'bg-blue-900/60 text-blue-300' : 'bg-purple-900/60 text-purple-300'"
              >{{ s.type }}</span>
            </li>
          </ul>
        </div>
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
        <p class="text-xs text-gray-500 mt-1">Filled in automatically when you pick a symbol above.</p>
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
const { refreshAllPrices, loadSupportedCrypto, supportedCrypto } = useMarketData()

// The tracked-coin list comes from the backend, so the form and the price job
// can never disagree about which symbols are supported.
const supportedSymbols = computed(() => supportedCrypto.value)
onMounted(loadSupportedCrypto)

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
  if (supportedSymbols.value.length === 0) return true // list not loaded yet
  return supportedSymbols.value.includes(form.symbol.trim().toUpperCase())
})

async function handleSubmit() {
  if (!isValid.value) return

  await store.addAsset({
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

// ── Symbol lookup ───────────────────────────────────────────────────
/**
 * The name and type used to be typed by hand, which meant a coin the app did
 * not track looked identical to one it did — the entry saved, then never
 * showed a price. Choosing from the lookup guarantees the symbol is one the
 * price jobs actually know about.
 */
const { apiFetch } = useApi()
const suggestions = ref<Array<{ symbol: string, name: string, type: string }>>([])
let lookupTimer: ReturnType<typeof setTimeout> | null = null

function onSymbolInput() {
  form.symbol = String(form.symbol ?? '').toUpperCase()
  if (lookupTimer) clearTimeout(lookupTimer)
  lookupTimer = setTimeout(lookupSymbol, 150)
}

async function lookupSymbol() {
  const q = String(form.symbol ?? '').trim()
  if (q.length < 1) { suggestions.value = []; return }
  try {
    // Scoped to the tab in view: someone adding a coin should not have to
    // scroll past equities that merely share a prefix.
    const res = await apiFetch<{ results: any[] }>(
      `/api/fundamentals/search?q=${encodeURIComponent(q)}&type=${form.type}`,
    )
    suggestions.value = res.results ?? []
  } catch {
    // Typing a symbol by hand must still work if the lookup is unavailable.
    suggestions.value = []
  }
}

watch(() => form.type, () => {
  suggestions.value = []
  if (String(form.symbol ?? '').trim()) lookupSymbol()
})

function applySuggestion(s: { symbol: string, name: string, type: string }) {
  form.symbol = s.symbol
  form.name = s.name
  form.type = s.type
  suggestions.value = []
}

function closeSuggestionsSoon() {
  setTimeout(() => { suggestions.value = [] }, 120)
}
</script>
