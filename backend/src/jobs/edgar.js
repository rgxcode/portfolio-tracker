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
  /**
   * Share count, needed for market cap and every per-share ratio.
   *
   * The cover-page figure (dei) is the most current and the one a market cap
   * should use; the balance-sheet figure is the fallback for filings that omit
   * it. Weighted-average counts are deliberately not used — they describe a
   * period for EPS purposes, not how many shares exist now.
   */
  sharesOutstanding: [
    'EntityCommonStockSharesOutstanding',
    'CommonStockSharesOutstanding',
  ],
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

/**
 * Figures that can be filled in for a missing Q4 by subtraction.
 *
 * Only additive flows: a year's revenue really is its four quarters summed.
 * EPS is deliberately absent — it is per share, and a changing share count
 * makes the same arithmetic quietly wrong.
 */
const DERIVABLE = ['revenue', 'grossProfit', 'operatingIncome', 'netIncome', 'researchAndDevelopment']

/** Annual totals for one metric by period end — the input for a missing Q4. */
function annualFor(facts, names) {
  const out = new Map()
  for (const name of names) {
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
function deriveFourthQuarters(gaap, series) {
  const days = (a, b) => (new Date(b) - new Date(a)) / 86400e3

  /** One metric's missing-quarter value inside a given annual window. */
  const subtract = (quarterly, annual, end) => {
    const filed = [...quarterly.entries()]
      .filter(([, q]) => q.start && q.val != null)
      .map(([e, q]) => ({ end: e, start: q.start, val: q.val }))

    const inside = filed.filter(q => q.start >= annual.start && q.end <= end)
    if (inside.length !== 3) return null

    // Three quarters should cover roughly nine months; anything else means the
    // window caught the wrong periods.
    const covered = inside.reduce((n, q) => n + days(q.start, q.end), 0)
    if (covered < 250 || covered > 290) return null

    return annual.val - inside.reduce((n, q) => n + q.val, 0)
  }

  // Revenue decides which quarters exist at all — a year with no annual revenue
  // is not one we can complete.
  const annualRevenue = annualFor(gaap, CONCEPTS.revenue)
  const added = []

  for (const [end, annual] of annualRevenue) {
    if (series.revenue.has(end)) continue // the company filed this quarter
    if (!annual.start || annual.val == null) continue

    const revenue = subtract(series.revenue, annual, end)
    if (!(revenue > 0)) continue

    const row = { end, fp: 'Q4', form: annual.form, revenue, derived: true }

    // Every other additive figure gets the same treatment, each against its own
    // annual total. Deriving only revenue left net income and margin with a
    // hole at every fourth quarter.
    for (const metric of DERIVABLE) {
      if (metric === 'revenue') continue
      const annuals = annualFor(gaap, CONCEPTS[metric])
      const yearly = annuals.get(end)
      if (!yearly?.start || yearly.val == null) continue
      const value = subtract(series[metric], yearly, end)
      // Losses are real, so only an absent result is skipped — not a negative.
      if (value != null && Number.isFinite(value)) row[metric] = value
    }

    added.push(row)
  }
  return added
}

/** Turn one company's facts into a newest-first list of quarters. */
export function buildQuarters(companyFacts) {
  /**
   * Share counts are filed under `dei` (document and entity information), not
   * `us-gaap`. The two namespaces use distinct concept names, so a flat merge
   * is safe and keeps every lookup below in one place.
   */
  const gaap = {
    ...(companyFacts?.facts?.['us-gaap'] ?? {}),
    ...(companyFacts?.facts?.dei ?? {}),
  }

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

  const derived = deriveFourthQuarters(gaap, series)
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
