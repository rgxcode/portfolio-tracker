<template>
  <div class="min-h-screen bg-n-bg text-n-text flex flex-col">
    <!-- ── Header ──────────────────────────────────────────────────────── -->
    <header class="sticky top-0 z-50 bg-n-bg/95 backdrop-blur">
      <nav class="flex items-center gap-[26px] px-5 h-[52px] border-b border-[rgba(233,233,237,.08)]">
        <NuxtLink to="/" class="flex items-center gap-[9px] mr-2 shrink-0 no-underline text-n-text">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--n-accent)" stroke-width="2" stroke-linecap="round">
            <path d="M4 20V13M10 20V5M16 20V9M22 20V3" />
          </svg>
          <span class="text-sm font-medium tracking-[-.01em]">Portfolio Tracker</span>
        </NuxtLink>

        <template v-if="authStore.isAuthenticated">
          <div class="flex gap-0.5">
            <NuxtLink
              v-for="link in visibleLinks"
              :key="link.to"
              :to="link.to"
              class="text-[13px] px-[11px] py-1.5 rounded-[7px] no-underline transition-colors"
              :class="$route.path === link.to
                ? 'bg-[rgba(145,132,217,.14)] text-na-300'
                : 'text-n-400 hover:bg-[rgba(233,233,237,.06)] hover:text-n-text'"
            >
              {{ link.label }}
            </NuxtLink>
          </div>

          <div class="ml-auto flex items-center gap-3.5">
            <!-- The lookup, as the design's inline field rather than a
                 separate control bar on the page below. -->
            <div class="hidden md:block w-[210px]">
              <TickerSearch
                placeholder="Look up a ticker"
                :show-button="false"
                width-class="w-full"
                @select="openTicker"
              />
            </div>

            <!-- How fresh the prices are, as a state rather than a sentence. -->
            <div v-if="snapshotAge" class="hidden lg:flex items-center gap-1.5 text-[11.5px] text-n-500 whitespace-nowrap">
              <span class="relative block w-1.5 h-1.5 rounded-full" :class="live ? 'bg-up' : 'bg-n-600'">
                <span v-if="live" class="absolute inset-0 rounded-full bg-up pulse" />
              </span>
              {{ snapshotAge }}
            </div>

            <UserMenu />
          </div>
        </template>

        <template v-else>
          <NuxtLink
            to="/auth"
            class="ml-auto text-[13px] px-[11px] py-1.5 rounded-[7px] text-n-400 hover:bg-[rgba(233,233,237,.06)] hover:text-n-text no-underline transition-colors"
          >
            Sign in
          </NuxtLink>
        </template>
      </nav>

      <!-- Prices moving right to left, built from the holdings themselves. -->
      <TickerTape v-if="authStore.isAuthenticated" />
    </header>

    <main class="flex-1 px-5 py-[18px] pb-[22px]">
      <slot />
    </main>

    <footer class="mt-10 py-6 text-center text-n-600 text-[12.5px]">
      <div class="flex items-center justify-center gap-3 flex-wrap">
        <NuxtLink to="/privacy" class="hover:text-n-400 transition-colors no-underline">Privacy</NuxtLink>
        <span class="text-n-800">·</span>
        <NuxtLink to="/terms" class="hover:text-n-400 transition-colors no-underline">Terms</NuxtLink>
      </div>
      <p class="mt-2">Prices from CoinGecko &amp; Yahoo · filings from SEC EDGAR · not financial advice</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useMarketData } from '~/composables/useMarketData'

const authStore = useAuthStore()
const { snapshotAt, stockWindow } = useMarketData()

const LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/assets', label: 'Assets' },
  { to: '/compare', label: 'Compare' },
  { to: '/admin', label: 'Admin', adminOnly: true },
]

/** Admin is in the design's nav, but only an administrator has a page there. */
const visibleLinks = computed(() =>
  LINKS.filter(l => !l.adminOnly || authStore.isAdmin),
)

function openTicker(symbol: string) {
  navigateTo({ path: '/asset', query: { symbol } })
}

/**
 * The header shows how old the snapshot is, so it has to re-render as it ages
 * rather than only when a new price lands. A minute is the finest unit it
 * prints, so a minute is as often as it needs to think about it.
 */
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | null = null

onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 60000) })
onUnmounted(() => { if (clock) clearInterval(clock) })

const ageMinutes = computed(() => {
  if (!snapshotAt.value) return null
  return Math.floor((now.value - new Date(snapshotAt.value).getTime()) / 60000)
})

/** Green and pulsing only while the figures are genuinely current. */
const live = computed(() => ageMinutes.value !== null && ageMinutes.value < 10)

const snapshotAge = computed(() => {
  const mins = ageMinutes.value
  if (mins === null) return ''
  const when = mins < 1 ? 'just now'
    : mins === 1 ? '1 min ago'
      : mins < 60 ? `${mins} min ago`
        : Math.floor(mins / 60) === 1 ? '1 hour ago'
          : `${Math.floor(mins / 60)} hours ago`
  // "Live" is a claim about the market, not about the fetch: outside trading
  // hours the last price is correct and simply not moving.
  return stockWindow.value?.open === false && mins >= 10 ? `Last close · ${when}` : `Live · ${when}`
})
</script>

<style scoped>
.pulse {
  animation: n-pulse 2.4s ease-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .pulse {
    animation: none;
  }
}
</style>
