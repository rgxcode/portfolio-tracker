/**
 * The dashboard as two resizable panes.
 *
 * Each section sits in the left pane or the right one, the divider between them
 * is draggable, and any section's height can be dragged from its bottom edge.
 * That is the whole model: one arrangement, adjusted in place, rather than a set
 * of named layouts to switch between. Someone who wants the chart bigger drags
 * it bigger — they do not first decide which saved screen they are on.
 *
 * Two panes and no more, deliberately. It cannot express a three-up trading
 * view, and in exchange there is no grid to reason about, no arrange mode to
 * enter before anything responds, and nothing to name.
 *
 * Kept in the browser rather than the database: it is a display preference, it
 * should apply instantly without a round trip, and it is not worth an account
 * migration. A device that has never been adjusted gets the defaults below.
 */

export interface DashboardSection {
  id: string
  label: string
  /** What it is, in the words someone would use to decide where to put it. */
  hint: string
}

/** Everything that can be placed. Order here is the order in the arranger. */
export const SECTIONS: DashboardSection[] = [
  { id: 'portfolio', label: 'Portfolio value & chart', hint: 'Total worth, profit, and the value over time' },
  { id: 'holdings', label: 'Holdings', hint: 'Each asset with its quantity and unit price' },
  { id: 'allocation', label: 'Allocation charts', hint: 'Split by type and by asset' },
  { id: 'metrics', label: 'Metrics table', hint: 'Per-asset cost, value and gain' },
  { id: 'insights', label: 'What the coverage is saying', hint: 'Recent articles about your holdings' },
]

/** Which pane a section is in, or that it is in neither. */
export type Placement = 'left' | 'right' | 'hidden'

export interface SplitLayout {
  /** Section ids per pane, in the order they stack. */
  left: string[]
  right: string[]
  hidden: string[]
  /** The left pane's share of the width, 0–1. The right pane takes the rest. */
  split: number
  /**
   * Dragged heights in pixels, by section id. A section with no entry sizes
   * itself to its content, which is the right default for all of them — a
   * height is only ever here because someone asked for one.
   */
  heights: Record<string, number>
}

/** Neither pane may be dragged narrower than this — below it, panels stop working. */
export const MIN_PANE_PX = 260
/** Nor any section shorter than this, which is about one row plus its heading. */
export const MIN_SECTION_PX = 140
/** A dragged height beyond this is almost certainly a slip, not an intention. */
export const MAX_SECTION_PX = 2000

/** The arrangement that was there before any of this was adjustable. */
function defaults(): SplitLayout {
  return {
    left: ['portfolio', 'holdings'],
    right: ['allocation', 'metrics'],
    hidden: [],
    split: 0.66,
    heights: {},
  }
}

const STORAGE_KEY = 'dashboardSplit.v1'
/** The two preferences this replaced, read once on upgrade then superseded. */
const WORKSPACES_KEY = 'dashboardWorkspaces.v1'
const LEGACY_KEY = 'dashboardLayout.v1'

/**
 * Make a stored layout safe to render: drop sections that no longer exist,
 * clamp the split, and append any section added to the app since it was saved.
 * A new section must never simply fail to appear.
 */
function reconcile(l: Partial<SplitLayout>): SplitLayout {
  const known = new Set(SECTIONS.map(s => s.id))
  const seen = new Set<string>()
  /** Keep each id once: a section in both panes would mount twice. */
  const clean = (list: unknown): string[] =>
    (Array.isArray(list) ? list : []).filter((id): id is string => {
      if (typeof id !== 'string' || !known.has(id) || seen.has(id)) return false
      seen.add(id)
      return true
    })

  const out: SplitLayout = {
    left: clean(l.left),
    right: clean(l.right),
    hidden: clean(l.hidden),
    split: clampSplit(l.split),
    heights: cleanHeights(l.heights, known),
  }

  for (const s of SECTIONS) if (!seen.has(s.id)) out.right.push(s.id)
  return out
}

/**
 * Keep the divider away from both ends. As a fraction rather than pixels, so a
 * split set on a 27" monitor still means something on a laptop: the proportion
 * survives, the absolute width does not.
 */
function clampSplit(n: unknown): number {
  return Number.isFinite(n) ? Math.min(0.85, Math.max(0.15, n as number)) : 0.66
}

function cleanHeights(h: unknown, known: Set<string>): Record<string, number> {
  const out: Record<string, number> = {}
  if (!h || typeof h !== 'object') return out
  for (const [id, px] of Object.entries(h as Record<string, unknown>)) {
    if (!known.has(id) || !Number.isFinite(px)) continue
    out[id] = Math.min(MAX_SECTION_PX, Math.max(MIN_SECTION_PX, px as number))
  }
  return out
}

/**
 * Fold a saved workspace set down to one two-pane layout. The workspace that
 * was on screen is the one that survives; a third column and the full-width
 * band both empty into the left pane, since that is where their contents were
 * widest. Layouts that were only ever switched away to are not worth keeping
 * around invisibly, so they go.
 */
function fromWorkspaces(parsed: any): Partial<SplitLayout> | null {
  const list = Array.isArray(parsed?.workspaces) ? parsed.workspaces : []
  const ws = list.find((w: any) => w?.id === parsed?.active) ?? list[0]
  if (!ws) return null
  const cols: string[][] = Array.isArray(ws.columns) ? ws.columns : []
  const widths: number[] = Array.isArray(ws.widths) ? ws.widths : []
  const share = (i: number) => (Number.isFinite(widths[i]) ? widths[i] : 0)
  const total = widths.reduce((a, _, i) => a + share(i), 0)
  // The left pane inherits the width of every column folded into it, not just
  // the first — otherwise a three-column layout arrives with two columns'
  // worth of sections in a pane sized for one.
  const leftShare = widths.reduce((a, _, i) => (i === 1 ? a : a + share(i)), 0)
  return {
    left: [...(cols[0] ?? []), ...cols.slice(2).flat(), ...(ws.full ?? [])],
    right: cols[1] ?? [],
    hidden: ws.hidden ?? [],
    split: total > 0 ? leftShare / total : undefined,
    heights: {},
  }
}

export function useDashboardLayout() {
  const layout = useState<SplitLayout>('dashboardSplit', defaults)
  /**
   * Whether the resize grips are showing. Off by default: the dashboard should
   * open as a dashboard, not as its own settings, and a splitter handle on
   * every panel edge is noise for the reader who never wants to move one.
   */
  const resizing = useState<boolean>('dashboardResizing', () => false)

  function load() {
    if (!import.meta.client) return
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        layout.value = reconcile(JSON.parse(saved))
        return
      }
      // First run since the split panes shipped: carry whichever older
      // preference is on this device across, so an adjusted dashboard survives
      // the upgrade rather than silently resetting.
      const workspaces = localStorage.getItem(WORKSPACES_KEY)
      if (workspaces) {
        const migrated = fromWorkspaces(JSON.parse(workspaces))
        if (migrated) {
          layout.value = reconcile(migrated)
          persist()
        }
        return
      }
      const legacy = localStorage.getItem(LEGACY_KEY)
      if (legacy) {
        const l = JSON.parse(legacy)
        layout.value = reconcile({ left: l.main, right: l.side, hidden: l.hidden })
        persist()
      }
    } catch {
      // Corrupt or unavailable storage: the default arrangement is a fine answer.
    }
  }

  function persist() {
    if (!import.meta.client) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout.value))
    } catch { /* ignore */ }
  }

  // ── Placing sections ──────────────────────────────────────────────
  function placementOf(id: string): Placement {
    if (layout.value.left.includes(id)) return 'left'
    if (layout.value.right.includes(id)) return 'right'
    return 'hidden'
  }

  function listFor(p: Placement): string[] {
    const l = layout.value
    return p === 'left' ? l.left : p === 'right' ? l.right : l.hidden
  }

  function place(id: string, to: Placement) {
    const l = layout.value
    if (placementOf(id) === to) return
    l.left = l.left.filter(x => x !== id)
    l.right = l.right.filter(x => x !== id)
    l.hidden = l.hidden.filter(x => x !== id)
    listFor(to).push(id)
    persist()
  }

  /** Shift a section up or down within the pane it is already in. */
  function nudge(id: string, delta: -1 | 1) {
    const p = placementOf(id)
    if (p === 'hidden') return
    const list = listFor(p)
    const i = list.indexOf(id)
    const j = i + delta
    if (i === -1 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    persist()
  }

  // ── Sizes ─────────────────────────────────────────────────────────
  /** Called continuously while the divider is dragged; only the end persists. */
  function setSplit(fraction: number, save = false) {
    layout.value.split = clampSplit(fraction)
    if (save) persist()
  }

  /** Likewise for a section's height, dragged from its bottom edge. */
  function setHeight(id: string, px: number, save = false) {
    layout.value.heights[id] = Math.min(MAX_SECTION_PX, Math.max(MIN_SECTION_PX, Math.round(px)))
    if (save) persist()
  }

  /** Give a section its content's height back. */
  function clearHeight(id: string) {
    if (!(id in layout.value.heights)) return
    delete layout.value.heights[id]
    persist()
  }

  function reset() {
    layout.value = defaults()
    persist()
  }

  return {
    layout, resizing, SECTIONS, MIN_PANE_PX, MIN_SECTION_PX,
    load, persist, placementOf, place, nudge,
    setSplit, setHeight, clearHeight, reset,
  }
}
