<template>
  <span
    class="overflow-hidden shrink-0 flex items-center justify-center bg-gray-700"
    :class="shape"
    :style="{ width: px, height: px }"
  >
    <img
      v-if="src && !failed"
      :src="src"
      :alt="`${symbol} logo`"
      loading="lazy"
      referrerpolicy="no-referrer"
      class="w-full h-full object-contain bg-white"
      :style="{ padding: pad }"
      @error="failed = true"
    />
    <!-- Initials on a colour derived from the ticker, so a company without a
         logo still looks the same everywhere rather than blank. -->
    <span
      v-else
      class="w-full h-full flex items-center justify-center font-bold text-white leading-none"
      :style="{ backgroundColor: glyph ? 'transparent' : color, fontSize: glyph ? glyphSize : fontSize }"
    >{{ glyph ?? initials }}</span>
  </span>
</template>

<script setup lang="ts">
import { CURRENCIES } from '~/utils/assetUnits'
/**
 * The official logo for a holding, with a graceful fall back to initials.
 *
 * Crypto logos come from the price provider and are stored with the coin,
 * because their URLs are opaque ids. Equity logos follow from the ticker, so
 * nothing needs storing — the URL is built here.
 *
 * Images are requested with no referrer, so the logo host is not told which
 * company a particular visitor is looking at.
 */
const props = withDefaults(defineProps<{
  symbol: string
  type?: string
  /** Provided for crypto; ignored for equities, whose URL is derived. */
  image?: string | null
  size?: number
}>(), { type: 'stock', image: null, size: 32 })

const failed = ref(false)

const px = computed(() => `${props.size}px`)

/**
 * Coin logos are drawn as round badges and fill a circle correctly. Everything
 * else is square artwork reaching the edge of its frame, so a circular crop
 * removes the corners — which is where Tesla's and AMD's marks actually live.
 * A barely-rounded square shows the logo whole.
 */
const shape = computed(() => (props.type === 'crypto' ? 'rounded-full' : 'rounded-md'))

/**
 * Breathing room so artwork never touches the edge. Only for equities: a coin
 * badge is designed to fill its circle, and padding it would shrink it oddly.
 */
const pad = computed(() => (props.type === 'crypto' ? '0px' : `${Math.max(1, Math.round(props.size * 0.06))}px`))
const fontSize = computed(() => `${Math.max(9, Math.round(props.size * 0.36))}px`)
const glyphSize = computed(() => `${Math.round(props.size * 0.62)}px`)

/** No logo provider carries metals, so they get a glyph instead of initials. */
const GLYPH: Record<string, string> = { GOLD: '🥇', SILVER: '🥈', COPPER: '🥉' }

const glyph = computed(() => {
  if (props.type === 'commodity') return GLYPH[props.symbol?.toUpperCase()] ?? null
  // Cash wears its own currency sign. "₹" says rupees faster than "IN" does,
  // and the sign is the one mark every holder of that currency recognises.
  if (props.type === 'cash') {
    return CURRENCIES.find(c => c.code === props.symbol?.toUpperCase())?.symbol ?? '¤'
  }
  return null
})

const src = computed(() => {
  // Neither metals nor money have a logo to fetch, and asking for one is a
  // guaranteed 404 on every render.
  if (props.type === 'commodity' || props.type === 'cash') return null
  if (props.type === 'crypto') return props.image || null
  const t = props.symbol?.toUpperCase()
  if (!t) return null
  // Class shares use a dash in the index and a dash here too, so no mapping.
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(t)}.png`
})

const initials = computed(() => (props.symbol ?? '?').slice(0, 2).toUpperCase())

const color = computed(() => {
  let h = 0
  const s = props.symbol ?? ''
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return `hsl(${Math.abs(h) % 360}, 62%, 45%)`
})

// A changed symbol deserves a fresh attempt at its logo.
watch(() => props.symbol, () => { failed.value = false })
</script>
