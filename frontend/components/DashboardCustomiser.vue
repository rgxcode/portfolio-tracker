<template>
  <div v-if="resizing" class="mb-6 bg-gray-800 border border-gray-700 rounded-2xl p-4">
    <div class="flex items-baseline justify-between gap-3 flex-wrap mb-3">
      <p class="text-sm text-gray-300">
        Drag the divider between the panes to change their widths, and a panel's
        bottom edge for its height. Saved on this device.
      </p>
      <button class="text-xs text-gray-500 hover:text-gray-300 shrink-0" @click="reset">
        Reset the layout
      </button>
    </div>

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

        <!-- Which pane it is in. On a narrow screen the panes stack, so these
             read as order rather than position — which is still meaningful. -->
        <div class="flex items-center gap-0.5 bg-gray-800 rounded-lg p-0.5 text-[11px] font-medium">
          <button
            v-for="p in PLACEMENTS"
            :key="p.id"
            class="px-2 py-1 rounded-md transition-colors"
            :class="placementOf(s.id) === p.id ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'"
            :title="p.hint"
            @click="place(s.id, p.id)"
          >{{ p.label }}</button>
        </div>

        <!-- Reorder within a pane. Buttons rather than dragging: this has to
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
          <!-- Only offered once there is a dragged height to give back. -->
          <button
            class="w-7 h-7 rounded-md bg-gray-800 text-gray-400 hover:text-white disabled:opacity-30"
            :disabled="!(s.id in layout.heights)"
            title="Fit this panel to its contents"
            @click="clearHeight(s.id)"
          >⇕</button>
        </div>
      </li>
    </ul>

    <p class="text-[11px] text-gray-600 mt-3">
      On a narrow screen everything stacks in one column — left pane first, then
      right — and panels take the height of their contents.
    </p>
  </div>
</template>

<script setup lang="ts">
import type { Placement } from '~/composables/useDashboardLayout'

/**
 * Where each section goes, alongside the drag affordances on the panes
 * themselves. It shares the one "Adjust layout" toggle with them rather than
 * having a switch of its own: moving a panel and resizing it are the same
 * errand, and splitting them across two controls only asks which one you meant.
 */
const {
  SECTIONS, resizing, layout, placementOf, place, nudge, clearHeight, reset,
} = useDashboardLayout()

const PLACEMENTS: Array<{ id: Placement, label: string, hint: string }> = [
  { id: 'left', label: 'Left', hint: 'The left pane' },
  { id: 'right', label: 'Right', hint: 'The right pane' },
  { id: 'hidden', label: 'Hide', hint: 'Do not show this at all' },
]
</script>
