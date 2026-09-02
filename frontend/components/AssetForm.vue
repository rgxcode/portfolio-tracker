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
          <button
            type="button"
            class="flex-1 py-2 rounded-lg text-sm font-medium border transition-colors"
            :class="form.type === 'commodity'
              ? 'bg-amber-600 border-amber-500 text-white'
              : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'"
            @click="form.type = 'commodity'"
          >
            🥇 Metal
          </button>
          <button
            type="button"
            class="flex-1 py-2 rounded-lg text-sm font-medium border transition-colors"
            :class="form.type === 'cash'
              ? 'bg-emerald-600 border-emerald-500 text-white'
              : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'"
            @click="form.type = 'cash'"
          >
            💵 Cash
          </button>
        </div>
      </div>

      <!--
        Cash is a balance in a currency, so it asks for those two things
        instead of a ticker, a name and a unit price. The currency doubles as
        the symbol; the rate that turns it into dollars comes from the price
        snapshot, so nothing here has to be priced by hand.
      -->
      <template v-if="form.type === 'cash'">
        <div>
          <label for="cash-currency" class="block text-sm font-medium text-gray-300 mb-1">Currency</label>
          <select
            id="cash-currency"
            v-model="form.symbol"
            class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option v-for="c in CURRENCIES" :key="c.code" :value="c.code">
              {{ c.code }} — {{ c.name }}
            </option>
          </select>
        </div>

        <div>
          <label for="cash-amount" class="block text-sm font-medium text-gray-300 mb-1">
            Amount
            <span class="text-gray-500 font-normal">held in {{ form.symbol || 'this currency' }}</span>
          </label>
          <input
            id="cash-amount"
            v-model.number="form.quantity"
            type="number"
            required
            min="0.01"
            step="any"
            placeholder="20000"
            class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p class="text-xs text-gray-500 mt-1">
            Converted at the current rate. A balance in a currency that moves against the
            dollar shows that move as a gain or a loss, which is what holding it does.
          </p>
        </div>
      </template>

      <template v-else>
      <!-- Symbol -->
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-1">
          Symbol
          <span class="text-gray-500 font-normal">
            {{ form.type === 'crypto' ? '(e.g. BTC, ETH, SOL)'
              : form.type === 'commodity' ? '(GOLD, SILVER, COPPER)'
              : '(e.g. AAPL, TSLA — or a fund: SOXX, SMH, VOO)' }}
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
              <!-- A fund and a share are added identically, so the label is
                   the only thing distinguishing SOXX from NVDA in this list. -->
              <span
                class="text-[10px] ml-auto shrink-0 px-1.5 py-0.5 rounded"
                :class="s.isEtf ? 'bg-emerald-900/60 text-emerald-300'
                  : s.type === 'crypto' ? 'bg-blue-900/60 text-blue-300'
                  : s.type === 'commodity' ? 'bg-amber-900/60 text-amber-300'
                  : 'bg-purple-900/60 text-purple-300'"
              >{{ s.isEtf ? 'ETF' : s.type }}</span>
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

      </template>

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
import { CURRENCIES, currencyName } from '~/utils/assetUnits'

const emit = defineEmits<{ added: [] }>()

const store = usePortfolioStore()
const { refreshAllPrices, loadSupportedCrypto, supportedCrypto, fxRates } = useMarketData()

/**
 * What one unit of a currency costs in dollars, right now.
 *
 * Falls back to 1 when the rate is not loaded yet. That books the balance at
 * parity, which is wrong for the cost basis but self-correcting: the next
 * price refresh sets the real value, and the alternative — refusing to save —
 * loses the entry over a table that arrives a moment later.
 */
function unitCostInUsd(code: string): number {
  if (code === 'USD') return 1
  const rate = fxRates.value?.[code]
  return rate && rate > 0 ? 1 / rate : 1
}

// The tracked-coin list comes from the backend, so the form and the price job
// can never disagree about which symbols are supported.
const supportedSymbols = computed(() => supportedCrypto.value)
onMounted(loadSupportedCrypto)

const form = reactive({
  type: 'crypto' as 'crypto' | 'stock' | 'commodity' | 'cash',
  symbol: '',
  name: '',
  quantity: null as number | null,
  purchasePrice: null as number | null,
})

const isValid = computed(() => {
  if (form.symbol.trim().length === 0 || (form.quantity ?? 0) <= 0) return false
  // Cash needs no name and no unit price: the currency names it, and what one
  // unit is worth is an exchange rate rather than something anyone types.
  if (form.type === 'cash') return true
  return form.name.trim().length > 0 && (form.purchasePrice ?? 0) > 0
})

const isSupportedCrypto = computed(() => {
  if (form.type !== 'crypto') return true
  if (supportedSymbols.value.length === 0) return true // list not loaded yet
  return supportedSymbols.value.includes(form.symbol.trim().toUpperCase())
})

async function handleSubmit() {
  if (!isValid.value) return

  const isCash = form.type === 'cash'
  const code = form.symbol.trim().toUpperCase()

  await store.addAsset({
    symbol: code,
    name: isCash ? currencyName(code) : form.name.trim(),
    type: form.type,
    quantity: form.quantity!,
    // A unit of currency is booked at what it is worth now, so a balance
    // starts level and only shows a gain once the rate has actually moved.
    // USD against USD is 1 by definition and never waits on a rate.
    purchasePrice: isCash ? unitCostInUsd(code) : form.purchasePrice!,
    ...(isCash ? { currency: code } : {}),
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
const suggestions = ref<Array<{ symbol: string, name: string, type: string, isEtf?: boolean }>>([])
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

watch(() => form.type, (type) => {
  suggestions.value = []
  if (type === 'cash') {
    // The two forms ask for different things, so carrying a ticker across into
    // the currency select — or a currency back into the symbol box — would
    // leave a field holding something it cannot mean.
    form.symbol = 'USD'
    form.name = ''
    form.purchasePrice = null
    return
  }
  if (form.symbol && CURRENCIES.some(c => c.code === form.symbol)) form.symbol = ''
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
