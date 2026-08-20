/**
 * CET/CEST time helpers and the stock trading window.
 *
 * Everything user-facing is expressed in central European time. We use the
 * Europe/Berlin zone rather than a fixed +01:00 offset so the switch to summer
 * time (CEST) is handled automatically — the label in the formatted string
 * tells you which one is in effect.
 */

export const TZ = 'Europe/Berlin'

/** Stocks are only fetched between these hours, central European time. */
export const STOCK_WINDOW_START = 10 // 10:00 CET
export const STOCK_WINDOW_END = 22 // 22:00 CET

const cetFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZoneName: 'short',
})

const cetTimeOnlyFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZoneName: 'short',
})

/** "20 Aug 2026, 14:35:02 CEST" */
export function formatCET(date = new Date()) {
  return cetFormatter.format(date instanceof Date ? date : new Date(date))
}

/** "14:35 CEST" — for compact UI labels. */
export function formatCETTime(date = new Date()) {
  return cetTimeOnlyFormatter.format(date instanceof Date ? date : new Date(date))
}

/** The hour (0-23) in central European time for a given instant. */
export function cetHour(date = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(date),
  )
}

/** Day of week in CET: 0 = Sunday … 6 = Saturday. */
export function cetWeekday(date = new Date()) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(date)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name)
}

/**
 * True when stock prices are worth fetching: weekdays, 10:00–22:00 CET.
 * Outside this window the last snapshot is kept as-is — the market isn't
 * moving, so re-fetching would only spend rate limit to receive the same close.
 */
export function isStockWindowOpen(date = new Date()) {
  const day = cetWeekday(date)
  if (day === 0 || day === 6) return false // weekend
  const hour = cetHour(date)
  return hour >= STOCK_WINDOW_START && hour < STOCK_WINDOW_END
}

/** Human-readable reason a fetch was skipped, for the log and the API. */
export function stockWindowStatus(date = new Date()) {
  const day = cetWeekday(date)
  if (day === 0 || day === 6) return 'closed (weekend)'
  const hour = cetHour(date)
  if (hour < STOCK_WINDOW_START) return `closed (before ${STOCK_WINDOW_START}:00 CET)`
  if (hour >= STOCK_WINDOW_END) return `closed (after ${STOCK_WINDOW_END}:00 CET)`
  return `open (${STOCK_WINDOW_START}:00–${STOCK_WINDOW_END}:00 CET)`
}
