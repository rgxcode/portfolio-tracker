import { Router } from 'express'
import auth from '../middleware/auth.js'
import { refreshFundamentals, loadFundamentals } from '../jobs/fundamentals.js'
import { loadSnapshot, STANDARD } from '../jobs/snapshotStore.js'
import { loadFinancials } from '../jobs/edgar.js'

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

/** The live price for this ticker, so the page can show it without a second call. */
async function currentQuote(symbol) {
  const snap = await loadSnapshot(STANDARD)
  if (!snap) return null
  const s = symbol.toUpperCase()
  return snap.stocks?.[s] ?? snap.crypto?.[s] ?? null
}

// GET /api/fundamentals/:symbol
router.get('/:symbol', async (req, res, next) => {
  try {
    const symbol = String(req.params.symbol).toUpperCase().trim()
    if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) {
      return res.status(400).json({ error: 'Invalid symbol' })
    }

    let doc = await loadFundamentals(symbol)
    const age = doc ? Date.now() - new Date(doc.fetchedAt).getTime() : Infinity
    const ttl = doc?.partial ? PARTIAL_TTL_MS : TTL_MS

    if (!doc) {
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
    } else if (age > ttl) {
      // Stale but usable: answer immediately and refresh behind the response,
      // so a quarterly update never makes someone wait.
      refreshOnce(symbol).catch(err => console.error('fundamentals refresh:', err.message))
    }

    const quote = await currentQuote(symbol)

    // EDGAR wins where we have it: same facts, filed at source, far more of them.
    const filings = await loadFinancials(symbol)
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

    res.json({
      ...doc,
      // Earnings-versus-estimate stays with the metered provider: EDGAR carries
      // what was reported, never what was expected.
      ...(statements ?? { financialsSource: 'alphavantage' }),
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
