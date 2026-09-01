/**
 * Dashboard workspaces: named layouts a person switches between.
 *
 * The dashboard used to have one arrangement, chosen once. That answers "where
 * should this box live" but not "what am I doing right now" — checking the
 * morning move, watching a position, and reading up on a holding want genuinely
 * different screens, and re-dragging the same panels between them is the whole
 * chore. A workspace is one saved answer; the tabs switch between them.
 *
 * Kept in the browser rather than the database: it is a display preference, it
 * should apply instantly without a round trip, and it is not worth an account
 * migration. A device that has never been customised gets the presets.
 */

export interface DashboardSection {
  id: string
  label: string
  /** What it is, in the words someone would use to decide where to put it. */
  hint: string
}

/** Everything that can be placed. Order here is the order in the customiser. */
export const SECTIONS: DashboardSection[] = [
  { id: 'portfolio', label: 'Portfolio value & chart', hint: 'Total worth, profit, and the value over time' },
  { id: 'holdings', label: 'Holdings', hint: 'Each asset with its quantity and unit price' },
  { id: 'allocation', label: 'Allocation charts', hint: 'Split by type and by asset' },
  { id: 'metrics', label: 'Metrics table', hint: 'Per-asset cost, value and gain' },
  { id: 'insights', label: 'What the coverage is saying', hint: 'Recent articles about your holdings' },
]

/**
 * Where one section sits: a column by index, the full-width band beneath the
 * columns, or nowhere. Strings rather than a tagged union so the customiser can
 * render a row of buttons from a list and compare with `===`.
 */
export type Placement = `c${number}` | 'full' | 'hidden'

export interface Workspace {
  id: string
  name: string
  /** Section ids per column, in the order they stack. One to three columns. */
  columns: string[][]
  /** Relative width per column; same length as `columns`, normalised to sum 1. */
  widths: number[]
  /** Sections spanning the whole width beneath the columns. */
  full: string[]
  hidden: string[]
}

export const MAX_COLUMNS = 3
/** No column may be dragged narrower than this — below it, panels stop working. */
export const MIN_COLUMN_PX = 260

/**
 * The three presets, each a different job rather than a different taste.
 * Overview reproduces the layout that was there before workspaces existed, so
 * an upgrade changes nothing until someone asks it to.
 */
const PRESETS: Workspace[] = [
  {
    id: 'overview',
    name: 'Overview',
    columns: [['portfolio', 'holdings'], ['allocation', 'metrics']],
    widths: [0.66, 0.34],
    full: ['insights'],
    hidden: [],
  },
  {
    id: 'trading',
    name: 'Trading',
    // The chart as large as it goes, holdings beside it, and nothing to read:
    // this is the screen for watching, not for deciding.
    columns: [['portfolio'], ['holdings', 'allocation']],
    widths: [0.72, 0.28],
    full: [],
    hidden: ['metrics', 'insights'],
  },
  {
    id: 'research',
    name: 'Research',
    // Coverage gets a column of its own rather than a strip at the bottom,
    // with the numbers it is talking about on either side.
    columns: [['portfolio', 'allocation'], ['insights'], ['metrics', 'holdings']],
    widths: [0.36, 0.36, 0.28],
    full: [],
    hidden: [],
  },
]

const STORAGE_KEY = 'dashboardWorkspaces.v1'
/** The single-layout preference this replaced; read once, then superseded. */
const LEGACY_KEY = 'dashboardLayout.v1'

/**
 * Make a stored workspace safe to render: clamp the column count, drop
 * sections that no longer exist, and append any that were added to the app
 * since it was saved. A new section must never simply fail to appear.
 */
function reconcile(w: Partial<Workspace>): Workspace {
  const known = new Set(SECTIONS.map(s => s.id))
  const cols = (Array.isArray(w.columns) ? w.columns : [])
    .slice(0, MAX_COLUMNS)
    .map(c => (Array.isArray(c) ? c.filter(id => known.has(id)) : []))
  if (cols.length === 0) cols.push([])

  const out: Workspace = {
    id: String(w.id || `ws-${Date.now()}`),
    name: String(w.name || 'Layout'),
    columns: cols,
    widths: normalise(Array.isArray(w.widths) ? w.widths : [], cols.length),
    full: (Array.isArray(w.full) ? w.full : []).filter(id => known.has(id)),
    hidden: (Array.isArray(w.hidden) ? w.hidden : []).filter(id => known.has(id)),
  }

  const placed = new Set([...out.columns.flat(), ...out.full, ...out.hidden])
  for (const s of SECTIONS) {
    if (!placed.has(s.id)) out.columns[out.columns.length - 1].push(s.id)
  }
  return out
}

/** Weights as fractions of one, with a sane fallback for junk input. */
function normalise(widths: number[], count: number): number[] {
  const w = widths.slice(0, count).map(n => (Number.isFinite(n) && n > 0 ? n : 0))
  while (w.length < count) w.push(0)
  const total = w.reduce((a, b) => a + b, 0)
  if (total <= 0) return Array.from({ length: count }, () => 1 / count)
  return w.map(n => (n > 0 ? n / total : 0.0001))
}

function defaults(): Workspace[] {
  return PRESETS.map(p => reconcile(structuredClone(p)))
}

export function useDashboardLayout() {
  const workspaces = useState<Workspace[]>('dashboardWorkspaces', defaults)
  const activeId = useState<string>('dashboardWorkspaceActive', () => PRESETS[0].id)
  const editing = useState<boolean>('dashboardLayoutEditing', () => false)

  const active = computed<Workspace>(
    () => workspaces.value.find(w => w.id === activeId.value) ?? workspaces.value[0],
  )

  function load() {
    if (!import.meta.client) return
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        const list = (parsed.workspaces ?? []).map(reconcile)
        if (list.length) {
          workspaces.value = list
          activeId.value = list.some((w: Workspace) => w.id === parsed.active)
            ? parsed.active
            : list[0].id
        }
        return
      }
      // First run since workspaces shipped: carry the old single layout across
      // as Overview, so a customised dashboard survives the upgrade.
      const legacy = localStorage.getItem(LEGACY_KEY)
      if (legacy) {
        const l = JSON.parse(legacy)
        const ws = defaults()
        ws[0] = reconcile({
          id: 'overview',
          name: 'Overview',
          columns: [l.main ?? [], l.side ?? []],
          widths: [0.66, 0.34],
          full: [],
          hidden: l.hidden ?? [],
        })
        workspaces.value = ws
        persist()
      }
    } catch {
      // Corrupt or unavailable storage: the presets are a fine answer.
    }
  }

  function persist() {
    if (!import.meta.client) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        active: activeId.value,
        workspaces: workspaces.value,
      }))
    } catch { /* ignore */ }
  }

  // ── Placing sections ──────────────────────────────────────────────
  function placementOf(id: string): Placement {
    const i = active.value.columns.findIndex(c => c.includes(id))
    if (i !== -1) return `c${i}`
    if (active.value.full.includes(id)) return 'full'
    return 'hidden'
  }

  function detach(w: Workspace, id: string) {
    w.columns = w.columns.map(c => c.filter(x => x !== id))
    w.full = w.full.filter(x => x !== id)
    w.hidden = w.hidden.filter(x => x !== id)
  }

  function place(id: string, to: Placement) {
    const w = active.value
    if (placementOf(id) === to) return
    detach(w, id)
    if (to === 'full') w.full.push(id)
    else if (to === 'hidden') w.hidden.push(id)
    else {
      const i = Math.min(Number(to.slice(1)), w.columns.length - 1)
      w.columns[i].push(id)
    }
    persist()
  }

  /** Shift a section within whichever list it is already in. */
  function nudge(id: string, delta: -1 | 1) {
    const w = active.value
    const p = placementOf(id)
    if (p === 'hidden') return
    const list = p === 'full' ? w.full : w.columns[Number(p.slice(1))]
    const i = list.indexOf(id)
    const j = i + delta
    if (i === -1 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    persist()
  }

  // ── Columns ───────────────────────────────────────────────────────
  function setColumnCount(n: number) {
    const w = active.value
    const count = Math.max(1, Math.min(MAX_COLUMNS, n))
    if (count === w.columns.length) return
    if (count < w.columns.length) {
      // Removed columns give their sections to the last surviving one rather
      // than dropping them — losing a panel to a layout tweak is never right.
      const spill = w.columns.slice(count).flat()
      w.columns = w.columns.slice(0, count)
      w.columns[count - 1].push(...spill)
    } else {
      while (w.columns.length < count) w.columns.push([])
    }
    w.widths = normalise(w.widths, count)
    persist()
  }

  /** Called continuously while a splitter is dragged; only the end persists. */
  function setWidths(widths: number[], save = false) {
    active.value.widths = normalise(widths, active.value.columns.length)
    if (save) persist()
  }

  // ── Workspaces ────────────────────────────────────────────────────
  function select(id: string) {
    if (!workspaces.value.some(w => w.id === id)) return
    activeId.value = id
    persist()
  }

  function uniqueName(base: string): string {
    const taken = new Set(workspaces.value.map(w => w.name))
    if (!taken.has(base)) return base
    let n = 2
    while (taken.has(`${base} ${n}`)) n++
    return `${base} ${n}`
  }

  function add() {
    const w = reconcile({
      id: `ws-${Date.now()}`,
      name: uniqueName('New layout'),
      // Starts with the chart and nothing else: built up deliberately rather
      // than inherited by accident, but never a blank screen — an empty
      // dashboard reads as a fault rather than as a starting point.
      columns: [['portfolio'], []],
      widths: [0.6, 0.4],
      full: [],
      hidden: SECTIONS.map(s => s.id).filter(id => id !== 'portfolio'),
    })
    workspaces.value.push(w)
    activeId.value = w.id
    persist()
    editing.value = true
  }

  function duplicate() {
    const copy = structuredClone(toRaw(active.value))
    copy.id = `ws-${Date.now()}`
    copy.name = uniqueName(`${active.value.name} copy`)
    workspaces.value.push(copy)
    activeId.value = copy.id
    persist()
  }

  function rename(name: string) {
    active.value.name = name.trim() || active.value.name
    persist()
  }

  function remove(id: string) {
    // There is always somewhere to be: the last workspace cannot be deleted.
    if (workspaces.value.length <= 1) return
    const i = workspaces.value.findIndex(w => w.id === id)
    if (i === -1) return
    workspaces.value.splice(i, 1)
    if (activeId.value === id) activeId.value = workspaces.value[Math.max(0, i - 1)].id
    persist()
  }

  /** Restore this workspace: to its preset if it is one, else to a plain split. */
  function reset() {
    const preset = PRESETS.find(p => p.id === active.value.id)
    const fresh = preset
      ? reconcile(structuredClone(preset))
      : reconcile({ id: active.value.id, name: active.value.name, columns: [[], []], widths: [0.66, 0.34] })
    const i = workspaces.value.findIndex(w => w.id === active.value.id)
    workspaces.value[i] = fresh
    persist()
  }

  function resetAll() {
    workspaces.value = defaults()
    activeId.value = PRESETS[0].id
    persist()
  }

  return {
    workspaces, activeId, active, editing, SECTIONS, MAX_COLUMNS, MIN_COLUMN_PX,
    load, persist, placementOf, place, nudge,
    setColumnCount, setWidths,
    select, add, duplicate, rename, remove, reset, resetAll,
  }
}
