<template>
  <section v-if="insights.length || loading" class="mt-10">
    <div class="flex items-baseline justify-between gap-3 flex-wrap mb-1">
      <h2 class="text-lg font-bold text-white">What the coverage is saying</h2>
      <span v-if="summary" class="text-xs text-gray-500">
        {{ summary.covered }} of {{ summary.holdings }} holdings · refreshed by a scheduled job
      </span>
    </div>
    <p class="text-xs text-gray-500 mb-4">
      Written by a language model from recent published articles, which are listed with each
      holding so you can read the source rather than take the summary on trust. Not advice.
    </p>

    <div v-if="loading && !insights.length" class="text-gray-500 text-sm">Loading…</div>

    <div v-else-if="insights.length" class="grid gap-4 md:grid-cols-[minmax(11rem,15rem)_1fr] items-start">
      <!-- Holdings list. Vertical on a wide screen, a row of chips on a narrow
           one, where a tall sidebar would push the detail off the fold. -->
      <nav
        class="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-1 md:pb-0"
        role="tablist"
        aria-label="Holdings"
      >
        <button
          v-for="i in insights"
          :key="i.symbol"
          role="tab"
          :aria-selected="selected === i.symbol"
          class="shrink-0 md:shrink text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center gap-2"
          :class="selected === i.symbol
            ? 'bg-gray-700 border-gray-600 text-white'
            : 'bg-gray-800/60 border-gray-700/70 text-gray-300 hover:bg-gray-800 hover:border-gray-600'"
          @click="select(i.symbol)"
        >
          <span
            class="w-1.5 h-1.5 rounded-full shrink-0"
            :class="dot(i.sentiment)"
            :title="i.sentiment"
          />
          <span class="font-semibold">{{ i.symbol }}</span>
          <span class="text-xs text-gray-500 truncate hidden md:inline">{{ i.name }}</span>
        </button>
      </nav>

      <!-- Detail: rendered only once something is chosen -->
      <article
        v-if="current"
        :key="current.symbol"
        role="tabpanel"
        class="bg-gray-800 border border-gray-700 rounded-2xl p-5 min-h-[12rem]"
      >
        <header class="flex items-center justify-between gap-3 mb-3">
          <NuxtLink
            :to="{ path: '/asset', query: { symbol: current.symbol } }"
            class="font-bold text-white hover:text-blue-400 transition-colors"
          >
            {{ current.symbol }}
            <span class="text-gray-500 font-normal text-sm ml-1">{{ current.name }}</span>
          </NuxtLink>
          <span class="text-[11px] px-2 py-0.5 rounded-full shrink-0" :class="tone(current.sentiment)">
            {{ current.sentiment }}
          </span>
        </header>

        <p class="text-sm text-gray-300 leading-relaxed">{{ current.summary }}</p>

        <ul v-if="current.themes.length" class="mt-3 space-y-1">
          <li v-for="t in current.themes" :key="t" class="text-sm text-gray-400 flex gap-2">
            <span class="text-gray-600 shrink-0">•</span>{{ t }}
          </li>
        </ul>

        <div v-if="current.sources.length" class="mt-4 pt-3 border-t border-gray-700/70">
          <p class="text-xs text-gray-500 mb-2">
            {{ current.sources.length }} article{{ current.sources.length === 1 ? '' : 's' }} this was written from
          </p>
          <ul class="space-y-1.5">
            <li v-for="s in current.sources" :key="s.url" class="text-xs">
              <a
                :href="s.url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-gray-300 hover:text-blue-400 transition-colors"
              >{{ s.title }}</a>
              <span class="text-gray-600"> — {{ s.publisher }}<span v-if="s.publishedAt">, {{ day(s.publishedAt) }}</span></span>
            </li>
          </ul>
        </div>

        <p class="text-[11px] text-gray-600 mt-3">{{ age(current.ageHours) }} · {{ current.model }}</p>
      </article>

      <div
        v-else
        class="border border-dashed border-gray-700 rounded-2xl p-8 text-center min-h-[12rem] flex items-center justify-center"
      >
        <p class="text-sm text-gray-500">Select a holding to see what the coverage says about it.</p>
      </div>
    </div>

    <p v-if="summary?.awaiting?.length" class="text-xs text-gray-500 mt-3">
      No coverage found yet for {{ summary.awaiting.join(', ') }}.
    </p>
  </section>
</template>

<script setup lang="ts">
const { apiFetch } = useApi()

const insights = ref<any[]>([])
const summary = ref<any>(null)
const loading = ref(false)

/** Nothing is open until asked for — the point of the list is to choose. */
const selected = ref<string | null>(null)
const current = computed(() => insights.value.find(i => i.symbol === selected.value) ?? null)

function select(symbol: string) {
  // Clicking the open one closes it, so the section can be collapsed again.
  selected.value = selected.value === symbol ? null : symbol
}

/** Status colours, always paired with the word itself — never colour alone. */
function tone(s: string) {
  if (s === 'positive') return 'bg-emerald-900/50 text-emerald-300'
  if (s === 'negative') return 'bg-red-900/50 text-red-300'
  if (s === 'mixed') return 'bg-amber-900/50 text-amber-300'
  return 'bg-gray-700 text-gray-300'
}
function dot(s: string) {
  if (s === 'positive') return 'bg-emerald-400'
  if (s === 'negative') return 'bg-red-400'
  if (s === 'mixed') return 'bg-amber-400'
  return 'bg-gray-500'
}

const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

function age(hours: number) {
  if (hours < 1) return 'just now'
  if (hours < 24) return `${Math.round(hours)}h ago`
  const d = Math.round(hours / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

async function load() {
  loading.value = true
  try {
    const res = await apiFetch<any>('/api/insights')
    insights.value = res.insights ?? []
    summary.value = res.summary
  } catch {
    // A missing analysis must never take the dashboard down with it.
    insights.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
