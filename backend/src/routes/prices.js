import { Router } from 'express'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import PriceHistory from '../models/PriceHistory.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PRICES_FILE = resolve(__dirname, '..', '..', 'data', 'prices.json')
/** Written by the LLM agent (src/agents/opencodePriceAgent.js) — a second, independent view. */
const LLM_PRICES_FILE = resolve(__dirname, '..', '..', 'data', 'opencode-prices.json')

const router = Router()

// Prices are public market data — no auth, unlike /api/assets.

// These files are rewritten every few seconds. Without an explicit directive a
// browser may heuristically cache a GET with no Cache-Control, which would
// freeze a polling dashboard on a stale snapshot.
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

/**
 * Reads prices.json fresh on each request. The file is tiny and rewritten
 * atomically by the fetch job, so there is nothing to cache or invalidate.
 */
async function readPrices() {
  return JSON.parse(await readFile(PRICES_FILE, 'utf-8'))
}

/** Minutes since a timestamp — lets clients spot a stalled job. */
function ageMinutes(iso) {
  if (!iso) return null
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000)
}

function handleReadError(err, res, next) {
  if (err.code === 'ENOENT') {
    return res.status(503).json({
      error: 'Price data not available yet — the fetch job has not run.',
      hint: 'Run: node src/jobs/fetchPrices.js',
    })
  }
  next(err)
}

// GET /api/prices — everything: crypto, stocks, FX rate, window status
router.get('/', async (_req, res, next) => {
  try {
    const data = await readPrices()
    res.json({
      ...data,
      ageMinutes: ageMinutes(data.updatedAt),
      stocksAgeMinutes: ageMinutes(data.stocksUpdatedAt),
    })
  } catch (err) {
    handleReadError(err, res, next)
  }
})

// GET /api/prices/llm — the LLM agent's view, read off web pages.
// Declared before /:symbol so that route doesn't swallow "llm".
// Shaped like the main snapshot so the frontend can swap between them freely.
router.get('/llm', async (_req, res, next) => {
  try {
    const raw = await readFile(LLM_PRICES_FILE, 'utf-8')
    const data = JSON.parse(raw)
    res.json({
      ...data,
      ageMinutes: ageMinutes(data.updatedAt),
      // The LLM agent only covers crypto; keep the key so clients can treat
      // both sources identically.
      crypto: data.prices,
      stocks: {},
    })
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(503).json({
        error: 'No LLM price data yet — the agent has not run.',
        hint: 'Run: node src/agents/opencodePriceAgent.js --once',
      })
    }
    next(err)
  }
})

/** Start of the window for each chart period, in epoch ms. */
function periodCutoff(period) {
  const now = Date.now()
  switch (String(period).toUpperCase()) {
    case '1H': return now - 3600e3
    case '1D': return now - 86400e3
    case '1W': return now - 7 * 86400e3
    case '1M': return now - 30 * 86400e3
    case 'YTD': return new Date(new Date().getFullYear(), 0, 1).getTime()
    case '1Y': return now - 365 * 86400e3
    case 'ALL': return 0
    default: return now - 86400e3
  }
}

/**
 * Evenly thin a series to at most `max` points. A chart a few hundred pixels
 * wide gains nothing from ten thousand points, and the payload shrinks a lot.
 * The most recent point is always kept so the line ends at the current price.
 */
function downsample(points, max = 500) {
  if (points.length <= max) return points
  const step = points.length / max
  const out = []
  for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)])
  const last = points[points.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

// GET /api/prices/:symbol/history?period=1M — chart series from our own store
router.get('/:symbol/history', async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase()
    const period = req.query.period ?? '1D'
    const cutoff = new Date(periodCutoff(period))

    const rows = await PriceHistory.find(
      { symbol, ts: { $gte: cutoff } },
      { _id: 0, ts: 1, price: 1 },
    )
      .sort({ ts: 1 })
      .lean()

    const points = downsample(rows.map(r => ({ timestamp: r.ts.getTime(), price: r.price })))

    res.json({
      symbol,
      period,
      count: points.length,
      // Charts get a series that came entirely from data we collected.
      source: 'local-history',
      points,
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/prices/:symbol — one asset, looked up in both sections
router.get('/:symbol', async (req, res, next) => {
  try {
    const data = await readPrices()
    const symbol = req.params.symbol.toUpperCase()
    const entry = data.crypto?.[symbol] ?? data.stocks?.[symbol]
    if (!entry) return res.status(404).json({ error: `No price for ${symbol}` })
    res.json({ ...entry, ageMinutes: ageMinutes(entry.asOf) })
  } catch (err) {
    handleReadError(err, res, next)
  }
})

export default router
