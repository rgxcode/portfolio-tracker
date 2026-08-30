<template>
  <div>
    <div class="flex items-baseline justify-between mb-6 flex-wrap gap-2">
      <div>
        <h1 class="text-2xl font-bold text-white">Admin</h1>
        <p class="text-sm text-gray-400 mt-1">
          How the app has been running. Signed in as {{ authStore.user?.email }}.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <span v-if="data" class="text-xs text-gray-500">as of {{ data.generatedAtCET }}</span>
        <button
          class="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 transition-colors disabled:opacity-50"
          :disabled="loading"
          @click="load"
        >
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="mb-6 bg-red-900/30 border border-red-700 rounded-xl p-4">
      <p class="text-red-300 text-sm">{{ error }}</p>
    </div>

    <div v-if="!data && loading" class="text-gray-400 text-sm">Loading…</div>

    <template v-if="data">
      <!-- ── Database usage ─────────────────────────────────────── -->
      <section class="bg-gray-800 border border-gray-700 rounded-2xl p-5 mb-6">
        <div class="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <h2 class="font-semibold text-white">Database usage</h2>
          <span class="text-xs text-gray-400">
            {{ data.database.name }} · {{ data.database.collections }} collections ·
            {{ data.database.documents.toLocaleString() }} documents
          </span>
        </div>

        <div class="flex items-baseline gap-3 mb-2">
          <span class="text-3xl font-extrabold text-white">{{ data.database.countedMB }} MB</span>
          <span class="text-gray-400 text-sm">of {{ data.database.limitMB }} MB</span>
          <span class="text-sm font-medium" :class="usageColor">{{ data.database.percentUsed }}%</span>
        </div>

        <div class="h-2.5 rounded-full bg-gray-700 overflow-hidden">
          <div
            class="h-full rounded-full transition-all"
            :class="usageBar"
            :style="{ width: Math.min(100, Math.max(0.6, data.database.percentUsed)) + '%' }"
          />
        </div>
        <p class="text-xs text-gray-500 mt-2">
          Data {{ data.database.dataMB }} MB + indexes {{ data.database.indexMB }} MB. Atlas counts
          both against the plan limit; on-disk storage is {{ data.database.storageMB }} MB after
          compression.
        </p>

        <div class="mt-4 overflow-x-auto">
          <table class="w-full text-sm min-w-[34rem]">
            <thead>
              <tr class="text-gray-400 border-b border-gray-700">
                <th class="text-left font-medium py-2">Collection</th>
                <th class="text-right font-medium py-2">Documents</th>
                <th class="text-right font-medium py-2">Data</th>
                <th class="text-right font-medium py-2">Indexes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in data.collections" :key="c.name" class="border-b border-gray-800 last:border-0">
                <td class="py-2 text-gray-200 font-mono text-xs">{{ c.name }}</td>
                <td class="py-2 text-right text-gray-300">{{ c.documents?.toLocaleString() ?? '—' }}</td>
                <td class="py-2 text-right text-gray-300">{{ c.dataMB != null ? c.dataMB + ' MB' : '—' }}</td>
                <td class="py-2 text-right text-gray-300">{{ c.indexMB != null ? c.indexMB + ' MB' : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ── Data freshness ─────────────────────────────────────── -->
      <section class="grid gap-4 sm:grid-cols-2 mb-6">
        <div
          v-for="s in feeds"
          :key="s.label"
          class="bg-gray-800 border rounded-2xl p-5"
          :class="s.stale ? 'border-amber-700/60' : 'border-gray-700'"
        >
          <div class="flex items-center justify-between mb-1">
            <h2 class="font-semibold text-white">{{ s.label }}</h2>
            <span
              class="text-xs px-2 py-0.5 rounded-full"
              :class="s.stale ? 'bg-amber-900/40 text-amber-300' : 'bg-emerald-900/40 text-emerald-300'"
            >
              {{ s.stale ? 'stale' : 'fresh' }}
            </span>
          </div>
          <p v-if="s.present" class="text-2xl font-bold text-white">{{ formatAge(s.ageMinutes) }}</p>
          <p v-else class="text-2xl font-bold text-gray-500">never written</p>
          <p class="text-xs text-gray-500 mt-1">{{ s.detail }}</p>
        </div>
      </section>

      <!-- ── Operational stats ──────────────────────────────────── -->
      <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <div v-for="t in tiles" :key="t.label" class="bg-gray-800 border border-gray-700 rounded-2xl p-4">
          <p class="text-xs text-gray-400 uppercase tracking-wide">{{ t.label }}</p>
          <p class="text-xl font-bold text-white mt-1">{{ t.value }}</p>
          <p v-if="t.hint" class="text-xs text-gray-500 mt-1">{{ t.hint }}</p>
        </div>
      </section>

      <!-- ── Provider rate budget ───────────────────────────────── -->
      <section class="bg-gray-800 border border-gray-700 rounded-2xl p-5 mb-6">
        <h2 class="font-semibold text-white mb-1">Provider budget today</h2>
        <p class="text-xs text-gray-500 mb-3">
          Self-imposed daily caps, reset at midnight CET. A provider that reaches its cap is skipped
          rather than throttled.
        </p>
        <div class="space-y-2.5">
          <div v-for="(v, name) in data.rateBudget" :key="name">
            <div class="flex justify-between text-xs mb-1">
              <span class="text-gray-300 font-mono">{{ name }}</span>
              <span class="text-gray-400">{{ v.used }} / {{ v.cap }}</span>
            </div>
            <div class="h-1.5 rounded-full bg-gray-700 overflow-hidden">
              <div
                class="h-full rounded-full"
                :class="v.used / v.cap > 0.8 ? 'bg-amber-500' : 'bg-blue-500'"
                :style="{ width: Math.min(100, (v.used / v.cap) * 100) + '%' }"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- ── LLM agent ──────────────────────────────────────────── -->
      <section class="bg-gray-800 border border-gray-700 rounded-2xl p-5">
        <h2 class="font-semibold text-white mb-1">LLM agent</h2>
        <p class="text-xs text-gray-500 mb-3">
          In-process refresh is
          <span :class="data.llmRefresher.enabled ? 'text-emerald-400' : 'text-gray-300'">
            {{ data.llmRefresher.enabled ? 'enabled' : 'disabled' }}
          </span>
          on this host. When disabled, the snapshot is written by the scheduled workflow instead —
          spawning the agent here exhausts a small instance.
        </p>
        <dl class="grid gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
          <div v-for="row in refresherRows" :key="row.k" class="flex justify-between gap-4 border-b border-gray-800 pb-1.5">
            <dt class="text-gray-400">{{ row.k }}</dt>
            <dd class="text-gray-200 text-right font-mono text-xs break-all">{{ row.v }}</dd>
          </div>
        </dl>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

definePageMeta({ middleware: ['auth', 'admin'] })

const authStore = useAuthStore()
const { apiFetch } = useApi()

const data = ref<any>(null)
const loading = ref(false)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    data.value = await apiFetch('/api/admin/overview')
  } catch (err: any) {
    error.value = err?.data?.error || err?.message || 'Could not load admin data'
  } finally {
    loading.value = false
  }
}

/** Minutes are the wire format; hours and days only appear once they read better. */
function formatAge(mins: number | null | undefined) {
  if (mins == null) return '—'
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 min ago'
  if (mins < 60) return `${mins} min ago`
  const h = Math.floor(mins / 60)
  if (h < 24) return h === 1 ? '1 hour ago' : `${h} hours ago`
  const d = Math.floor(h / 24)
  return d === 1 ? '1 day ago' : `${d} days ago`
}

const usageColor = computed(() => {
  const p = data.value?.database.percentUsed ?? 0
  return p > 80 ? 'text-red-400' : p > 50 ? 'text-amber-400' : 'text-emerald-400'
})
const usageBar = computed(() => {
  const p = data.value?.database.percentUsed ?? 0
  return p > 80 ? 'bg-red-500' : p > 50 ? 'bg-amber-500' : 'bg-emerald-500'
})

/**
 * Staleness thresholds match how each feed is actually written: the standard
 * job every ~5 minutes, the LLM workflow on the same schedule but with a slower
 * run, so both get an hour of slack before they are worth alarming about.
 */
const feeds = computed(() => {
  const s = data.value?.snapshots?.standard
  const l = data.value?.snapshots?.llm
  return [
    {
      label: 'Standard prices',
      present: !!s,
      ageMinutes: s?.ageMinutes,
      stale: !s || s.ageMinutes > 60,
      detail: s
        ? `${s.cryptoCount} crypto · ${s.stocksCount} stocks · written ${s.updatedAtCET}`
        : 'The scheduled job has never written a snapshot.',
    },
    {
      label: 'LLM prices',
      present: !!l,
      ageMinutes: l?.ageMinutes,
      stale: !l || l.ageMinutes > 60,
      detail: l
        ? `${l.symbols.join(', ')} · ${l.method} · $${l.costUsd ?? 0} · written ${l.updatedAtCET}`
        : 'The agent has never written a snapshot.',
    },
  ]
})

const tiles = computed(() => {
  const d = data.value
  if (!d) return []
  return [
    { label: 'Users', value: d.counts.users, hint: `${d.admins.length} admin` },
    { label: 'Assets tracked', value: d.counts.assets },
    {
      label: 'History points',
      value: d.history.points.toLocaleString(),
      hint: `${d.history.symbols} symbols over ${d.history.spanDays ?? '—'} days`,
    },
    {
      label: 'Stock window',
      value: d.market?.open ? 'Open' : 'Closed',
      hint: d.market?.reason ?? d.market?.label ?? '',
    },
    { label: 'API uptime', value: `${d.process.uptimeHours} h`, hint: `Node ${d.process.node}` },
    {
      label: 'API memory',
      value: `${d.process.rssMB} MB`,
      hint: `heap ${d.process.heapUsedMB} MB`,
    },
    {
      label: 'Newest history point',
      value: formatAge(d.history.newestAgeMinutes),
    },
    {
      label: 'LLM errors',
      value: d.snapshots.llm?.errors ?? '—',
      hint: d.snapshots.llm?.failures ? 'see last failures' : 'no failures recorded',
    },
  ]
})

const refresherRows = computed(() => {
  const r = data.value?.llmRefresher
  if (!r) return []
  return [
    { k: 'attempts this process', v: r.attempts },
    { k: 'last outcome', v: r.lastOutcome ?? '—' },
    { k: 'last duration', v: r.lastDurationSec != null ? `${r.lastDurationSec}s` : '—' },
    { k: 'opencode installed', v: String(r.opencodeInstalled) },
    { k: 'stale after', v: `${r.staleAfterSec}s` },
    { k: 'cooldown remaining', v: `${r.cooldownRemainingSec}s` },
  ]
})

onMounted(load)
</script>
