<template>
  <div class="bg-gray-800 border border-gray-700 rounded-xl p-4">
    <button
      class="w-full flex items-center justify-between text-left"
      @click="expanded = !expanded"
    >
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
        </svg>
        <span class="text-sm font-medium text-gray-300">Local Storage Info</span>
      </div>
      <svg
        class="w-4 h-4 text-gray-500 transition-transform"
        :class="{ 'rotate-180': expanded }"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <div v-if="expanded" class="mt-4 space-y-3 text-sm">
      <p class="text-gray-400">
        Your portfolio data is saved in your browser's <strong class="text-gray-200">Local Storage</strong> under the key:
      </p>
      <code class="block bg-gray-900 text-blue-400 px-3 py-2 rounded-lg text-xs break-all select-all">
        portfolio-assets
      </code>

      <div class="text-gray-400 space-y-1.5">
        <p class="font-medium text-gray-300">How to view your data:</p>
        <ol class="list-decimal list-inside space-y-1 text-xs text-gray-400">
          <li>Open your browser's Developer Tools (<kbd class="bg-gray-700 px-1.5 py-0.5 rounded text-gray-300">{{ isMac ? '⌘ ⌥ I' : 'Ctrl+Shift+I' }}</kbd> or <kbd class="bg-gray-700 px-1.5 py-0.5 rounded text-gray-300">F12</kbd>)</li>
          <li>Go to the <strong class="text-gray-300">Application</strong> tab (Chrome/Edge) or <strong class="text-gray-300">Storage</strong> tab (Firefox)</li>
          <li>In the sidebar, expand <strong class="text-gray-300">Local Storage</strong> → click on {{ origin }}</li>
          <li>Find the key <strong class="text-blue-400">portfolio-assets</strong> — the value is your portfolio data in JSON format</li>
        </ol>
      </div>

      <div class="text-gray-400 space-y-1.5">
        <p class="font-medium text-gray-300">On-disk location (varies by browser):</p>
        <div class="bg-gray-900 rounded-lg px-3 py-2 text-xs space-y-1">
          <p><span class="text-gray-500">Chrome (macOS):</span> <code class="text-gray-300 break-all select-all">~/Library/Application Support/Google/Chrome/Default/Local Storage/leveldb/</code></p>
          <p><span class="text-gray-500">Chrome (Windows):</span> <code class="text-gray-300 break-all select-all">%LOCALAPPDATA%\Google\Chrome\User Data\Default\Local Storage\leveldb\</code></p>
          <p><span class="text-gray-500">Chrome (Linux):</span> <code class="text-gray-300 break-all select-all">~/.config/google-chrome/Default/Local Storage/leveldb/</code></p>
          <p><span class="text-gray-500">Firefox:</span> <code class="text-gray-300 break-all select-all">stored in webappsstore.sqlite inside your Firefox profile folder</code></p>
          <p><span class="text-gray-500">Safari:</span> <code class="text-gray-300 break-all select-all">~/Library/Safari/LocalStorage/</code></p>
        </div>
        <p class="text-xs text-yellow-500/80">
          ⚠ Browser local storage files use internal formats (LevelDB/SQLite) and are not meant to be edited directly. Use the Developer Tools to inspect or export your data.
        </p>
      </div>

      <div v-if="dataSize" class="flex items-center gap-2 text-xs text-gray-500 pt-1 border-t border-gray-700">
        <span>Current data size: <strong class="text-gray-300">{{ dataSize }}</strong></span>
        <span>·</span>
        <span>{{ assetCount }} asset{{ assetCount !== 1 ? 's' : '' }} stored</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const expanded = ref(false)

const isMac = computed(() => {
  if (!import.meta.client) return false
  return navigator.platform.toUpperCase().includes('MAC')
})

const origin = computed(() => {
  if (!import.meta.client) return 'localhost:3000'
  return window.location.origin
})

const dataSize = computed(() => {
  if (!import.meta.client) return null
  const data = localStorage.getItem('portfolio-assets')
  if (!data) return null
  const bytes = new Blob([data]).size
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
})

const assetCount = computed(() => {
  if (!import.meta.client) return 0
  const data = localStorage.getItem('portfolio-assets')
  if (!data) return 0
  try { return JSON.parse(data).length }
  catch { return 0 }
})
</script>
