<template>
  <svg
    v-if="path"
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    class="inline-block overflow-visible"
    role="img"
    :aria-label="label"
  >
    <path :d="path" fill="none" :stroke="stroke" stroke-width="1.3" stroke-linejoin="round" />
  </svg>
  <!-- No history for this holding: leave the column empty rather than draw a
       flat line, which would read as "unchanged" instead of "not known". -->
  <span v-else class="text-n-700 text-[11px]">—</span>
</template>

<script setup lang="ts">
/**
 * A tiny line of recent prices, drawn from the values alone.
 *
 * It carries no axis and no scale on purpose: the shape is the whole message,
 * and the exact figures are already in the columns beside it.
 */
const props = withDefaults(defineProps<{
  values: number[]
  width?: number
  height?: number
  label?: string
}>(), {
  width: 74,
  height: 22,
  label: 'Recent price trend',
})

const stroke = computed(() => {
  const v = props.values
  if (v.length < 2) return 'var(--n-600)'
  return v[v.length - 1] >= v[0] ? 'var(--n-up)' : 'var(--n-down)'
})

const path = computed(() => {
  const v = props.values
  if (v.length < 2) return ''

  const min = Math.min(...v)
  const max = Math.max(...v)
  // A perfectly flat series would divide by zero; draw it down the middle.
  const span = max - min || 1
  const pad = 1.5
  const h = props.height - pad * 2

  return v
    .map((n, i) => {
      const x = (i / (v.length - 1)) * props.width
      const y = pad + (max === min ? h / 2 : (1 - (n - min) / span) * h)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
})
</script>
