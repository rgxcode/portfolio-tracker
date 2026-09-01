<template>
  <div v-if="loading || items.length" class="n-card px-4 py-[15px]">
    <div class="flex items-baseline mb-3">
      <span class="n-kicker">Coverage</span>
      <span v-if="summary" class="ml-auto text-[11px] text-n-600">
        {{ summary.covered }} of {{ summary.holdings }}
      </span>
    </div>

    <p v-if="loading && !items.length" class="text-[12.5px] text-n-500">Loading…</p>

    <div v-else class="flex flex-col gap-3">
      <NuxtLink
        v-for="(item, i) in items"
        :key="item.symbol"
        :to="{ path: '/asset', query: { symbol: item.symbol } }"
        class="flex flex-col gap-[5px] no-underline text-n-text"
        :class="i < items.length - 1 ? 'pb-3 border-b border-[rgba(233,233,237,.07)]' : ''"
      >
        <div class="flex items-center gap-[7px]">
          <span class="tag" :class="item.sentiment === 'positive' ? 'tag-accent' : 'tag-neutral'">
            {{ item.symbol }}
          </span>
          <span class="text-[11px]" :class="toneClass(item.sentiment)">{{ toneLabel(item.sentiment) }}</span>
          <span v-if="item.age" class="text-[11px] text-n-600 ml-auto">{{ item.age }}</span>
        </div>
        <div class="text-[12.5px] leading-snug text-n-200 line-clamp-3">{{ item.summary }}</div>
        <div v-if="item.sources" class="text-[11px] text-n-600">{{ item.sources }}</div>
      </NuxtLink>
    </div>

    <p class="mt-3 pt-3 border-t border-[rgba(233,233,237,.07)] text-[11px] leading-normal text-n-600">
      Written by a language model from recent published articles. Open a holding to read the sources.
      Not advice.
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * What the press is saying about the holdings, as a short stack in the rail.
 *
 * The old full-width version was a tabbed reader with a nav of every holding.
 * At 340px that does not fit and would not be read anyway, so this shows the
 * three most recent and sends anyone who wants the detail to the asset page,
 * which already has the full write-up and the article list.
 */
import { useApi } from '~/composables/useApi'

interface Insight {
  symbol: string
  name: string
  sentiment: string
  summary: string
  sources?: Array<{ publisher?: string }>
  /** How old the write-up is, in hours, as the API reports it. */
  ageHours?: number
}

const { apiFetch } = useApi()

const loading = ref(true)
const insights = ref<Insight[]>([])
const summary = ref<{ covered: number, holdings: number } | null>(null)

const items = computed(() =>
  insights.value.slice(0, 3).map(i => ({
    symbol: i.symbol.toUpperCase(),
    sentiment: i.sentiment,
    summary: i.summary,
    age: relative(i.ageHours),
    sources: sourceLine(i.sources),
  })),
)

function toneLabel(sentiment: string): string {
  return sentiment === 'positive' ? 'Upbeat'
    : sentiment === 'negative' ? 'Cautious'
      : 'Mixed'
}

function toneClass(sentiment: string): string {
  return sentiment === 'positive' ? 'text-up'
    : sentiment === 'negative' ? 'text-down'
      : 'text-n-400'
}

/** "2h", "1d" — a compact scale, not a full timestamp. */
function relative(hours?: number): string {
  if (!Number.isFinite(hours) || (hours as number) < 0) return ''
  const h = hours as number
  if (h < 1) return 'now'
  return h < 24 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`
}

function sourceLine(sources?: Array<{ publisher?: string }>): string {
  if (!sources?.length) return ''
  const names = [...new Set(sources.map(s => s.publisher).filter(Boolean))] as string[]
  const count = `${sources.length} article${sources.length === 1 ? '' : 's'}`
  return names.length ? `${count} · ${names.slice(0, 2).join(', ')}` : count
}

onMounted(async () => {
  try {
    const res = await apiFetch<{ insights: Insight[], summary?: { covered: number, holdings: number } }>('/api/insights')
    insights.value = res.insights ?? []
    summary.value = res.summary ?? null
  } catch {
    // No coverage is a normal state, not an error worth a banner.
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.tag {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  letter-spacing: 0.02em;
  padding: 3px 10px;
  border-radius: 6px;
}

.tag-accent {
  background: var(--n-accent-800);
  color: var(--n-accent-100);
}

.tag-neutral {
  background: var(--n-800);
  color: var(--n-100);
}
</style>
