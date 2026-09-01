<template>
  <div>
    <!-- The two panes. Below xl this is not a grid at all, so they simply stack
         in order — the right shape for a phone, and the same DOM, so no chart
         is mounted twice to serve two layouts. -->
    <div
      ref="grid"
      :class="wide ? 'grid items-start' : ''"
      :style="wide ? gridStyle : undefined"
    >
      <div class="min-w-0">
        <DashboardPanel v-for="id in layout.left" :key="id" :id="id" :wide="wide" />
      </div>

      <!-- Drag to change the split. Sits in the gap between the panes, so it
           costs no width of its own. -->
      <div
        v-if="wide"
        class="relative self-stretch group cursor-col-resize touch-none select-none"
        role="separator"
        tabindex="0"
        aria-label="Resize the split between the panes"
        aria-orientation="vertical"
        :aria-valuenow="Math.round(layout.split * 100)"
        aria-valuemin="15"
        aria-valuemax="85"
        @pointerdown="startDrag"
        @keydown="onKey"
      >
        <span
          class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px transition-colors"
          :class="dragging
            ? 'bg-blue-500 w-0.5'
            : 'bg-gray-700/70 group-hover:bg-gray-500 group-focus:bg-blue-500'"
        />
        <!-- A wider invisible target than the line it draws: a 1px hit area is
             not something anyone can hit. -->
        <span class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-4" />

        <!-- The grip proper. Always there to be grabbed; only conspicuous once
             resizing is on, so a reader who never moves it is not asked to
             look at a handle on every edge. -->
        <span
          class="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 rounded-full transition-all"
          :class="dragging
            ? 'h-14 w-1.5 bg-blue-400 ring-4 ring-blue-500/20'
            : resizing
              ? 'h-14 w-1.5 bg-blue-500/70 group-hover:bg-blue-400'
              : 'h-8 w-1 bg-gray-700 group-hover:bg-gray-500'"
        />

        <!-- What you are actually setting, while you set it. -->
        <span
          v-if="dragging"
          class="absolute left-1/2 -translate-x-1/2 top-2 z-20 px-2 py-1 rounded-md bg-gray-900 border border-blue-600 text-[11px] font-medium text-blue-200 whitespace-nowrap shadow-lg"
        >
          {{ readout }}
        </span>
      </div>

      <div class="min-w-0">
        <DashboardPanel v-for="id in layout.right" :key="id" :id="id" :wide="wide" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Two panes with a draggable divider between them.
 *
 * The split is a weight rather than a pixel width, so a layout set on a 27"
 * monitor still means something on a laptop: the proportion survives, the
 * absolute size does not. Pixels only exist for the duration of a drag, which
 * is the one moment a person is thinking in them.
 */
const { layout, resizing, setSplit, MIN_PANE_PX } = useDashboardLayout()

const GUTTER = 24

const grid = ref<HTMLElement | null>(null)
const dragging = ref(false)
const readout = ref('')

/**
 * Whether the panes are side by side. Resolved after mount rather than during
 * render: the inline `grid-template-columns` cannot live in a media query, and
 * deciding on the server would guess at a screen it cannot see. Starting false
 * means the server and the first client render agree.
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
  gridTemplateColumns:
    `minmax(0, ${layout.value.split.toFixed(4)}fr) ${GUTTER}px minmax(0, ${(1 - layout.value.split).toFixed(4)}fr)`,
}))

/** Pixels available to the panes themselves, the gutter excluded. */
function usableWidth(): number {
  return Math.max(1, (grid.value?.getBoundingClientRect().width ?? 0) - GUTTER)
}

let start: { x: number, leftPx: number, usable: number } | null = null

function startDrag(e: PointerEvent) {
  const usable = usableWidth()
  start = { x: e.clientX, leftPx: layout.value.split * usable, usable }
  dragging.value = true
  updateReadout()
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
  if (dragging.value) applyDelta(e.clientX - start!.x)
}

function applyDelta(dx: number) {
  if (!start) return
  // Nothing to give: both panes already at the minimum in a narrow window.
  if (start.usable < MIN_PANE_PX * 2) return
  const left = Math.max(MIN_PANE_PX, Math.min(start.usable - MIN_PANE_PX, start.leftPx + dx))
  setSplit(left / start.usable)
  updateReadout()
}

function updateReadout() {
  const usable = usableWidth()
  const left = Math.round(layout.value.split * usable)
  readout.value = `${left} / ${Math.round(usable) - left}`
}

function stopDrag() {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
  if (dragging.value) setSplit(layout.value.split, true)
  document.body.style.cursor = ''
  dragging.value = false
  start = null
}

/** Arrow keys nudge the split, so this is not a mouse-only control. */
function onKey(e: KeyboardEvent) {
  const step = e.shiftKey ? 64 : 16
  const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
  if (!dx) return
  e.preventDefault()
  const usable = usableWidth()
  start = { x: 0, leftPx: layout.value.split * usable, usable }
  applyDelta(dx)
  setSplit(layout.value.split, true)
  start = null
}
</script>
