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
      <article
        v-for="(item, i) in items"
        :key="item.symbol"
        class="flex flex-col gap-[5px]"
        :class="i < items.length - 1 ? 'pb-3 border-b border-[rgba(233,233,237,.07)]' : ''"
      >
        <header class="flex items-center gap-[7px]">
          <!-- The ticker still goes to the holding; the story goes to the story. -->
          <NuxtLink
            :to="{ path: '/asset', query: { symbol: item.symbol } }"
            class="tag no-underline"
            :class="item.sentiment === 'positive' ? 'tag-accent' : 'tag-neutral'"
          >
            {{ item.symbol }}
          </NuxtLink>
          <span class="text-[11px]" :class="toneClass(item.sentiment)">{{ toneLabel(item.sentiment) }}</span>
          <span v-if="item.age" class="text-[11px] text-n-600 ml-auto">{{ item.age }}</span>
        </header>

        <!--
          The summary itself opens the piece it was written from. With one
          source that is unambiguous; with several this takes the first, and
          expanding lists every one of them so nothing is only reachable by
          guessing which the summary meant.
        -->
        <component
          :is="item.primary ? 'a' : 'div'"
          v-bind="item.primary
            ? { href: item.primary.url, target: '_blank', rel: 'noopener noreferrer' }
            : {}"
          class="text-[12.5px] leading-snug text-n-200 no-underline"
          :class="item.primary ? 'hover:text-n-text transition-colors' : ''"
        >
          <p :class="isOpen(item.symbol) ? '' : 'line-clamp-3'">{{ item.summary }}</p>
        </component>

        <!-- The themes are the part the summary had to leave out. -->
        <ul v-if="isOpen(item.symbol) && item.themes.length" class="flex flex-col gap-1 mt-1">
          <li
            v-for="t in item.themes"
            :key="t"
            class="text-[12px] leading-snug text-n-400 flex gap-1.5"
          >
            <span class="text-n-700 shrink-0">•</span>{{ t }}
          </li>
        </ul>

        <div class="flex items-center gap-2">
          <span v-if="item.sources.length" class="text-[11px] text-n-600">{{ item.sourceLine }}</span>
          <button
            v-if="item.canExpand"
            class="ml-auto shrink-0 text-[11px] text-n-500 hover:text-n-text transition-colors inline-flex items-center gap-1"
            :aria-expanded="isOpen(item.symbol)"
            @click="toggle(item.symbol)"
          >
            {{ isOpen(item.symbol) ? 'Less' : 'More' }}
            <svg
              class="w-3 h-3 transition-transform"
              :class="isOpen(item.symbol) ? 'rotate-180' : ''"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        <!-- Every article this was written from, once opened. -->
        <ul v-if="isOpen(item.symbol) && item.sources.length" class="flex flex-col gap-1.5 mt-1">
          <li v-for="src in item.sources" :key="src.url">
            <a
              :href="src.url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-[11.5px] leading-snug text-n-400 hover:text-n-accent transition-colors no-underline"
            >
              {{ src.title }}
              <span class="text-n-600">— {{ src.publisher }}<span v-if="src.day">, {{ src.day }}</span></span>
            </a>
          </li>
        </ul>
      </article>
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

interface Source {
  title?: string
  url?: string
  publisher?: string
  publishedAt?: string
}

interface Insight {
  symbol: string
  name: string
  sentiment: string
  summary: string
  themes?: string[]
  /**
   * Only articles the job actually fetched — the model is never asked to
   * supply a citation, so every URL here is real. Safe to link straight out.
   */
  sources?: Source[]
  /** How old the write-up is, in hours, as the API reports it. */
  ageHours?: number
}

/** Which summaries are expanded, by symbol. Collapsed is the default. */
const open = ref<Set<string>>(new Set())
const isOpen = (symbol: string) => open.value.has(symbol)

function toggle(symbol: string) {
  // Reassigned rather than mutated: a Set's own methods are not reactive.
  const next = new Set(open.value)
  next.has(symbol) ? next.delete(symbol) : next.add(symbol)
  open.value = next
}

/** Roughly the number of characters that survive the three-line clamp. */
const CLAMP_CHARS = 150

const { apiFetch } = useApi()

const loading = ref(true)
const insights = ref<Insight[]>([])
const summary = ref<{ covered: number, holdings: number } | null>(null)

const items = computed(() =>
  insights.value.slice(0, 3).map((i) => {
    const sources = (i.sources ?? [])
      .filter(s => s.url)
      .map(s => ({
        url: s.url as string,
        title: s.title || s.publisher || 'Read the article',
        publisher: s.publisher ?? '',
        day: s.publishedAt
          ? new Date(s.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          : '',
      }))

    const themes = i.themes ?? []

    return {
      symbol: i.symbol.toUpperCase(),
      sentiment: i.sentiment,
      summary: i.summary,
      themes,
      age: relative(i.ageHours),
      sources,
      sourceLine: sourceLine(sources),
      /** The first article, which the summary opens. */
      primary: sources[0] ?? null,
      /**
       * Offer the control only when it has something to reveal: a summary
       * short enough to fit already, with no themes and nothing to cite, has
       * nothing behind "More".
       */
      canExpand: i.summary.length > CLAMP_CHARS || themes.length > 0 || sources.length > 0,
    }
  }),
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

function sourceLine(sources: Array<{ publisher: string }>): string {
  if (!sources.length) return ''
  const names = [...new Set(sources.map(s => s.publisher).filter(Boolean))]
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
