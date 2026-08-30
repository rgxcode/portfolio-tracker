import { Router } from 'express'
import auth from '../middleware/auth.js'
import PriceHistory from '../models/PriceHistory.js'
import Constituent from '../models/Constituent.js'
import FinancialHistory from '../models/FinancialHistory.js'

const router = Router()
router.use(auth)
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

/** Comparing more than a handful of lines stops being readable. */
const MAX_SYMBOLS = 6
const MAX_QUARTERS = 16

const PERIOD_DAYS = { '1M': 30, '6M': 182, YTD: null, '1Y': 365, '3Y': 1095, '5Y': 1825 }

function cutoffFor(period) {
  if (period === 'YTD') return new Date(new Date().getFullYear(), 0, 1)
  const days = PERIOD_DAYS[period] ?? 365
  return new Date(Date.now() - days * 86400e3)
}

/**
 * The calendar quarter a fiscal quarter belongs to.
 *
 * Companies close their books on different days: for the same business quarter
 * AMD ends 27 June, Tesla 30 June and NVIDIA 26 July. Grouping on the exact end
 * date puts each company in its own bucket, so a comparison chart showed one
 * bar per slot and looked like missing data.
 *
 * Shifting back six weeks before taking the calendar quarter absorbs that
 * spread — a period ending in late July is the quarter that ended in June —
 * while still separating genuinely different quarters.
 */
function calendarQuarter(end) {
  const d = new Date(end)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() - 45)
  return `${d.getUTCFullYear()} Q${Math.floor(d.getUTCMonth() / 3) + 1}`
}

/** Thin a series so several of them together stay a reasonable payload. */
function downsample(points, max = 220) {
  if (points.length <= max) return points
  const step = points.length / max
  const out = []
  for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)])
  const last = points[points.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

/**
 * GET /api/compare?symbols=AMD,NVDA&period=1Y
 *
 * Prices are returned raw and also indexed to 100 at the start of the window.
 * Comparing a $470 share with a $217 one on a single axis says nothing except
 * which is more expensive; rebasing to a common start is what makes "how have
 * these grown" a question the chart can answer, and it keeps everything on one
 * axis rather than reaching for a second scale.
 */
router.get('/', async (req, res, next) => {
  try {
    const symbols = String(req.query.symbols ?? '')
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, MAX_SYMBOLS)

    if (symbols.length === 0) return res.json({ period: req.query.period ?? '1Y', series: [] })

    const period = String(req.query.period ?? '1Y').toUpperCase()
    const cutoff = cutoffFor(period)

    const [members, financials] = await Promise.all([
      Constituent.find({ _id: { $in: symbols } }, { name: 1 }).lean(),
      FinancialHistory.find({ _id: { $in: symbols } }, { quarters: 1, entityName: 1 }).lean(),
    ])
    const nameOf = new Map(members.map(m => [m._id, m.name]))
    const finOf = new Map(financials.map(f => [f._id, f]))

    const series = await Promise.all(symbols.map(async (symbol) => {
      const rows = await PriceHistory.find(
        { symbol, ts: { $gte: cutoff } },
        { _id: 0, ts: 1, price: 1 },
      ).sort({ ts: 1 }).lean()

      const points = downsample(rows.map(r => ({ t: r.ts.getTime(), price: r.price })))
      const base = points[0]?.price ?? null

      const fin = finOf.get(symbol)
      const quarters = (fin?.quarters ?? [])
        .slice(0, MAX_QUARTERS)
        .map(q => ({
          end: q.end,
          // The shared bucket clients group on, so every company's Q2 lines up.
          period: calendarQuarter(q.end),
          revenue: q.revenue ?? null,
          netIncome: q.netIncome ?? null,
          // Margin is derived here so every client shows the same number.
          margin: q.revenue && q.netIncome != null ? q.netIncome / q.revenue : null,
          derived: q.derived === true,
        }))
        .reverse() // oldest first: these feed a time axis

      return {
        symbol,
        name: nameOf.get(symbol) ?? fin?.entityName ?? symbol,
        points: points.map(p => ({
          t: p.t,
          price: p.price,
          indexed: base ? +((p.price / base) * 100).toFixed(2) : null,
        })),
        changePercent: base && points.length > 1
          ? +(((points[points.length - 1].price - base) / base) * 100).toFixed(2)
          : null,
        quarters,
        // Said plainly so the page can explain a missing line rather than
        // drawing nothing and leaving the reader to guess.
        hasPrices: points.length > 1,
        hasFinancials: quarters.length > 0,
      }
    }))

    res.json({ period, series })
  } catch (err) {
    next(err)
  }
})

export default router
