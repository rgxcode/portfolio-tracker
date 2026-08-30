<template>
  <figure class="bg-gray-800 border border-gray-700 rounded-2xl p-4">
    <figcaption class="flex items-start justify-between gap-3 mb-1">
      <div>
        <h3 class="text-sm font-semibold text-gray-100">{{ title }}</h3>
        <p class="text-xs text-gray-500">{{ subtitle }}</p>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <button
          class="px-2 py-1 rounded text-[11px] bg-gray-900 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
          :title="copyState || 'Copy this chart as an image'"
          @click="copyImage"
        >
          {{ copyState || 'Copy' }}
        </button>
        <button
          class="px-2 py-1 rounded text-[11px] bg-gray-900 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
          title="Download as PNG"
          @click="downloadImage"
        >
          PNG
        </button>
      </div>
    </figcaption>

    <!-- Series are named in text as well as coloured, so identity never rests
         on colour alone — and the exported image carries the key with it. -->
    <ul class="flex flex-wrap gap-x-4 gap-y-1 my-2">
      <li v-for="s in series" :key="s.label" class="flex items-center gap-1.5 text-xs text-gray-400">
        <span class="w-2.5 h-2.5 rounded-sm shrink-0" :style="{ backgroundColor: s.color }" />
        {{ s.label }}
      </li>
    </ul>

    <div ref="holder" class="h-64">
      <Bar v-if="type === 'bar'" :data="data" :options="options" />
      <Line v-else :data="data" :options="options" />
    </div>
  </figure>
</template>

<script setup lang="ts">
import { Bar, Line } from 'vue-chartjs'

const props = defineProps<{
  title: string
  subtitle: string
  type: 'bar' | 'line'
  data: any
  options: any
  series: Array<{ label: string, color: string }>
  caption?: string
}>()

const holder = ref<HTMLElement | null>(null)
const copyState = ref('')

/**
 * Compose the chart onto an opaque card for sharing.
 *
 * A Chart.js canvas is transparent and carries no title or key, so pasting one
 * straight into a post gives a floating set of lines on whatever background the
 * platform uses. Redrawing it on a solid surface with the heading and the
 * series names makes the image self-explanatory once it leaves the app.
 */
async function render(): Promise<Blob | null> {
  const canvas = holder.value?.querySelector('canvas')
  if (!canvas) return null

  const scale = 2 // legible when a platform scales it down
  const pad = 24
  const headerH = 78
  const footerH = props.caption ? 30 : 14

  const out = document.createElement('canvas')
  out.width = (canvas.width / (window.devicePixelRatio || 1)) + pad * 2
  out.height = (canvas.height / (window.devicePixelRatio || 1)) + headerH + footerH
  const w = out.width
  const h = out.height
  out.width = w * scale
  out.height = h * scale

  const ctx = out.getContext('2d')
  if (!ctx) return null
  ctx.scale(scale, scale)

  ctx.fillStyle = '#111827'
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = '#f3f4f6'
  ctx.font = '600 15px ui-sans-serif, system-ui, -apple-system, sans-serif'
  ctx.fillText(props.title, pad, 28)

  ctx.fillStyle = '#9ca3af'
  ctx.font = '12px ui-sans-serif, system-ui, -apple-system, sans-serif'
  ctx.fillText(props.subtitle, pad, 47)

  // The key, redrawn so the exported image stands on its own.
  let x = pad
  for (const s of props.series) {
    ctx.fillStyle = s.color
    ctx.fillRect(x, 60, 9, 9)
    ctx.fillStyle = '#d1d5db'
    ctx.font = '12px ui-sans-serif, system-ui, -apple-system, sans-serif'
    ctx.fillText(s.label, x + 14, 69)
    x += 14 + ctx.measureText(s.label).width + 16
  }

  ctx.drawImage(canvas, pad, headerH, w - pad * 2, canvas.height / (window.devicePixelRatio || 1))

  if (props.caption) {
    ctx.fillStyle = '#6b7280'
    ctx.font = '11px ui-sans-serif, system-ui, -apple-system, sans-serif'
    ctx.fillText(props.caption, pad, h - 12)
  }

  return new Promise(resolve => out.toBlob(resolve, 'image/png'))
}

async function copyImage() {
  try {
    const blob = await render()
    if (!blob) return
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    copyState.value = 'Copied'
  } catch {
    // Clipboard image writes need a secure context and are unsupported in some
    // browsers; downloading always works, so say that rather than fail silently.
    copyState.value = 'Use PNG'
  }
  setTimeout(() => { copyState.value = '' }, 2000)
}

async function downloadImage() {
  const blob = await render()
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`
  a.click()
  URL.revokeObjectURL(url)
}
</script>
