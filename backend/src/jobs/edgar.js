/**
 * Reported financials from the SEC's XBRL company-facts API.
 *
 * Why EDGAR rather than a commercial feed: it is the primary source companies
 * file to, it is free with no key and no daily quota, and it carries the full
 * history rather than a recent window. That is what makes covering all 500
 * members feasible — a metered provider would need months.
 *
 * https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json
 */

import Constituent from '../models/Constituent.js'
import FinancialHistory from '../models/FinancialHistory.js'
import { formatCET } from './marketHours.js'

const FACTS = 'https://data.sec.gov/api/xbrl/companyfacts/CIK'

/**
 * SEC asks for a contact address in the User-Agent and rate-limits at ten
 * requests a second. Overridable so a fork identifies itself rather than us.
 */
const UA = process.env.SEC_USER_AGENT || 'portfolio-tracker (ranajoy121@gmail.com)'

const log = (...a) => console.log(`[${formatCET()}] edgar:`, ...a)

/**
 * Companies tag the same idea with different concepts depending on their
 * industry and filing era, so each metric is a list tried in order. Revenue is
 * the worst offender: the modern tag arrived with ASC 606 in 2018, and older
 * filings use one of several predecessors.
 */
const CONCEPTS = {
  revenue: [
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'RevenueFromContractWithCustomerIncludingAssessedTax',
    'Revenues',
    'SalesRevenueNet',
    'SalesRevenueGoodsNet',
  ],
  grossProfit: ['GrossProfit'],
  operatingIncome: ['OperatingIncomeLoss'],
  netIncome: ['NetIncomeLoss', 'ProfitLoss'],
  researchAndDevelopment: ['ResearchAndDevelopmentExpense'],
  eps: ['EarningsPerShareDiluted', 'EarningsPerShareBasic'],
  // Instants — a position on a date, not a flow across a period.
  assets: ['Assets'],
  liabilities: ['Liabilities'],
  equity: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  cash: ['CashAndCashEquivalentsAtCarryingValue'],
}

const DURATION_METRICS = new Set([
  'revenue', 'grossProfit', 'operatingIncome', 'netIncome', 'researchAndDevelopment', 'eps',
])

/** A quarter, allowing for 13-week retail calendars and filing slack. */
const isQuarterLong = (start, end) => {
  const days = (new Date(end) - new Date(start)) / 86400e3
  return days >= 80 && days <= 100
}

/** A full year, allowing for 52/53-week fiscal calendars. */
const isYearLong = (start, end) => {
  const days = (new Date(end) - new Date(start)) / 86400e3
  return days >= 350 && days <= 380
}

/** Annual revenue by period end — the input for filling in a missing Q4. */
function annualRevenue(facts) {
  const out = new Map()
  for (const name of CONCEPTS.revenue) {
    const concept = facts[name]
    if (!concept) continue
    for (const unitFacts of Object.values(concept.units)) {
      for (const f of unitFacts) {
        if (f.val == null || !f.start || !f.end) continue
        if (!isYearLong(f.start, f.end)) continue
        if (!out.has(f.end)) out.set(f.end, { val: f.val, start: f.start, fy: f.fy, form: f.form })
      }
    }
  }
  return out
}

/**
 * Pick one value per period end for a metric.
 *
 * A concept can be reported many times for the same period — original filing,
 * later restatement, or a comparative figure inside a subsequent report. Facts
 * arrive oldest-first, so taking the last write for a period end naturally
 * prefers the most recently filed number.
 *
 * Quarterly-duration facts only: an annual total sitting alongside them would
 * silently become a quarter four times too large. Where a company reports Q4
 * only inside the annual figure, that quarter is left absent rather than
 * derived by subtraction, which would invent a number the company never filed.
 */
function seriesFor(facts, names, kind) {
  const byEnd = new Map()

  for (const name of names) {
    const concept = facts[name]
    if (!concept) continue

    for (const unitFacts of Object.values(concept.units)) {
      for (const f of unitFacts) {
        if (f.val == null || !f.end) continue
        if (kind === 'duration') {
          if (!f.start || !isQuarterLong(f.start, f.end)) continue
        } else if (f.start) {
          continue // an instant fact carries no start
        }
        byEnd.set(f.end, { val: f.val, start: f.start, fy: f.fy, fp: f.fp, form: f.form })
      }
    }
  }

  return byEnd
}

/**
 * Merge the candidate concepts for one metric, earlier names winning.
 *
 * Taking only the first concept that matched anything lost most of the history:
 * the modern revenue tag covers filings since 2018, and stopping there discarded
 * the years before it that use a predecessor tag. Filling each period end from
 * the first concept that reports it keeps the preferred tag where it exists and
 * the older ones where it does not.
 */
function mergedSeries(facts, names, kind) {
  const out = new Map()
  for (const name of names) {
    for (const [end, hit] of seriesFor(facts, [name], kind)) {
      if (!out.has(end)) out.set(end, hit)
    }
  }
  return out
}

/**
 * Fill in the fourth quarter, which many companies never report on its own.
 *
 * Their annual figure covers all four, so the quarter is the year minus the
 * three that were filed. Matching is done on the reported period dates, not on
 * EDGAR's fy/fp labels: those describe the filing's fiscal context rather than
 * the period, and grouping by them produced quarters that were wrong by twenty
 * per cent. A year is only completed when exactly three filed quarters fall
 * inside it and together span most of it.
 *
 * This is arithmetic on reported numbers, but it is not itself a filed figure,
 * so the rows are marked derived and the page says so.
 */
function deriveFourthQuarters(quarterlyRevenue, annualRevenue) {
  const filed = [...quarterlyRevenue.entries()]
    .filter(([, q]) => q.start && q.val != null)
    .map(([end, q]) => ({ end, start: q.start, val: q.val }))

  const days = (a, b) => (new Date(b) - new Date(a)) / 86400e3
  const added = []

  for (const [end, annual] of annualRevenue) {
    if (quarterlyRevenue.has(end)) continue // the company filed this quarter
    if (!annual.start || annual.val == null) continue

    const inside = filed.filter(q => q.start >= annual.start && q.end <= end)
    if (inside.length !== 3) continue

    // Three quarters should cover roughly nine months of the year; anything
    // else means the window caught the wrong periods.
    const covered = inside.reduce((n, q) => n + days(q.start, q.end), 0)
    if (covered < 250 || covered > 290) continue

    const revenue = annual.val - inside.reduce((n, q) => n + q.val, 0)
    if (!(revenue > 0)) continue

    added.push({ end, fp: 'Q4', form: annual.form, revenue, derived: true })
  }
  return added
}

/** Turn one company's facts into a newest-first list of quarters. */
export function buildQuarters(companyFacts) {
  const gaap = companyFacts?.facts?.['us-gaap'] ?? {}

  const series = {}
  for (const [metric, names] of Object.entries(CONCEPTS)) {
    series[metric] = mergedSeries(gaap, names, DURATION_METRICS.has(metric) ? 'duration' : 'instant')
  }

  // Period ends come from the income statement, which defines a quarter. A
  // balance-sheet date with no matching quarter is an annual-only position.
  const ends = new Set([
    ...series.revenue.keys(),
    ...series.netIncome.keys(),
  ])

  const quarters = [...ends].sort().reverse().map((end) => {
    const row = { end }
    for (const [metric, map] of Object.entries(series)) {
      const hit = map.get(end)
      if (hit) {
        row[metric] = hit.val
        if (!row.fy && hit.fy) { row.fy = hit.fy; row.fp = hit.fp; row.form = hit.form }
      }
    }
    return row
  })

  // A row with no income-statement figure at all is noise from a stray tag.
  const filed = quarters.filter(q => q.revenue != null || q.netIncome != null)

  const derived = deriveFourthQuarters(series.revenue, annualRevenue(gaap))
  if (derived.length === 0) return filed

  // Derived rows still get whatever balance-sheet position was filed for that
  // date — those are instants and are reported regardless of the quarter.
  for (const d of derived) {
    for (const metric of ['assets', 'liabilities', 'equity', 'cash']) {
      const hit = series[metric].get(d.end)
      if (hit) d[metric] = hit.val
    }
  }

  return [...filed, ...derived].sort((a, b) => (a.end < b.end ? 1 : -1))
}

/** Fetch and store one company's history. Returns how many quarters were kept. */
export async function refreshFinancials(symbol, cik) {
  const ticker = String(symbol).toUpperCase()
  const id = cik ?? (await Constituent.findById(ticker).lean())?.cik
  if (!id) throw new Error(`no CIK known for ${ticker}`)

  const res = await fetch(`${FACTS}${id}.json`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(60000),
  })
  if (res.status === 404) throw new Error('no XBRL filings')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const facts = await res.json()
  const quarters = buildQuarters(facts)
  if (quarters.length === 0) throw new Error('no quarterly figures found')

  await FinancialHistory.findByIdAndUpdate(
    ticker,
    { cik: id, entityName: facts.entityName, quarters, fetchedAt: new Date() },
    { upsert: true, new: true },
  )
  return quarters.length
}

export async function loadFinancials(symbol) {
  return FinancialHistory.findById(String(symbol).toUpperCase()).lean()
}

export { log as edgarLog }
