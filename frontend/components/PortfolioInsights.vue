<template>
  <section v-if="insights.length || loading" class="mt-10">
    <div class="flex items-baseline justify-between gap-3 flex-wrap mb-1">
      <h2 class="text-lg font-bold text-white">What the coverage is saying</h2>
      <span v-if="summary" class="text-xs text-gray-500">
        {{ summary.covered }} of {{ summary.holdings }} holdings · refreshed by a scheduled job
      </span>
    </div>
    <p class="text-xs text-gray-500 mb-4">
      Written by a language model from recent published articles, which are listed under each
      holding so you can read the source rather than take the summary on trust. Not advice.
    </p>

    <div v-if="loading && !insights.length" class="text-gray-500 text-sm">Loading…</div>

    <div class="grid gap-4 lg:grid-cols-2">
      <article
        v-for="i in insights"
        :key="i.symbol"
        class="bg-gray-800 border border-gray-700 rounded-2xl p-5"
      >
        <header class="flex items-center justify-between gap-3 mb-2">
          <NuxtLink
            :to="{ path: '/asset', query: { symbol: i.symbol } }"
            class="font-bold text-white hover:text-blue-400 transition-colors"
          >
            {{ i.symbol }}
            <span class="text-gray-500 font-normal text-sm ml-1">{{ i.name }}</span>
          </NuxtLink>
          <span class="text-[11px] px-2 py-0.5 rounded-full shrink-0" :class="tone(i.sentiment)">
            {{ i.sentiment }}
          </span>
        </header>

        <p class="text-sm text-gray-300 leading-relaxed">{{ i.summary }}</p>

        <ul v-if="i.themes.length" class="mt-3 space-y-1">
          <li v-for="t in i.themes" :key="t" class="text-sm text-gray-400 flex gap-2">
            <span class="text-gray-600 shrink-0">•</span>{{ t }}
          </li>
        </ul>

        <details v-if="i.sources.length" class="mt-3">
          <summary class="text-xs text-blue-400 hover:text-blue-300 cursor-pointer">
            {{ i.sources.length }} source{{ i.sources.length === 1 ? '' : 's' }}
          </summary>
          <ul class="mt-2 space-y-1.5">
            <li v-for="s in i.sources" :key="s.url" class="text-xs">
              <a
                :href="s.url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-gray-300 hover:text-blue-400 transition-colors"
              >{{ s.title }}</a>
              <span class="text-gray-600"> — {{ s.publisher }}<span v-if="s.publishedAt">, {{ day(s.publishedAt) }}</span></span>
            </li>
          </ul>
        </details>

        <p class="text-[11px] text-gray-600 mt-3">
          {{ age(i.ageHours) }} · {{ i.model }}
        </p>
      </article>
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

function tone(s: string) {
  // Status colours, kept distinct from the chart palette and always paired with
  // the word itself — never colour alone.
  if (s === 'positive') return 'bg-emerald-900/50 text-emerald-300'
  if (s === 'negative') return 'bg-red-900/50 text-red-300'
  if (s === 'mixed') return 'bg-amber-900/50 text-amber-300'
  return 'bg-gray-700 text-gray-300'
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
