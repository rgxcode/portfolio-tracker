<template>
  <div class="mb-4">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <!-- One tab per saved layout. Switching is the point of the feature, so
           it is one click and never behind the editor. -->
      <div class="flex items-center gap-1 bg-gray-800/60 border border-gray-700 rounded-xl p-1 flex-wrap">
        <button
          v-for="w in workspaces"
          :key="w.id"
          class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          :class="w.id === activeId
            ? 'bg-gray-700 text-white shadow-sm'
            : 'text-gray-400 hover:text-gray-200'"
          @click="select(w.id)"
        >
          {{ w.name }}
        </button>

        <button
          class="w-8 h-8 rounded-lg text-gray-500 hover:text-white hover:bg-gray-700 transition-colors text-lg leading-none"
          title="New layout"
          aria-label="New layout"
          @click="add"
        >+</button>
      </div>

      <button
        class="px-3 py-1.5 rounded-lg text-sm border transition-colors shrink-0"
        :class="editing
          ? 'bg-blue-600 border-blue-500 text-white'
          : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'"
        @click="editing = !editing"
      >
        {{ editing ? 'Done' : 'Customise' }}
      </button>
    </div>

    <DashboardCustomiser />
  </div>
</template>

<script setup lang="ts">
const { workspaces, activeId, editing, select, add } = useDashboardLayout()
</script>
