<template>
  <div>
    <button
      class="px-3 py-1.5 rounded-lg text-sm border transition-colors shrink-0"
      :class="editing
        ? 'bg-blue-600 border-blue-500 text-white'
        : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'"
      @click="editing = !editing"
    >
      {{ editing ? 'Done' : 'Customise' }}
    </button>

    <div
      v-if="editing"
      class="mt-3 bg-gray-800 border border-gray-700 rounded-2xl p-4"
    >
      <div class="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <p class="text-sm text-gray-300">
          Choose where each part of the dashboard sits. Saved on this device.
        </p>
        <button class="text-xs text-gray-500 hover:text-gray-300" @click="reset">Reset to default</button>
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

          <!-- Where it goes. On a narrow screen the columns stack, so these
               read as order rather than position — which is still meaningful. -->
          <div class="flex items-center gap-0.5 bg-gray-800 rounded-lg p-0.5 text-[11px] font-medium">
            <button
              v-for="c in COLUMNS"
              :key="c.id"
              class="px-2 py-1 rounded-md transition-colors"
              :class="columnOf(s.id) === c.id ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'"
              :title="c.hint"
              @click="move(s.id, c.id)"
            >{{ c.label }}</button>
          </div>

          <!-- Reorder within a column. Buttons rather than dragging: this has
               to work with a thumb on a phone as well as a mouse. -->
          <div class="flex items-center gap-0.5">
            <button
              class="w-7 h-7 rounded-md bg-gray-800 text-gray-400 hover:text-white disabled:opacity-30"
              :disabled="columnOf(s.id) === 'hidden'"
              title="Move up"
              @click="nudge(s.id, -1)"
            >↑</button>
            <button
              class="w-7 h-7 rounded-md bg-gray-800 text-gray-400 hover:text-white disabled:opacity-30"
              :disabled="columnOf(s.id) === 'hidden'"
              title="Move down"
              @click="nudge(s.id, 1)"
            >↓</button>
          </div>
        </li>
      </ul>

      <p class="text-[11px] text-gray-600 mt-3">
        On a narrow screen everything stacks in one column, in the order above.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
const { SECTIONS, editing, move, nudge, reset, columnOf } = useDashboardLayout()

const COLUMNS = [
  { id: 'main' as const, label: 'Left', hint: 'The wide column' },
  { id: 'side' as const, label: 'Right', hint: 'The narrow column beside it' },
  { id: 'hidden' as const, label: 'Hide', hint: 'Do not show this at all' },
]
</script>
