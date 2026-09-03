import { Router } from 'express'
import PriceHistory from '../models/PriceHistory.js'
import { loadSnapshot, STANDARD, LLM } from '../jobs/snapshotStore.js'
import Coin from '../models/Coin.js'
import { ensureHistory, hasNoHistory } from '../jobs/onDemandHistory.js'
import { refreshIfStale, refresherStatus } from '../agents/llmRefresher.js'

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
 * Reads the snapshot fresh on each request. It is a single small document that
 * the writers replace wholesale, so there is nothing to cache or invalidate.
 */
async function readPrices() {
  const payload = await loadSnapshot(STANDARD)
  if (!payload) {
    const err = new Error('no snapshot')
    err.code = 'ENOENT'
    throw err
  }
  return payload
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

/**
 * Merge in any LLM-written quote that is newer than the scheduled one.
 *
 * Two jobs write prices for the same coins on their own schedules. Which of
 * them happened to run last is an implementation detail, so rather than making
 * the reader choose a source — as a toggle in the UI once did — the freshest
 * observation for each symbol wins.
 */
async function withFreshest(data) {
  const llm = await loadSnapshot(LLM)
  if (!llm?.prices) return data

  const crypto = { ...(data.crypto ?? {}) }
  let merged = 0

  for (const [symbol, quote] of Object.entries(llm.prices)) {
    if (typeof quote?.price !== 'number') continue
    const existing = crypto[symbol]
    const theirs = new Date(quote.asOf ?? llm.updatedAt).getTime()
    const ours = existing ? new Date(existing.asOf ?? 0).getTime() : 0
    if (!(theirs > ours)) continue

    // Keep the logo and name already known: the agent records neither.
    crypto[symbol] = { ...existing, ...quote, image: existing?.image ?? quote.image ?? null }
    merged++
  }

  return merged ? { ...data, crypto } : data
}

// GET /api/prices — everything: crypto, stocks, FX rate, window status
router.get('/', async (_req, res, next) => {
  try {
    const data = await withFreshest(await readPrices())
    res.json({
      ...data,
      ageMinutes: ageMinutes(data.updatedAt),
      stocksAgeMinutes: ageMinutes(data.stocksUpdatedAt),
    })
  } catch (err) {
    handleReadError(err, res, next)
  }
})

// GET /api/prices/llm/status — why the LLM snapshot is or isn't moving.
// Declared before /llm and /:symbol so neither swallows it.
router.get('/llm/status', (_req, res) => {
  res.json(refresherStatus())
})

// GET /api/prices/llm — the LLM agent's view, read off web pages.
// Declared before /:symbol so that route doesn't swallow "llm".
// Shaped like the main snapshot so the frontend can swap between them freely.
router.get('/llm', async (_req, res, next) => {
  try {
    const data = await loadSnapshot(LLM)

    // Fire-and-forget: keeps the snapshot moving while the tab is open without
    // making this request wait for a 10-40s agent run.
    const refreshing = refreshIfStale(data)

    if (!data) {
      return res.status(503).json({
        error: refreshing
          ? 'No LLM price data yet — a first run has just been started.'
          : 'No LLM price data yet — the agent has not run.',
        hint: 'Run: node src/agents/opencodePriceAgent.js --once',
      })
    }
    /**
     * A logo belongs to the coin, not to whichever source priced it. The agent
     * writes prices only, so without this the same Bitcoin showed its logo on
     * one tab and initials on the other.
     */
    const symbols = Object.keys(data.prices ?? {})
    const logos = Object.fromEntries(
      (await Coin.find({ _id: { $in: symbols } }, { image: 1 }).lean())
        .map(c => [c._id, c.image]),
    )
    const crypto = Object.fromEntries(
      Object.entries(data.prices ?? {}).map(([sym, quote]) => [
        sym,
        { ...quote, image: quote.image ?? logos[sym] ?? null },
      ]),
    )

    res.json({
      ...data,
      ageMinutes: ageMinutes(data.updatedAt),
      // The LLM agent only covers crypto; keep the key so clients can treat
      // both sources identically.
      crypto,
      stocks: {},
    })
  } catch (err) {
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
    case '3Y': return now - 3 * 365 * 86400e3
    case '5Y': return now - 5 * 365 * 86400e3
    case 'ALL': return 0
    // An unrecognised period used to fall through to one day, so asking for 5Y
    // returned a single session and looked like missing history rather than an
    // unsupported range. A month is a harmless answer to a question we did not
    // understand; the supported set is echoed back so a caller can tell.
    default: return now - 30 * 86400e3
  }
}

/** Periods this endpoint understands, surfaced so clients need not guess. */
const PERIODS = ['1H', '1D', '1W', '1M', 'YTD', '1Y', '3Y', '5Y', 'ALL']

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

/**
 * The key a holding's series is stored under.
 *
 * Everything that trades is keyed by its ticker, but a cash balance is held in
 * a currency, and a currency code is not a ticker. They overlap: INR is the
 * Indian rupee to someone holding cash and Infinity Natural Resources to the
 * NYSE, and reading one for the other valued a 420,000 rupee balance at 420,000
 * times a $15 share price — a portfolio of $73k charted at $6.7m. Currencies
 * therefore live under their own prefix, where no ticker can reach them.
 */
function seriesKey(symbol, type) {
  return type === 'cash' ? `FX:${symbol}` : symbol
}

// GET /api/prices/:symbol/history?period=1M&type=stock — chart series from our own store
router.get('/:symbol/history', async (req, res, next) => {
  try {
    const requested = req.params.symbol.toUpperCase()
    const type = String(req.query.type ?? '').toLowerCase()
    const symbol = seriesKey(requested, type)
    const period = req.query.period ?? '1D'
    const cutoff = new Date(periodCutoff(period))

    const query = () => PriceHistory.find(
      { symbol, ts: { $gte: cutoff } },
      { _id: 0, ts: 1, price: 1 },
    ).sort({ ts: 1 }).lean()

    let rows = await query()

    /**
     * Nothing stored at all: a company we have simply never charted. Fetch it
     * once, then serve it from our own store like everything else.
     *
     * Equities only. The backfill resolves a symbol against `listings`, which
     * is a table of tickers, so pointing it at a coin, a metal or a currency
     * can only ever return somebody else's company — and it did. A caller that
     * names no type is charting a ticker, which is what the asset page does.
     */
    if (rows.length === 0 && (type === '' || type === 'stock') && await hasNoHistory(symbol)) {
      if (await ensureHistory(symbol)) rows = await query()
    }

    const points = downsample(rows.map(r => ({ timestamp: r.ts.getTime(), price: r.price })))

    /**
     * A closed market is not missing data.
     *
     * Over a weekend a 1D window contains no stock prices at all, and an empty
     * series rendered as "no price history available" — which reads as a broken
     * feed rather than a shut exchange. The last close still describes the
     * position for the whole window, so carry it forward: one point at the start
     * of the range and one at the end draws the flat line that is the truth.
     */
    let carried = false
    if (points.length < 2) {
      const previous = await PriceHistory.findOne(
        { symbol, ts: { $lt: cutoff } },
        { _id: 0, ts: 1, price: 1 },
      )
        .sort({ ts: -1 })
        .lean()

      if (previous) {
        const price = points[0]?.price ?? previous.price
        // Keep any real point in the window; the flat line spans the rest.
        const flat = [
          { timestamp: cutoff.getTime(), price: previous.price },
          ...points,
          { timestamp: Date.now(), price },
        ]
        points.length = 0
        points.push(...flat)
        carried = true
      }
    }

    res.json({
      // What was asked for; `series` is where it is actually stored, which for
      // cash is not the same string.
      symbol: requested,
      series: symbol,
      period,
      supportedPeriods: PERIODS,
      count: points.length,
      // Charts get a series that came entirely from data we collected.
      source: 'local-history',
      // True when the window held no new prices and the last close was carried
      // across it, so the client can label a flat line rather than imply
      // movement that did not happen.
      carriedForward: carried,
      lastObservedAt: carried ? rows[rows.length - 1]?.ts ?? null : null,
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
    const entry = data.crypto?.[symbol] ?? data.stocks?.[symbol] ?? data.commodities?.[symbol]
    if (!entry) return res.status(404).json({ error: `No price for ${symbol}` })
    res.json({ ...entry, ageMinutes: ageMinutes(entry.asOf) })
  } catch (err) {
    handleReadError(err, res, next)
  }
})

export default router
