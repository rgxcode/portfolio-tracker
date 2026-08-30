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
      :style="{ backgroundColor: color, fontSize }"
    >{{ initials }}</span>
  </span>
</template>

<script setup lang="ts">
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
 * Coin logos are drawn as round badges and fill a circle correctly. Equity
 * logos are square artwork that reaches the edge of its frame, so a circular
 * crop cuts the corners off — Tesla and AMD both lost part of their mark. A
 * rounded square keeps the whole logo and still reads as an avatar.
 */
const shape = computed(() => (props.type === 'crypto' ? 'rounded-full' : 'rounded-lg'))

/**
 * Breathing room so artwork never touches the edge. Only for equities: a coin
 * badge is designed to fill its circle, and padding it would shrink it oddly.
 */
const pad = computed(() => (props.type === 'crypto' ? '0px' : `${Math.max(2, Math.round(props.size * 0.1))}px`))
const fontSize = computed(() => `${Math.max(9, Math.round(props.size * 0.36))}px`)

const src = computed(() => {
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
