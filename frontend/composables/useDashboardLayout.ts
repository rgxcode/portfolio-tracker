/**
 * Which dashboard sections a person sees, where, and in what order.
 *
 * Kept in the browser rather than the database: it is a display preference, it
 * should apply instantly without a round trip, and it is not worth an account
 * migration. A device that has never been customised gets the default.
 */

export type ColumnId = 'main' | 'side' | 'hidden'

export interface DashboardSection {
  id: string
  label: string
  /** What it is, in the words someone would use to decide where to put it. */
  hint: string
}

/** Everything that can be moved. Order here is the default order. */
export const SECTIONS: DashboardSection[] = [
  { id: 'portfolio', label: 'Portfolio value & chart', hint: 'Total worth, profit, and the value over time' },
  { id: 'holdings', label: 'Holdings', hint: 'Each asset with its quantity and unit price' },
  { id: 'allocation', label: 'Allocation charts', hint: 'Split by type and by asset' },
  { id: 'metrics', label: 'Metrics table', hint: 'Per-asset cost, value and gain' },
  { id: 'insights', label: 'What the coverage is saying', hint: 'Recent articles about your holdings' },
]

type Layout = Record<ColumnId, string[]>

const DEFAULT_LAYOUT: Layout = {
  main: ['portfolio', 'holdings'],
  side: ['allocation', 'metrics'],
  hidden: [],
}

// 'insights' is deliberately absent above: it spans the full width beneath the
// grid by default, which is a third placement rather than a column.
const FULL_WIDTH = 'insights'

const STORAGE_KEY = 'dashboardLayout.v1'

export function useDashboardLayout() {
  const layout = useState<Layout>('dashboardLayout', () => structuredClone(DEFAULT_LAYOUT))
  const editing = useState<boolean>('dashboardLayoutEditing', () => false)

  /** Any section not placed anywhere is appended, so a new one cannot vanish. */
  function reconcile(l: Layout): Layout {
    const placed = new Set([...l.main, ...l.side, ...l.hidden])
    const known = new Set(SECTIONS.map(s => s.id))
    const out: Layout = {
      main: l.main.filter(id => known.has(id)),
      side: l.side.filter(id => known.has(id)),
      hidden: l.hidden.filter(id => known.has(id)),
    }
    for (const s of SECTIONS) {
      if (!placed.has(s.id)) {
        (s.id === FULL_WIDTH ? out.main : out.side).push(s.id)
      }
    }
    return out
  }

  function load() {
    if (!import.meta.client) return
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) layout.value = reconcile(JSON.parse(saved))
    } catch {
      // Corrupt or unavailable storage: the default is a fine answer.
    }
  }

  function persist() {
    if (!import.meta.client) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout.value)) } catch { /* ignore */ }
  }

  function columnOf(id: string): ColumnId {
    for (const c of ['main', 'side', 'hidden'] as ColumnId[]) {
      if (layout.value[c].includes(id)) return c
    }
    return 'hidden'
  }

  function move(id: string, to: ColumnId) {
    const from = columnOf(id)
    if (from === to) return
    layout.value[from] = layout.value[from].filter(x => x !== id)
    layout.value[to] = [...layout.value[to], id]
    persist()
  }

  /** Shift a section within its own column. */
  function nudge(id: string, delta: -1 | 1) {
    const col = columnOf(id)
    const list = [...layout.value[col]]
    const i = list.indexOf(id)
    const j = i + delta
    if (i === -1 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    layout.value[col] = list
    persist()
  }

  function reset() {
    layout.value = structuredClone(DEFAULT_LAYOUT)
    persist()
  }

  const visible = (id: string) => columnOf(id) !== 'hidden'

  return { layout, editing, SECTIONS, load, move, nudge, reset, columnOf, visible }
}
