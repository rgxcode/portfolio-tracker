<template>
  <div v-if="editing" class="mt-3 bg-gray-800 border border-gray-700 rounded-2xl p-4">
    <!-- What this layout is called, and how many columns it has -->
    <div class="flex items-center gap-3 flex-wrap mb-4">
      <input
        :value="ws.name"
        class="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        aria-label="Layout name"
        @change="rename(($event.target as HTMLInputElement).value)"
      />

      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-500">Columns</span>
        <div class="flex items-center gap-0.5 bg-gray-900 rounded-lg p-0.5 text-xs font-medium">
          <button
            v-for="n in MAX_COLUMNS"
            :key="n"
            class="w-7 h-7 rounded-md transition-colors"
            :class="ws.columns.length === n ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'"
            @click="setColumnCount(n)"
          >{{ n }}</button>
        </div>
      </div>

      <div class="flex items-center gap-3 ml-auto text-xs">
        <button class="text-gray-400 hover:text-white" @click="duplicate">Duplicate</button>
        <button class="text-gray-400 hover:text-white" @click="reset">Reset this layout</button>
        <button
          class="text-gray-400 hover:text-red-400 disabled:opacity-30 disabled:hover:text-gray-400"
          :disabled="workspaces.length <= 1"
          :title="workspaces.length <= 1 ? 'The last layout cannot be deleted' : 'Delete this layout'"
          @click="remove(activeId)"
        >Delete</button>
      </div>
    </div>

    <p class="text-sm text-gray-300 mb-3">
      Choose where each part sits in <span class="text-white">{{ ws.name }}</span>. Drag the dividers
      between columns to change their widths. Saved on this device.
    </p>

    <ul class="space-y-2">
      <li
        v-for="s in SECTIONS"
        :key="s.id"
        class="flex items-center gap-3 flex-wrap bg-gray-900/60 border border-gray-700/70 rounded-xl px-3 py-2"
      >
        <div class="min-w-0 flex-1">
          <p class="text-sm text-white truncate">{{ s.label }}</p>
          <p class="text-[11px] text-gray-500 truncate">{{ s.hint }}</p>
        </div>

        <!-- Where it goes. On a narrow screen the columns stack, so these read
             as order rather than position — which is still meaningful. -->
        <div class="flex items-center gap-0.5 bg-gray-800 rounded-lg p-0.5 text-[11px] font-medium">
          <button
            v-for="p in placements"
            :key="p.id"
            class="px-2 py-1 rounded-md transition-colors"
            :class="placementOf(s.id) === p.id ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'"
            :title="p.hint"
            @click="place(s.id, p.id)"
          >{{ p.label }}</button>
        </div>

        <!-- Reorder within a column. Buttons rather than dragging: this has to
             work with a thumb on a phone as well as a mouse. -->
        <div class="flex items-center gap-0.5">
          <button
            class="w-7 h-7 rounded-md bg-gray-800 text-gray-400 hover:text-white disabled:opacity-30"
            :disabled="placementOf(s.id) === 'hidden'"
            title="Move up"
            @click="nudge(s.id, -1)"
          >↑</button>
          <button
            class="w-7 h-7 rounded-md bg-gray-800 text-gray-400 hover:text-white disabled:opacity-30"
            :disabled="placementOf(s.id) === 'hidden'"
            title="Move down"
            @click="nudge(s.id, 1)"
          >↓</button>
        </div>
      </li>
    </ul>

    <div class="flex items-baseline justify-between gap-3 mt-3 flex-wrap">
      <p class="text-[11px] text-gray-600">
        On a narrow screen everything stacks in one column, left to right, in the order above.
      </p>
      <button class="text-[11px] text-gray-600 hover:text-gray-400" @click="resetAll">
        Reset all layouts
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Placement } from '~/composables/useDashboardLayout'

const {
  SECTIONS, MAX_COLUMNS, editing, active, workspaces, activeId,
  placementOf, place, nudge, setColumnCount, rename, duplicate, remove, reset, resetAll,
} = useDashboardLayout()

const ws = active

/**
 * The buttons offered per section: one per column this layout actually has,
 * then the full-width band and hiding. Derived from the workspace rather than
 * fixed, so dropping to two columns cannot leave a button pointing at a third.
 */
const placements = computed<Array<{ id: Placement, label: string, hint: string }>>(() => {
  const cols = ws.value.columns.map((_, i) => ({
    id: `c${i}` as Placement,
    label: String(i + 1),
    hint: `Column ${i + 1}`,
  }))
  return [
    ...cols,
    { id: 'full', label: 'Wide', hint: 'Full width beneath the columns' },
    { id: 'hidden', label: 'Hide', hint: 'Do not show this at all' },
  ]
})
</script>
