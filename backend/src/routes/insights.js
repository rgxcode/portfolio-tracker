import { Router } from 'express'
import auth from '../middleware/auth.js'
import Insight from '../models/Insight.js'
import Asset from '../models/Asset.js'

const router = Router()
router.use(auth)
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

/**
 * GET /api/insights — an LLM read of the caller's holdings.
 *
 * Only the caller's own symbols, and only insights already generated: this
 * never triggers a model run, so a page load cannot be made expensive by
 * reloading it. The scheduled job does the writing.
 */
router.get('/', async (req, res, next) => {
  try {
    // Cash is left out of the count as well as the analysis. Including it made
    // the header read "8 of 12" when only 11 holdings could ever have coverage,
    // and listed currencies as awaiting an article that is never coming.
    const assets = await Asset.find(
      { userId: req.userId, type: { $ne: 'cash' } },
      { symbol: 1, type: 1 },
    ).lean()
    const symbols = [...new Set(assets.map(a => String(a.symbol).toUpperCase()))]
    if (symbols.length === 0) return res.json({ insights: [], summary: null })

    const insights = await Insight.find({ _id: { $in: symbols } }).lean()

    const shaped = insights
      .map(i => ({
        symbol: i._id,
        name: i.name,
        type: i.type,
        summary: i.summary,
        themes: i.themes ?? [],
        sentiment: i.sentiment,
        sources: i.sources ?? [],
        model: i.model,
        generatedAt: i.generatedAt,
        ageHours: +((Date.now() - new Date(i.generatedAt).getTime()) / 3600e3).toFixed(1),
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol))

    // A count per tone across the portfolio. Deliberately not a score: summing
    // sentiments into a number would imply a precision that reading headlines
    // does not have.
    const tally = { positive: 0, negative: 0, mixed: 0, unclear: 0 }
    for (const i of shaped) tally[i.sentiment] = (tally[i.sentiment] ?? 0) + 1

    res.json({
      insights: shaped,
      summary: {
        covered: shaped.length,
        holdings: symbols.length,
        // Named so the page can say which holdings have nothing yet.
        awaiting: symbols.filter(s => !shaped.some(i => i.symbol === s)),
        tally,
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
