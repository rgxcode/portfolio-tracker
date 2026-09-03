<template>
  <div class="n-card pt-3.5 px-1 pb-2">
    <div class="flex items-center gap-2.5 px-3.5 pb-3 flex-wrap">
      <span class="n-kicker">Holdings</span>
      <span class="text-[11px] text-n-600">
        {{ d.filteredAssets.length }} asset{{ d.filteredAssets.length === 1 ? '' : 's' }}
      </span>

      <div class="ml-auto flex gap-1.5">
        <button
          v-for="tab in d.assetTabs"
          :key="tab.value"
          class="text-[11.5px] px-2.5 py-1 rounded-md transition-colors"
          :class="d.activeTab === tab.value
            ? 'bg-[rgba(233,233,237,.09)] text-n-text'
            : 'text-n-500 hover:text-n-text'"
          @click="d.setTab(tab.value)"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-[13px] border-collapse">
        <thead>
          <tr class="rule">
            <th class="text-left n-th w-[190px]">Asset</th>
            <th class="text-right n-th">Units</th>
            <th class="text-right n-th">Avg cost</th>
            <th class="text-right n-th">Last</th>
            <th class="text-right n-th">24h</th>
            <th class="text-left n-th w-28">Weight</th>
            <th class="text-right n-th">Value</th>
            <th class="text-right n-th w-24">30 days</th>
          </tr>
        </thead>
        <tbody v-for="group in groups" :key="group.label">
          <!--
            One band per asset class. Suppressed when there is only one, where
            it would repeat the card's own heading and rule off nothing.
          -->
          <tr v-if="groups.length > 1">
            <td colspan="8" class="pt-3.5 pb-1.5 px-[10px]">
              <div class="flex items-baseline gap-2">
                <span class="n-kicker">{{ group.label }}</span>
                <span class="text-[11px] text-n-600">{{ group.rows.length }}</span>
                <span class="ml-auto text-[11.5px] text-n-300">{{ group.value }}</span>
                <span class="text-[11px] text-n-600 w-11 text-right">{{ group.weight.toFixed(1) }}%</span>
              </div>
            </td>
          </tr>

          <tr
            v-for="row in group.rows"
            :key="row.asset.id"
            class="rule hover:bg-[rgba(233,233,237,.04)] transition-colors cursor-pointer"
            @click="d.openTicker(row.asset.symbol.toUpperCase())"
          >
            <td class="n-td">
              <div class="flex items-center gap-[9px]">
                <AssetLogo :symbol="row.asset.symbol" :type="row.asset.type" :image="row.asset.image" :size="24" />
                <span class="font-medium">{{ row.asset.symbol.toUpperCase() }}</span>
                <span class="text-n-500 text-xs truncate">{{ row.asset.name }}</span>
              </div>
            </td>
            <td class="n-td text-right text-n-300">
              {{ row.units }}<span v-if="row.unit" class="text-n-600 ml-1">{{ row.unit }}</span>
            </td>
            <td class="n-td text-right text-n-400">{{ row.avgCost }}</td>
            <td class="n-td text-right">{{ row.last }}</td>
            <td class="n-td text-right" :class="row.change === null ? 'text-n-600' : row.change >= 0 ? 'text-up' : 'text-down'">
              {{ row.change === null ? '—' : `${row.change >= 0 ? '+' : '−'}${Math.abs(row.change).toFixed(2)}%` }}
            </td>
            <td class="n-td">
              <div class="h-1 rounded-[3px] bg-[rgba(233,233,237,.08)]">
                <div class="h-1 rounded-[3px] bg-n-accent" :style="{ width: `${row.barWidth}%` }" />
              </div>
              <div class="text-[10px] text-n-600 mt-[3px]">{{ row.weight.toFixed(1) }}%</div>
            </td>
            <td class="n-td text-right font-medium">{{ row.value }}</td>
            <td class="n-td text-right">
              <Sparkline
                :values="history[row.asset.symbol.toLowerCase()] ?? []"
                :label="`${row.asset.symbol.toUpperCase()} over 30 days`"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Every holding on one row: what you own, what it cost, what it is worth, and
 * the shape of the last month.
 *
 * This replaces both the old holdings list and the separate breakdown table,
 * which showed overlapping columns of the same numbers in two places.
 */
import { useHistoricalPrices } from '~/composables/useHistoricalPrices'
import { unitLabel } from '~/utils/assetUnits'

const d = inject<any>('dash')

if (!d && import.meta.client) console.error('DashboardHoldingsTable: dashboard state was not provided')

const { fetchAssetHistory } = useHistoricalPrices()

const rows = computed(() => {
  const assets = d.sortedFilteredAssets
  const total = d.filteredTotalValue || 1
  // Bars are scaled against the largest holding, not the whole book: at a
  // realistic spread every bar measured against 100% would be a stub.
  const largest = assets.reduce(
    (m: number, a: any) => Math.max(m, a.currentPrice * a.quantity), 0,
  ) || 1

  return assets.map((asset: any) => {
    const value = asset.currentPrice * asset.quantity
    return {
      asset,
      units: asset.quantity.toLocaleString('en-US', { maximumFractionDigits: 8 }),
      // "5.5 oz" rather than "5.5": in a column that also counts shares and
      // coins, the number alone does not say what was counted.
      unit: unitLabel(asset),
      avgCost: d.formatCurrency(d.convert(asset.purchasePrice)),
      last: d.unitPrice(asset),
      // A holding that has never been priced is carrying its purchase price as
      // a stand-in. Printing "+0.00%" beside it would assert the one thing not
      // known — that it has not moved — so the column stays empty instead.
      change: asset.lastUpdated && Number.isFinite(asset.change24h) ? asset.change24h : null,
      weight: (value / total) * 100,
      barWidth: (value / largest) * 100,
      // Kept alongside the formatted string: the class subtotals are added up
      // from these, and adding up "$24,665.30" is not addition.
      rawValue: value,
      value: d.formatCurrency(d.convert(value)),
    }
  })
})

/**
 * The same rows, banded by asset class.
 *
 * A book of fourteen holdings sorted by value alone interleaves a coin, a
 * miner, an ounce of gold and a cash balance, and reading it means checking
 * every logo to know what kind of thing each line is. Grouping answers that
 * once per band, and the subtotal beside each heading is the number the eye
 * was reaching for anyway.
 *
 * Bands are ordered by weight, largest first, so the table still opens on the
 * biggest thing in the portfolio; within a band the rows keep the order they
 * were sorted into.
 */
const groups = computed(() => {
  const total = d.filteredTotalValue || 1
  const byLabel = new Map<string, { label: string, rows: any[], total: number }>()

  for (const row of rows.value) {
    const label = d.typeLabel(row.asset.type)
    let group = byLabel.get(label)
    if (!group) {
      group = { label, rows: [], total: 0 }
      byLabel.set(label, group)
    }
    group.rows.push(row)
    group.total += row.rawValue
  }

  return [...byLabel.values()]
    .sort((a, b) => b.total - a.total)
    .map(group => ({
      ...group,
      value: d.formatCurrency(d.convert(group.total)),
      weight: (group.total / total) * 100,
    }))
})

/**
 * A month of closes per holding, keyed by symbol.
 *
 * Fetched after the table is already on screen and stored separately from the
 * rows: a sparkline is the least important thing here, and no row should wait
 * on one to render. A holding whose history fails simply has no line.
 */
const history = ref<Record<string, number[]>>({})

async function loadHistories() {
  const assets = d.filteredAssets
  await Promise.all(
    assets.map(async (a: any) => {
      const key = a.symbol.toLowerCase()
      if (history.value[key]) return
      try {
        const points = await fetchAssetHistory(a.symbol, a.type, '1M')
        if (points.length > 1) history.value[key] = points.map((p: any) => p.price)
      } catch { /* no line for this one */ }
    }),
  )
}

onMounted(loadHistories)
// Adding or removing a holding should fill in its line without a reload.
watch(() => d.filteredAssets.map((a: any) => a.symbol).join(','), loadHistories)
</script>

<style scoped>
.n-th {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(233, 233, 237, 0.6);
  padding: 6px 10px;
  font-weight: 400;
  white-space: nowrap;
}

.n-td {
  padding: 7px 10px;
  white-space: nowrap;
}

/**
 * Nocturne's fading rule, applied to the row rather than to each cell so the
 * fade spans the whole width instead of restarting at every column boundary.
 */
.rule {
  background:
    linear-gradient(
      to right,
      transparent,
      rgba(233, 233, 237, 0.08) 48px,
      rgba(233, 233, 237, 0.08) calc(100% - 48px),
      transparent
    )
    no-repeat bottom / 100% 1px;
}

/* The hover tint layers over the row rule, which keeps painting. */
.rule:hover {
  background:
    linear-gradient(rgba(233, 233, 237, 0.04), rgba(233, 233, 237, 0.04)) no-repeat 0 0 / 100% 100%,
    linear-gradient(
      to right,
      transparent,
      rgba(233, 233, 237, 0.08) 48px,
      rgba(233, 233, 237, 0.08) calc(100% - 48px),
      transparent
    )
    no-repeat bottom / 100% 1px;
}
</style>
