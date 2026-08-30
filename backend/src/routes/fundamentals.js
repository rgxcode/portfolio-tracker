import { Router } from 'express'
import auth from '../middleware/auth.js'
import { refreshFundamentals, loadFundamentals } from '../jobs/fundamentals.js'
import { loadSnapshot, STANDARD } from '../jobs/snapshotStore.js'
import { loadFinancials } from '../jobs/edgar.js'
import Constituent from '../models/Constituent.js'
import PriceHistory from '../models/PriceHistory.js'
import Coin from '../models/Coin.js'
import { formatCET } from '../jobs/marketHours.js'
import { computeMetrics, priceRange52w, PROVIDER_ONLY } from '../jobs/metrics.js'

const router = Router()

/**
 * Authenticated, unlike /api/prices.
 *
 * Prices are served from a snapshot that costs nothing to read, but a miss here
 * spends four of the day's twenty-five upstream requests. Leaving that open to
 * anonymous callers would let a stranger exhaust the budget for everyone.
 */
router.use(auth)

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

/**
 * Statements change once a quarter, so a week-old record is still correct. The
 * ratios that move daily are recomputed from the live price below instead of
 * being re-fetched.
 */
const TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * A partial record (financials unavailable, usually the daily quota) is retried
 * far sooner — it is a temporary gap, not a week-old truth.
 */
const PARTIAL_TTL_MS = 30 * 60 * 1000

/**
 * Symbols currently being fetched. A first view takes several seconds, and
 * without this a page that fires two requests, or an impatient reload, would
 * spend the budget twice on the same ticker.
 */
const inFlight = new Map()

function refreshOnce(symbol) {
  const key = symbol.toUpperCase()
  if (inFlight.has(key)) return inFlight.get(key)

  const p = refreshFundamentals(key).finally(() => inFlight.delete(key))
  inFlight.set(key, p)
  return p
}

/**
 * Reshape EDGAR's quarters into the same field names the metered provider uses.
 *
 * The page already renders that shape, and EDGAR is the better source of the
 * same facts — deeper history, filed rather than resold. Normalising here means
 * the page gets seventeen years instead of eight quarters without knowing where
 * the numbers came from.
 */
function fromEdgar(quarters) {
  return {
    income: quarters
      .filter(q => q.revenue != null || q.netIncome != null)
      .map(q => ({
        fiscalDateEnding: q.end,
        totalRevenue: q.revenue ?? null,
        grossProfit: q.grossProfit ?? null,
        operatingIncome: q.operatingIncome ?? null,
        netIncome: q.netIncome ?? null,
        researchAndDevelopment: q.researchAndDevelopment ?? null,
        // True where the company never filed the quarter alone and it was
        // computed as the year minus the three that were filed.
        derived: q.derived === true,
      })),
    balance: quarters
      .filter(q => q.assets != null || q.equity != null)
      .map(q => ({
        fiscalDateEnding: q.end,
        totalAssets: q.assets ?? null,
        totalLiabilities: q.liabilities ?? null,
        totalShareholderEquity: q.equity ?? null,
        cashAndCashEquivalents: q.cash ?? null,
        totalCurrentAssets: null,
        totalCurrentLiabilities: null,
        longTermDebt: null,
      })),
  }
}

/**
 * The current price for this ticker, so the page can show it without a second
 * call — and so market cap and every price-based ratio can be computed.
 *
 * The live snapshot only covers held assets, because refreshing all 500 members
 * every five minutes would be six figures of requests a day. For everything else
 * the most recent stored close is the right answer: it is a real observed price,
 * just not a live one, and without it market cap came back empty for every
 * company nobody happened to own.
 */
async function currentQuote(symbol) {
  const s = symbol.toUpperCase()

  const snap = await loadSnapshot(STANDARD)
  const live = snap?.stocks?.[s] ?? snap?.crypto?.[s] ?? null
  if (live) return live

  const last = await PriceHistory.findOne({ symbol: s }, { _id: 0, ts: 1, price: 1 })
    .sort({ ts: -1 })
    .lean()
  if (!last) return null

  return {
    symbol: s,
    price: last.price,
    asOf: last.ts,
    asOfCET: formatCET(last.ts),
    // Said plainly rather than dressed up as a live quote.
    source: 'last-stored-close',
    stale: true,
  }
}

/**
 * GET /api/fundamentals/search?q= — ticker or company-name lookup.
 *
 * Declared before /:symbol so that route does not treat "search" as a ticker.
 * Backed by the stored index membership, so it costs nothing and works whether
 * or not the metered provider has anything left.
 */
router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim()
    if (q.length < 1) return res.json({ results: [] })

    // Escape the input: a stray "(" from a company name would otherwise throw,
    // and a "." would quietly match any character.
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const starts = new RegExp('^' + safe, 'i')
    const contains = new RegExp(safe, 'i')

    // Crypto is searched alongside equities: the add-asset form uses this, and
    // a lookup that only knew about shares was why adding a coin meant typing
    // its name by hand and hoping the app recognised the ticker.
    const [exact, byPrefix, byName, coinExact, coinPrefix, coinName] = await Promise.all([
      Constituent.find({ _id: q.toUpperCase() }, { name: 1, sector: 1 }).lean(),
      Constituent.find({ _id: starts }, { name: 1, sector: 1 }).limit(10).lean(),
      Constituent.find({ name: contains }, { name: 1, sector: 1 }).limit(10).lean(),
      Coin.find({ _id: q.toUpperCase() }, { name: 1, rank: 1 }).lean(),
      Coin.find({ _id: starts }, { name: 1, rank: 1 }).limit(10).lean(),
      Coin.find({ name: contains }, { name: 1, rank: 1 }).limit(10).lean(),
    ])

    const shapeStock = d => ({ symbol: d._id, name: d.name, sector: d.sector, type: 'stock' })
    const shapeCoin = d => ({ symbol: d._id, name: d.name, sector: 'Crypto', type: 'crypto' })

    // Exact ticker matches first, then prefixes, then names — the order someone
    // typing "NV" expects. Crypto interleaves at each tier rather than being
    // relegated below every equity.
    const seen = new Set()
    const results = []
    const tiers = [
      [...exact.map(shapeStock), ...coinExact.map(shapeCoin)],
      [...byPrefix.map(shapeStock), ...coinPrefix.map(shapeCoin)],
      [...byName.map(shapeStock), ...coinName.map(shapeCoin)],
    ]
    for (const tier of tiers) {
      for (const doc of tier) {
        if (seen.has(doc.symbol)) continue
        seen.add(doc.symbol)
        results.push(doc)
        if (results.length >= 8) break
      }
      if (results.length >= 8) break
    }

    res.json({ results })
  } catch (err) {
    next(err)
  }
})

// GET /api/fundamentals/:symbol
router.get('/:symbol', async (req, res, next) => {
  try {
    const symbol = String(req.params.symbol).toUpperCase().trim()
    if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) {
      return res.status(400).json({ error: 'Invalid symbol' })
    }

    // Filings first: they cover every ratio that looks backwards, cost nothing,
    // and decide whether the metered provider needs troubling at all.
    const filings = await loadFinancials(symbol)
    const quote = await currentQuote(symbol)

    let doc = await loadFundamentals(symbol)
    const age = doc ? Date.now() - new Date(doc.fetchedAt).getTime() : Infinity
    const ttl = doc?.partial ? PARTIAL_TTL_MS : TTL_MS

    /**
     * Only spend a request when filings cannot answer.
     *
     * With reported financials and our own prices, everything except the
     * forward-looking fields is arithmetic. Fetching anyway would burn a daily
     * budget of 25 across all users on figures we can derive for free — which
     * was the app's real ceiling.
     */
    const canCompute = Boolean(filings?.quarters?.length)

    if (!doc && canCompute) {
      // Nothing stored and nothing to ask for: serve the computed view.
      doc = {
        _id: symbol,
        metrics: {},
        fetchedAt: new Date(),
        balanceSheetQuarterly: [],
        incomeQuarterly: [],
        earningsQuarterly: [],
        peers: [],
      }
    } else if (!doc) {
      // Nothing stored: the caller has to wait, since there is nothing to show.
      try {
        await refreshOnce(symbol)
        doc = await loadFundamentals(symbol)
      } catch (err) {
        // Only reached when even the keyless sources failed, so there is
        // genuinely nothing to render. 503 rather than 502: the upstream is
        // rate-limiting us, and it will work again later.
        return res.status(503).json({
          error: 'Could not load anything for this symbol right now.',
          detail: err.message,
        })
      }
    } else if (age > ttl && !canCompute) {
      // Stale but usable: answer immediately and refresh behind the response,
      // so a quarterly update never makes someone wait.
      refreshOnce(symbol).catch(err => console.error('fundamentals refresh:', err.message))
    }

    // EDGAR wins where we have it: same facts, filed at source, far more of them.
    let statements = null
    if (filings?.quarters?.length) {
      const shaped = fromEdgar(filings.quarters)
      if (shaped.income.length > 0) {
        statements = {
          financialsSource: 'edgar',
          entityName: filings.entityName,
          filingsFetchedAt: filings.fetchedAt,
          incomeQuarterly: shaped.income,
          balanceSheetQuarterly: shaped.balance.length ? shaped.balance : doc.balanceSheetQuarterly,
        }
      }
    }

    /**
     * Identity can come from three places and the metered provider is only one
     * of them. When its quota is spent the company still has a name — the index
     * membership and the SEC filing both carry one — and showing "Unknown
     * company" for NVIDIA while rendering its financials is nonsense.
     */
    const member = await Constituent.findById(symbol).lean()
    const identity = {
      name: doc.name || member?.name || filings?.entityName || null,
      sector: doc.sector || member?.sector || null,
      industry: doc.industry || member?.subIndustry || null,
    }

    /**
     * Two independent things can be missing, and conflating them produced a
     * page that said statements were unavailable directly above the statements.
     * Ratios come from the metered provider; statements come from EDGAR.
     */
    /**
     * Computed ratios win over fetched ones: they are derived from filings and
     * the current price, so they cannot go stale the way a value cached for a
     * week does. The provider keeps only the fields nothing filed can supply.
     */
    const computed = computeMetrics(
      filings?.quarters ?? [],
      quote?.price ?? null,
      filings?.sharesOutstanding ?? null,
    )
    const range = canCompute ? await priceRange52w(symbol) : {}

    const providerMetrics = {}
    for (const k of PROVIDER_ONLY) {
      if (doc.metrics?.[k] != null) providerMetrics[k] = doc.metrics[k]
    }

    const metrics = { ...doc.metrics, ...computed, ...range, ...providerMetrics }

    const statementsAvailable = Boolean(
      statements || doc.incomeQuarterly?.length || doc.balanceSheetQuarterly?.length,
    )
    const metricsAvailable = Object.values(metrics).some(v => v != null)

    res.json({
      ...doc,
      metrics,
      // So the page can say where a number came from rather than implying one
      // source for all of them.
      metricsSource: canCompute ? 'computed' : 'alphavantage',
      // Earnings-versus-estimate stays with the metered provider: EDGAR carries
      // what was reported, never what was expected.
      ...(statements ?? { financialsSource: 'alphavantage' }),
      ...identity,
      statementsAvailable,
      metricsAvailable,
      symbol: doc._id,
      ageHours: +(((Date.now() - new Date(doc.fetchedAt).getTime()) / 3600e3)).toFixed(1),
      quote,
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/fundamentals/:symbol/refresh — force a refresh, ignoring the TTL.
router.post('/:symbol/refresh', async (req, res, next) => {
  try {
    const symbol = String(req.params.symbol).toUpperCase().trim()
    await refreshOnce(symbol)
    const doc = await loadFundamentals(symbol)
    res.json({ ...doc, symbol: doc._id, ageHours: 0 })
  } catch (err) {
    if (/budget|HTTP|unknown symbol|no data/.test(err.message)) {
      return res.status(502).json({ error: err.message })
    }
    next(err)
  }
})

export default router
