<template>
  <div class="relative" :class="boxed ? 'mb-8' : ''">
    <!-- The section itself. Only a section someone has actually dragged gets a
         fixed height and a scrollbar; every other one is as tall as it needs
         to be, which is the right answer for all of them until it isn't. -->
    <div
      ref="box"
      :class="boxed ? 'overflow-y-auto overscroll-contain' : ''"
      :style="boxed ? { height: `${height}px` } : undefined"
    >
      <DashboardSection :id="id" />
    </div>

    <!-- Drag the bottom edge for height. Hidden until resizing is on: an
         always-visible grip under every panel is clutter for the reader who
         never touches one. -->
    <div
      v-if="wide && resizing"
      class="absolute left-1/2 -translate-x-1/2 -bottom-2.5 z-10 flex items-center justify-center h-5 w-16 rounded-full border cursor-row-resize touch-none select-none transition-colors"
      :class="dragging
        ? 'bg-blue-600 border-blue-400'
        : 'bg-gray-800 border-gray-600 hover:bg-gray-700 hover:border-gray-500'"
      role="separator"
      tabindex="0"
      aria-orientation="horizontal"
      :aria-label="`Resize ${label} — double-click to fit its contents`"
      :title="boxed ? 'Drag for height · double-click to fit contents' : 'Drag for height'"
      @pointerdown="startDrag"
      @dblclick="clearHeight(id)"
      @keydown="onKey"
    >
      <span class="w-5 h-0.5 rounded-full" :class="dragging ? 'bg-white' : 'bg-gray-400'" />
    </div>

    <!-- What you are actually setting, while you set it. -->
    <span
      v-if="dragging"
      class="absolute right-0 -bottom-2.5 z-20 px-2 py-1 rounded-md bg-gray-900 border border-blue-600 text-[11px] font-medium text-blue-200 whitespace-nowrap shadow-lg"
    >
      {{ height }}px
    </span>
  </div>
</template>

<script setup lang="ts">
/**
 * One section, with its height under the reader's control.
 *
 * Heights are pixels rather than a proportion, unlike the split: a chart is
 * tall enough or it isn't, and that judgement does not scale with the width of
 * the window. They apply only side by side — forcing a height on a phone would
 * put a scrolling box inside a scrolling page, which is worse than the long
 * page it was meant to fix.
 */
const props = defineProps<{ id: string, wide: boolean }>()

const { layout, resizing, SECTIONS, setHeight, clearHeight, MIN_SECTION_PX } = useDashboardLayout()

const box = ref<HTMLElement | null>(null)
const dragging = ref(false)

const height = computed(() => layout.value.heights[props.id])
const boxed = computed(() => props.wide && height.value !== undefined)
const label = computed(() => SECTIONS.find(s => s.id === props.id)?.label ?? props.id)

let start: { y: number, h: number } | null = null

function startDrag(e: PointerEvent) {
  // Measuring rather than reading the stored value: the first drag of an
  // unsized section has to start from the height it is currently showing, not
  // from a minimum, or the panel jumps before it moves.
  start = { y: e.clientY, h: box.value?.getBoundingClientRect().height ?? MIN_SECTION_PX }
  dragging.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  document.body.style.cursor = 'row-resize'
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', stopDrag)
  window.addEventListener('pointercancel', stopDrag)
  e.preventDefault()
}

/**
 * The height is only written once the pointer has actually moved, so a click
 * that lands on the grip and goes nowhere leaves the panel as it found it
 * rather than quietly freezing it at its current size.
 */
function onMove(e: PointerEvent) {
  if (dragging.value && start) setHeight(props.id, start.h + (e.clientY - start.y))
}

function stopDrag() {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
  if (dragging.value && height.value !== undefined) setHeight(props.id, height.value, true)
  document.body.style.cursor = ''
  dragging.value = false
  start = null
}

onUnmounted(stopDrag)

/**
 * Arrow keys resize, Backspace gives the section its content's height back —
 * so neither the sizing nor the undoing of it is mouse-only.
 */
function onKey(e: KeyboardEvent) {
  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault()
    clearHeight(props.id)
    return
  }
  const step = e.shiftKey ? 64 : 16
  const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
  if (!dy) return
  e.preventDefault()
  const current = height.value ?? box.value?.getBoundingClientRect().height ?? MIN_SECTION_PX
  setHeight(props.id, current + dy, true)
}
</script>
