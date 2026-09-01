<template>
  <div
    v-if="items.length"
    class="h-8 border-b border-[rgba(233,233,237,.08)] overflow-hidden flex items-center"
    role="marquee"
    aria-label="Live prices for your holdings"
  >
    <!--
      Two identical copies side by side, the strip sized by its contents.
      Sliding it exactly -50% lands copy two precisely where copy one started,
      so the loop is seamless: no gap, no jump, no visible seam.

      The widths must come from the content (`w-max`), never from percentages.
      Pinning each copy to half the strip — i.e. one frame — looks right only
      while the prices happen to fit in a frame; on a phone they are several
      times wider, and since the items refuse to wrap they overflow their copy
      and land on top of the next one.

      Each copy carries its own trailing gap as padding rather than the strip
      spacing them, so one copy's width includes the space that follows it and
      -50% stays exactly one copy.
    -->
    <div
      class="flex w-max tape"
      :style="{ animationDuration: `${duration}s` }"
    >
      <div
        v-for="copy in 2"
        :key="copy"
        class="flex items-center gap-[26px] pr-[26px] flex-none text-[11.5px]"
        :aria-hidden="copy === 2 ? 'true' : undefined"
      >
        <span
          v-for="item in items"
          :key="`${copy}-${item.symbol}`"
          class="flex-none whitespace-nowrap text-n-500"
        >
          {{ item.symbol }}
          <b class="text-n-text font-medium">{{ item.price }}</b>
          <b v-if="item.change !== null" class="font-normal" :class="item.change >= 0 ? 'text-up' : 'text-down'">
            {{ item.change >= 0 ? '+' : '−' }}{{ Math.abs(item.change).toFixed(2) }}%
          </b>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The prices strip under the header, sliding right to left.
 *
 * It is built from the holdings the person actually owns rather than a fixed
 * index list: a tape of tickers you have no position in is decoration, and
 * this one is meant to be read.
 *
 * The animation is CSS rather than JavaScript so it runs on the compositor and
 * costs nothing per frame, and it stops entirely for anyone who has asked for
 * reduced motion — a strip of text moving forever is exactly what that setting
 * is for. It also pauses on hover, so a price can be read without chasing it.
 */
import { usePortfolioStore } from '~/stores/portfolio'
import { useCurrency } from '~/composables/useCurrency'

const store = usePortfolioStore()
const { convert, currencySymbol } = useCurrency()

/** Seconds per full pass, scaled so a long list does not race. */
const SECONDS_PER_ITEM = 4.6

const items = computed(() =>
  store.assets.map(a => ({
    symbol: a.symbol.toUpperCase(),
    price: format(convert(a.currentPrice ?? 0)),
    // A holding whose provider gave no 24h figure shows its price alone rather
    // than a fabricated 0.00%.
    change: Number.isFinite(a.change24h) ? a.change24h : null,
  })),
)

const duration = computed(() => Math.max(24, items.value.length * SECONDS_PER_ITEM))

/** Sub-cent assets need real precision; a five-figure one does not. */
function format(v: number): string {
  const decimals = Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 1 ? 2 : 6
  return `${currencySymbol.value}${v.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}
</script>

<style scoped>
.tape {
  animation-name: n-tape;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}

.tape:hover {
  animation-play-state: paused;
}

@media (prefers-reduced-motion: reduce) {
  /* Without the slide the second copy is dead weight — and worse, at half the
     strip's width it would start mid-frame and overlap the first. Drop it and
     let one copy fill the strip, so this degrades to a plain row of prices
     that runs off the edge. */
  .tape {
    animation: none;
  }

  .tape > :last-child {
    display: none;
  }
}
</style>
