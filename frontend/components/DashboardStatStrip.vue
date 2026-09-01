<template>
  <div class="n-card grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr]">
    <div class="px-[18px] py-3.5">
      <div class="n-kicker mb-1.5">Total worth</div>
      <div class="flex items-baseline gap-2">
        <span class="text-[38px] font-medium tracking-[-.03em] leading-none">{{ whole }}</span>
        <span class="text-[19px] font-medium text-n-400 tracking-[-.02em]">{{ cents }}</span>
        <button
          class="text-[11px] text-n-500 border border-n-divider rounded-[5px] px-[5px] py-px ml-0.5 hover:text-n-text hover:border-[rgba(233,233,237,.4)] transition-colors"
          title="Switch currency"
          @click="d.toggleCurrency"
        >
          {{ d.selectedCurrency }}
        </button>
      </div>
    </div>

    <div
      v-for="stat in stats"
      :key="stat.label"
      class="px-[18px] py-3.5 xl:border-l border-[rgba(233,233,237,.08)]"
    >
      <div class="n-kicker mb-1.5">{{ stat.label }}</div>
      <div class="text-xl font-medium tracking-[-.02em]" :class="stat.tone">{{ stat.value }}</div>
      <div class="text-[11.5px] text-n-500 mt-0.5">{{ stat.sub }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The four figures the dashboard leads with.
 *
 * The design's fourth tile compares the portfolio against the S&P 500. Nothing
 * in this app fetches an index series — there is no benchmark data to compare
 * against — so rather than invent one, the slot goes to concentration: the
 * share of the book sitting in its largest holding, which is a real number
 * from the same rows and answers a question of the same kind ("is this
 * portfolio in good shape?"). See the note in the allocation panel, which
 * reports the same figure's monthly drift.
 */
const d = inject<any>('dash')

if (!d && import.meta.client) console.error('DashboardStatStrip: dashboard state was not provided')

/**
 * The total, split so the cents can sit smaller than the dollars. Splitting on
 * the last separator rather than a decimal point keeps this correct in a
 * locale that groups with '.' and points with ','.
 */
const formatted = computed(() => d.formatCurrency(d.convert(d.filteredTotalValue)))
const whole = computed(() => {
  const s = formatted.value
  const i = s.lastIndexOf('.')
  return i === -1 ? s : s.slice(0, i)
})
const cents = computed(() => {
  const s = formatted.value
  const i = s.lastIndexOf('.')
  return i === -1 ? '' : s.slice(i)
})

const signed = (n: number) =>
  `${n >= 0 ? '+' : '−'}${d.formatCurrency(Math.abs(d.convert(n)))}`

const tone = (n: number) => (n >= 0 ? 'text-up' : 'text-down')

const stats = computed(() => {
  const today = d.todayChange
  const pl = d.filteredProfitLoss
  const top = d.topHolding

  return [
    {
      label: 'Today',
      value: today.value === null ? '—' : signed(today.value),
      sub: today.value === null
        // Every provider left out its 24h figure, so there is nothing to show
        // and saying so is better than printing a zero.
        ? 'No 24h change reported'
        : `${today.percent >= 0 ? '+' : '−'}${Math.abs(today.percent).toFixed(2)}%`,
      tone: today.value === null ? 'text-n-400' : tone(today.value),
    },
    {
      label: 'Unrealised P/L',
      value: signed(pl),
      sub: `${d.filteredPLPercent >= 0 ? '+' : '−'}${Math.abs(d.filteredPLPercent).toFixed(2)}% · vs cost ${d.formatCurrency(d.convert(d.filteredTotalCost))}`,
      tone: tone(pl),
    },
    {
      label: 'Concentration',
      value: top ? `${top.weight.toFixed(1)}%` : '—',
      sub: top ? `${top.symbol} is the largest of ${d.filteredAssets.length}` : 'No holdings',
      tone: '',
    },
  ]
})
</script>
