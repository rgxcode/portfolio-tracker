<template>
  <div>
    <!-- The columns. Below xl this is not a grid at all, so the columns simply
         stack in order — the right shape for a phone, and the same DOM, so no
         chart is mounted twice to serve two layouts. -->
    <div
      ref="grid"
      :class="wide ? 'grid items-start' : ''"
      :style="wide ? gridStyle : undefined"
    >
      <template v-for="(col, i) in ws.columns" :key="`col-${i}`">
        <div class="min-w-0">
          <DashboardSection v-for="id in col" :key="id" :id="id" />
        </div>

        <!-- Drag to change the split. Sits in the gap between two columns, so
             it costs no width of its own. -->
        <div
          v-if="wide && i < ws.columns.length - 1"
          :key="`grip-${i}`"
          class="relative self-stretch group cursor-col-resize touch-none select-none"
          role="separator"
          tabindex="0"
          :aria-label="`Resize column ${i + 1}`"
          aria-orientation="vertical"
          @pointerdown="startDrag(i, $event)"
          @keydown="onKey(i, $event)"
        >
          <span
            class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-gray-700/70 transition-colors"
            :class="dragging === i
              ? 'bg-blue-500 w-0.5'
              : 'group-hover:bg-gray-500 group-focus:bg-blue-500'"
          />
          <!-- A wider invisible target than the line it draws: a 1px hit area
               is not something anyone can hit. -->
          <span class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-4" />
          <span
            class="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 h-8 w-1 rounded-full transition-colors"
            :class="dragging === i ? 'bg-blue-400' : 'bg-gray-700 group-hover:bg-gray-500'"
          />

          <!-- What you are actually setting, while you set it. -->
          <span
            v-if="dragging === i"
            class="absolute left-1/2 -translate-x-1/2 top-2 z-20 px-2 py-1 rounded-md bg-gray-900 border border-gray-600 text-[11px] font-medium text-gray-200 whitespace-nowrap shadow-lg"
          >
            {{ readout }}
          </span>
        </div>
      </template>
    </div>

    <!-- Full width beneath the columns -->
    <DashboardSection v-for="id in ws.full" :key="id" :id="id" />
  </div>
</template>

<script setup lang="ts">
/**
 * The resizable column grid for the active workspace.
 *
 * Widths are weights rather than pixels, so a layout saved on a 27" monitor
 * still means something on a laptop: the proportions survive, the absolute
 * sizes do not.
 */
const { active, setWidths, MIN_COLUMN_PX } = useDashboardLayout()
const ws = active

const GUTTER = 24

const grid = ref<HTMLElement | null>(null)
const dragging = ref<number | null>(null)
const readout = ref('')

/**
 * Whether the grid is in its side-by-side form. Resolved after mount rather
 * than during render: the inline `grid-template-columns` cannot live in a
 * media query, and deciding on the server would guess at a screen it cannot
 * see. Starting false means the server and the first client render agree.
 */
const wide = ref(false)
let mq: MediaQueryList | null = null
const syncWide = () => { wide.value = mq?.matches ?? false }

onMounted(() => {
  mq = window.matchMedia('(min-width: 1280px)')
  syncWide()
  mq.addEventListener('change', syncWide)
})
onUnmounted(() => {
  mq?.removeEventListener('change', syncWide)
  stopDrag()
})

const gridStyle = computed(() => ({
  gridTemplateColumns: ws.value.widths
    .map(w => `minmax(0, ${w.toFixed(4)}fr)`)
    .join(` ${GUTTER}px `),
}))

/** Pixels available to the columns themselves, gutters excluded. */
function usableWidth(): number {
  const box = grid.value?.getBoundingClientRect().width ?? 0
  return Math.max(1, box - GUTTER * (ws.value.columns.length - 1))
}

let start: { x: number, px: number[], usable: number } | null = null

function startDrag(i: number, e: PointerEvent) {
  const usable = usableWidth()
  start = { x: e.clientX, px: ws.value.widths.map(w => w * usable), usable }
  dragging.value = i
  updateReadout(i)
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  // The pointer spends the drag outside the 16px grip it started on, so the
  // resize cursor has to belong to the page for as long as the drag lasts.
  document.body.style.cursor = 'col-resize'
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', stopDrag)
  window.addEventListener('pointercancel', stopDrag)
  e.preventDefault()
}

function onMove(e: PointerEvent) {
  if (dragging.value === null || !start) return
  applyDelta(dragging.value, e.clientX - start.x)
}

/**
 * Move `dx` pixels of width from one column to its neighbour. Only the two
 * either side of the grip change, so dragging one splitter never rearranges
 * the rest of the row.
 */
function applyDelta(i: number, dx: number) {
  if (!start) return
  const min = MIN_COLUMN_PX
  const pair = start.px[i] + start.px[i + 1]
  // Nothing to give: two columns already at the minimum in a narrow window.
  if (pair < min * 2) return
  const left = Math.max(min, Math.min(pair - min, start.px[i] + dx))
  const next = [...start.px]
  next[i] = left
  next[i + 1] = pair - left
  setWidths(next.map(px => px / start!.usable))
  updateReadout(i)
}

function updateReadout(i: number) {
  const usable = usableWidth()
  const px = ws.value.widths.map(w => Math.round(w * usable))
  readout.value = `${px[i]} / ${px[i + 1]}`
}

function stopDrag() {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
  if (dragging.value !== null) setWidths(ws.value.widths, true)
  document.body.style.cursor = ''
  dragging.value = null
  start = null
}

/** Arrow keys nudge the split, so this is not a mouse-only control. */
function onKey(i: number, e: KeyboardEvent) {
  const step = e.shiftKey ? 64 : 16
  const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
  if (!dx) return
  e.preventDefault()
  const usable = usableWidth()
  start = { x: 0, px: ws.value.widths.map(w => w * usable), usable }
  applyDelta(i, dx)
  setWidths(ws.value.widths, true)
  start = null
}
</script>
