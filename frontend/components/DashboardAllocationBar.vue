<template>
  <div class="n-card px-4 py-[15px]">
    <div class="n-kicker mb-3">Allocation</div>

    <div v-if="slices.length" class="flex gap-[3px] h-2 mb-3.5">
      <div
        v-for="s in slices"
        :key="s.label"
        class="rounded-[3px]"
        :style="{ flex: s.percent, background: s.color }"
      />
    </div>

    <div class="flex flex-col gap-[9px]">
      <div v-for="s in slices" :key="s.label" class="flex items-center gap-[9px] text-[12.5px]">
        <span class="w-2 h-2 rounded-sm shrink-0" :style="{ background: s.color }" />
        {{ s.label }}
        <span class="ml-auto text-n-400">{{ s.value }}</span>
        <span class="w-11 text-right">{{ s.percent.toFixed(1) }}%</span>
      </div>
      <p v-if="!slices.length" class="text-[12.5px] text-n-500">Nothing to allocate yet.</p>
    </div>

    <div
      v-if="d.topHolding"
      class="mt-[13px] pt-3 border-t border-[rgba(233,233,237,.08)] text-[11.5px] leading-normal text-n-500"
    >
      Top holding is
      <b class="text-n-text font-medium">{{ d.topHolding.weight.toFixed(1) }}%</b>
      of the book.
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The split by asset type, as one stacked bar rather than a donut.
 *
 * A bar because the question here is "how lopsided is this?", and lengths on a
 * shared baseline answer that far better than angles do. The three tiers come
 * from the accent ramp rather than three unrelated hues, so the panel reads as
 * one measure divided up instead of three competing categories.
 *
 * The design's footnote also reports how the top weight moved over the month.
 * That needs a month-old snapshot of the book, which nothing stores, so the
 * sentence states today's figure and stops there rather than guessing at the
 * drift.
 */
const d = inject<any>('dash')

if (!d && import.meta.client) console.error('DashboardAllocationBar: dashboard state was not provided')

/**
 * Accent ramp, darkening by rank, so the biggest slice is the brightest.
 *
 * One tier per class the book can hold. Funds became their own class, which
 * made five — and with four tiers the two smallest slices were handed the same
 * colour and stopped being separable in the bar.
 */
const TIERS = [
  'var(--n-accent)',
  'var(--n-accent-600)',
  'var(--n-accent-700)',
  'var(--n-accent-800)',
  'var(--n-accent-900)',
]

const slices = computed(() => {
  const { labels, values } = d.typeAllocation
  const total = values.reduce((a: number, b: number) => a + b, 0)
  if (!total) return []
  return labels
    .map((label: string, i: number) => ({
      label,
      raw: values[i],
      percent: (values[i] / total) * 100,
      value: d.formatCurrency(d.convert(values[i])),
    }))
    .sort((a: any, b: any) => b.raw - a.raw)
    .map((s: any, i: number) => ({ ...s, color: TIERS[Math.min(i, TIERS.length - 1)] }))
})
</script>
