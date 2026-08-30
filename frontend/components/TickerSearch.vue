<template>
  <div class="relative">
    <form class="flex items-center gap-2" @submit.prevent="submit">
      <input
        v-model="query"
        :placeholder="placeholder"
        autocomplete="off"
        class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        :class="widthClass"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.esc="close"
        @blur="closeSoon"
        @focus="lookup"
      />
      <button
        v-if="showButton"
        type="submit"
        class="px-3 py-1.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white shrink-0"
      >
        {{ buttonLabel }}
      </button>
    </form>

    <ul
      v-if="suggestions.length"
      class="absolute top-full left-0 mt-1 w-72 z-30 bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden"
    >
      <li
        v-for="(s, i) in suggestions"
        :key="s.symbol"
        class="px-3 py-2 cursor-pointer flex items-baseline gap-2"
        :class="i === highlighted ? 'bg-gray-700' : 'hover:bg-gray-800'"
        @mousedown.prevent="pick(s.symbol)"
      >
        <span class="font-semibold text-white text-sm w-14 shrink-0">{{ s.symbol }}</span>
        <span class="text-gray-300 text-sm truncate">{{ s.name }}</span>
        <span class="text-gray-500 text-[11px] ml-auto shrink-0 hidden sm:inline">{{ s.sector }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * Ticker/company lookup over the stored S&P 500 membership.
 *
 * Emits the chosen symbol rather than navigating, so the same control serves
 * the dashboard (jump to a company), the ticker page (jump elsewhere), and the
 * comparison page (add to a set).
 */
const props = withDefaults(defineProps<{
  placeholder?: string
  buttonLabel?: string
  showButton?: boolean
  widthClass?: string
}>(), {
  placeholder: 'Ticker or company…',
  buttonLabel: 'Go',
  showButton: true,
  widthClass: 'w-56',
})

const emit = defineEmits<{ (e: 'select', symbol: string): void }>()

const { apiFetch } = useApi()

const query = ref('')
const suggestions = ref<Array<{ symbol: string, name: string, sector: string }>>([])
const highlighted = ref(-1)
let timer: ReturnType<typeof setTimeout> | null = null

// Debounced: a request per keystroke would be mostly wasted round trips.
watch(query, () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(lookup, 150)
})

async function lookup() {
  const q = query.value.trim()
  if (!q) { suggestions.value = []; return }
  try {
    const res = await apiFetch<{ results: any[] }>(
      `/api/fundamentals/search?q=${encodeURIComponent(q)}`,
    )
    suggestions.value = res.results ?? []
    highlighted.value = suggestions.value.length ? 0 : -1
  } catch {
    // A failed suggestion lookup must never block typing a ticker directly.
    suggestions.value = []
  }
}

function move(step: number) {
  if (!suggestions.value.length) return
  highlighted.value = (highlighted.value + step + suggestions.value.length) % suggestions.value.length
}

function pick(symbol: string) {
  emit('select', symbol.toUpperCase())
  query.value = ''
  suggestions.value = []
}

/** Enter takes the highlighted suggestion, or whatever was typed. */
function submit() {
  const chosen = suggestions.value[highlighted.value]
  const value = chosen ? chosen.symbol : query.value.trim()
  if (value) pick(value)
}

function close() { suggestions.value = [] }
/** Let a click on a suggestion land before blur closes the list. */
function closeSoon() { setTimeout(close, 120) }
</script>
