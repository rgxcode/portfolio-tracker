<template>
  <div class="bg-gray-800 rounded-xl p-5 border border-gray-700 transition-colors" :class="editing ? 'border-blue-600' : 'hover:border-gray-600'">
    <!-- ── Reading ─────────────────────────────────────────────────── -->
    <div v-if="!editing" class="flex items-center gap-4">
      <AssetLogo :symbol="symbol" :type="type" :image="image" :size="44" />

      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <h3 class="font-semibold text-white truncate">{{ name }}</h3>
          <span
            class="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
            :class="typeClass"
          >
            {{ type }}
          </span>
        </div>
        <p class="text-gray-400 text-sm mt-0.5">
          {{ quantity.toLocaleString('en-US', { maximumFractionDigits: 8 }) }}
          {{ unit || symbol.toUpperCase() }}
          <span v-if="type !== 'cash'" class="text-gray-300">
            · Avg. ${{ money(purchasePrice) }}
          </span>
        </p>
      </div>

      <div class="text-right shrink-0">
        <p class="font-semibold text-white">${{ money(currentPrice * quantity) }}</p>
        <p v-if="type !== 'cash'" class="text-sm" :class="change24h >= 0 ? 'text-emerald-400' : 'text-red-400'">
          {{ change24h >= 0 ? '▲' : '▼' }} {{ Math.abs(change24h).toFixed(2) }}% (24h)
        </p>
        <p class="text-xs mt-0.5" :class="profitLoss >= 0 ? 'text-emerald-500' : 'text-red-500'">
          {{ profitLoss >= 0 ? '+' : '−' }}${{ money(Math.abs(profitLoss)) }}
        </p>
      </div>

      <div class="flex items-center gap-1 shrink-0 ml-2">
        <button
          class="text-gray-600 hover:text-blue-400 transition-colors p-1"
          title="Edit this holding"
          :aria-label="`Edit ${name}`"
          @click="startEditing"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          class="text-gray-600 hover:text-red-400 transition-colors p-1"
          title="Remove this holding"
          :aria-label="`Remove ${name}`"
          @click="$emit('remove')"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>

    <!-- ── Editing ─────────────────────────────────────────────────── -->
    <form v-else class="space-y-3" @submit.prevent="save">
      <div class="flex items-center gap-3">
        <AssetLogo :symbol="symbol" :type="type" :image="image" :size="32" />
        <span class="text-sm font-semibold text-white">{{ symbol.toUpperCase() }}</span>
        <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="typeClass">{{ type }}</span>
      </div>

      <!--
        The symbol and the type are not editable. Changing either would make
        this a different holding, and the honest way to do that is to remove
        this one and add the other — not to relabel a position and keep its
        history.
      -->
      <div>
        <label :for="`name-${id}`" class="block text-xs text-gray-400 mb-1">Name</label>
        <input
          :id="`name-${id}`"
          v-model="draft.name"
          type="text"
          class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div class="grid gap-3" :class="type === 'cash' ? 'grid-cols-1' : 'grid-cols-2'">
        <div>
          <label :for="`qty-${id}`" class="block text-xs text-gray-400 mb-1">
            {{ type === 'cash' ? 'Balance' : 'Quantity' }}
            <span v-if="unit" class="text-gray-500">({{ unit }})</span>
          </label>
          <input
            :id="`qty-${id}`"
            v-model.number="draft.quantity"
            type="number"
            min="0"
            step="any"
            required
            class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <!--
          Cash has no cost to average: what a unit is worth is an exchange rate,
          not something anyone paid. Offering the field would invite a number
          the next price refresh would overwrite.
        -->
        <div v-if="type !== 'cash'">
          <label :for="`cost-${id}`" class="block text-xs text-gray-400 mb-1">Average cost (USD)</label>
          <input
            :id="`cost-${id}`"
            v-model.number="draft.purchasePrice"
            type="number"
            min="0"
            step="any"
            required
            class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <p v-if="error" class="text-red-400 text-xs">{{ error }}</p>

      <div class="flex items-center gap-2">
        <button
          type="submit"
          :disabled="saving || !isValid"
          class="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:text-white transition-colors"
          @click="editing = false"
        >
          Cancel
        </button>
        <span class="ml-auto text-[11px] text-gray-500">
          This replaces the position rather than adding to it.
        </span>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { unitLabel } from '~/utils/assetUnits'

const props = defineProps<{
  id: string
  symbol: string
  name: string
  type: 'crypto' | 'stock' | 'commodity' | 'cash'
  quantity: number
  purchasePrice: number
  currentPrice: number
  change24h: number
  image?: string | null
  currency?: string | null
  /** Persists the change. Awaited, so a failure keeps the form open. */
  onSave: (patch: { name: string, quantity: number, purchasePrice?: number }) => Promise<void>
}>()

/**
 * Saving is a function prop rather than an event so the card can await it —
 * an emit is fire-and-forget, and the form would close on a rejected write,
 * reporting success for a change the server never accepted.
 */
defineEmits<{ remove: [] }>()

const profitLoss = computed(
  () => (props.currentPrice - props.purchasePrice) * props.quantity,
)

const unit = computed(() => unitLabel(props))

const typeClass = computed(() =>
  props.type === 'crypto' ? 'bg-blue-900/60 text-blue-300'
    : props.type === 'commodity' ? 'bg-amber-900/60 text-amber-300'
      : props.type === 'cash' ? 'bg-emerald-900/60 text-emerald-300'
        : 'bg-purple-900/60 text-purple-300')

const money = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Editing ─────────────────────────────────────────────────────────
const editing = ref(false)
const saving = ref(false)
const error = ref('')

const draft = reactive({
  name: props.name,
  quantity: props.quantity as number | null,
  purchasePrice: props.purchasePrice as number | null,
})

function startEditing() {
  // Refilled from the props each time rather than kept between openings, so
  // cancelling really discards and a price that moved meanwhile is reflected.
  draft.name = props.name
  draft.quantity = props.quantity
  draft.purchasePrice = props.purchasePrice
  error.value = ''
  editing.value = true
}

const isValid = computed(() => {
  if (!draft.name.trim()) return false
  if (draft.quantity === null || !Number.isFinite(draft.quantity) || draft.quantity < 0) return false
  if (props.type === 'cash') return true
  return draft.purchasePrice !== null
    && Number.isFinite(draft.purchasePrice)
    && draft.purchasePrice >= 0
})

async function save() {
  if (!isValid.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await props.onSave({
      name: draft.name.trim(),
      quantity: draft.quantity!,
      ...(props.type === 'cash' ? {} : { purchasePrice: draft.purchasePrice! }),
    })
    editing.value = false
  } catch (err: any) {
    // Stay open with the values still in the fields: a rejected save should
    // leave the correction in front of the person making it, not discard it.
    error.value = err?.data?.error || err?.message || 'Could not save that change.'
  } finally {
    saving.value = false
  }
}
</script>
