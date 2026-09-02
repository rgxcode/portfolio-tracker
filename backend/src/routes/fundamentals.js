import { Router } from 'express'
import auth from '../middleware/auth.js'
import { refreshFundamentals, loadFundamentals } from '../jobs/fundamentals.js'
import { loadSnapshot, STANDARD } from '../jobs/snapshotStore.js'
import { loadFinancials, refreshFinancials } from '../jobs/edgar.js'
import Constituent from '../models/Constituent.js'
import PriceHistory from '../models/PriceHistory.js'
import Coin from '../models/Coin.js'
import { COMMODITIES } from '../jobs/commodities.js'
import Listing from '../models/Listing.js'
import { cikFor } from '../jobs/listings.js'
import { ensureHistory, hasNoHistory } from '../jobs/onDemandHistory.js'
import { consume } from '../jobs/rateBudget.js'
import { fetchStockPrices } from '../jobs/stocks.js'
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

/**
 * Instruments Yahoo knows about that our own universe does not — chiefly
 * listings outside the US.
 *
 * The symbol carries its exchange as a suffix (VVSM.DE for Xetra), which is
 * also how prices are fetched, so what is stored is exactly what can be
 * priced. That matters more than it looks: the same fund trades on a dozen
 * European venues at genuinely different prices, and VVSM.F is a different
 * line from VVSM.DE, not the same one seen from elsewhere.
 */
async function searchYahoo(q) {
  const url = `https://query2.finance.yahoo.com/v1/finance/search`
    + `?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`yahoo search HTTP ${res.status}`)

  const quotes = (await res.json())?.quotes ?? []
  return quotes
    // Tradeable lines only: an index or a currency pair is not something
    // anyone can hold, and offering one invites a holding that never prices.
    .filter(x => ['EQUITY', 'ETF', 'MUTUALFUND'].includes(x.quoteType))
    .filter(x => typeof x.symbol === 'string' && x.symbol.length <= 24)
    .map(x => ({
      symbol: x.symbol.toUpperCase(),
      name: x.shortname || x.longname || x.symbol,
      sector: x.quoteType === 'ETF' ? 'ETF' : null,
      type: 'stock',
      isEtf: x.quoteType === 'ETF',
      /** Where it trades, so two listings of one fund can be told apart. */
      exchange: x.exchDisp || x.exchange || null,
      foreign: true,
    }))
}

/**
 * GET /api/fundamentals/quote/:symbol — what this line costs right now.
 *
 * The add form needs it for one reason: a European listing is quoted in its own
 * currency, and someone entering what they paid for VVSM.DE is thinking in
 * euros. Without knowing that, the figure would be stored as dollars and the
 * holding would show a cost basis that was never true.
 *
 * Live rather than from the snapshot, because the snapshot only covers what
 * someone already holds — and this is asked precisely when they do not yet.
 */
router.get('/quote/:symbol', async (req, res, next) => {
  try {
    const symbol = String(req.params.symbol ?? '').toUpperCase().trim()
    if (!symbol) return res.status(400).json({ error: 'A symbol is required' })

    const snap = await loadSnapshot(STANDARD)
    const rates = snap?.fxRates ?? null

    const [quote] = Object.values(
      await fetchStockPrices([symbol], { fxRates: rates, budget: 'yahooSearch' }),
    )
    if (!quote) return res.status(404).json({ error: `No price found for ${symbol}` })

    res.json({
      symbol,
      /** Always dollars — what the app stores and totals in. */
      price: +quote.price.toFixed(6),
      /** What the exchange actually quoted, when that is not dollars. */
      quoteCurrency: quote.quoteCurrency ?? 'USD',
      quotePrice: +(quote.quotePrice ?? quote.price).toFixed(6),
      exchange: quote.exchange ?? null,
      asOf: quote.asOf ?? null,
    })
  } catch (err) {
    next(err)
  }
})

router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').trim()
    if (q.length < 1) return res.json({ results: [] })

    /**
     * Optional filter. The add-asset form already knows whether the user is
     * entering a share or a coin, so offering both was noise — typing "CRO"
     * under Crypto returned three equities above the coin.
     */
    const only = String(req.query.type ?? '').toLowerCase()
    const wantStocks = only === '' || only === 'stock'
    const wantCrypto = only === '' || only === 'crypto'
    const wantCommodities = only === '' || only === 'commodity'

    // Escape the input: a stray "(" from a company name would otherwise throw,
    // and a "." would quietly match any character.
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const starts = new RegExp('^' + safe, 'i')
    const contains = new RegExp(safe, 'i')

    // Crypto is searched alongside equities: the add-asset form uses this, and
    // a lookup that only knew about shares was why adding a coin meant typing
    // its name by hand and hoping the app recognised the ticker.
    const none = Promise.resolve([])
    /**
     * Index members are searched first and separately, so a familiar company
     * outranks an obscure one that happens to share a prefix. The wider file
     * then fills in everything else — scoping search to the index was why MP
     * Materials and SoFi could not be found at all.
     */
    const [exact, byPrefix, byName, coinExact, coinPrefix, coinName, listExact, listPrefix, listName] = await Promise.all([
      wantStocks ? Constituent.find({ _id: q.toUpperCase() }, { name: 1, sector: 1 }).lean() : none,
      wantStocks ? Constituent.find({ _id: starts }, { name: 1, sector: 1 }).limit(10).lean() : none,
      wantStocks ? Constituent.find({ name: contains }, { name: 1, sector: 1 }).limit(10).lean() : none,
      wantCrypto ? Coin.find({ _id: q.toUpperCase() }, { name: 1, rank: 1, image: 1 }).lean() : none,
      wantCrypto ? Coin.find({ _id: starts }, { name: 1, rank: 1, image: 1 }).limit(10).lean() : none,
      wantCrypto ? Coin.find({ name: contains }, { name: 1, rank: 1, image: 1 }).limit(10).lean() : none,
      wantStocks ? Listing.find({ _id: q.toUpperCase() }, { name: 1, isEtf: 1 }).lean() : none,
      wantStocks ? Listing.find({ _id: starts }, { name: 1, inIndex: 1, isEtf: 1 }).limit(12).lean() : none,
      wantStocks ? Listing.find({ name: contains }, { name: 1, inIndex: 1, isEtf: 1 }).limit(12).lean() : none,
    ])

    const shapeStock = d => ({ symbol: d._id, name: d.name, sector: d.sector, type: 'stock' })
    /**
     * A fund is added and priced exactly like a share — same Yahoo quote, same
     * maths — so it keeps `type: 'stock'` rather than becoming a fourth kind of
     * asset. `isEtf` is carried alongside purely so the form can label it: a
     * list where SOXX and NVDA look identical hides the difference that
     * matters when choosing between them.
     */
    const shapeListed = d => ({
      symbol: d._id,
      name: d.name,
      sector: d.isEtf ? 'ETF' : null,
      type: 'stock',
      isEtf: Boolean(d.isEtf),
    })
    const shapeCoin = d => ({ symbol: d._id, name: d.name, sector: 'Crypto', type: 'crypto', image: d.image ?? null })

    // Exact ticker matches first, then prefixes, then names — the order someone
    // typing "NV" expects. Crypto interleaves at each tier rather than being
    // relegated below every equity.
    // A fixed handful, so matching them in memory is simpler than a collection.
    const commodityHits = wantCommodities
      ? Object.entries(COMMODITIES)
        .filter(([sym, m]) => starts.test(sym) || contains.test(m.name))
        .map(([sym, m]) => ({ symbol: sym, name: m.name, sector: 'Commodities', type: 'commodity' }))
      : []

    const seen = new Set()
    const results = []
    const tiers = [
      [...exact.map(shapeStock), ...coinExact.map(shapeCoin), ...commodityHits, ...listExact.map(shapeListed)],
      [...byPrefix.map(shapeStock), ...coinPrefix.map(shapeCoin)],
      [...byName.map(shapeStock), ...coinName.map(shapeCoin)],
      // Everything else on a US exchange, after the recognisable names.
      [...listPrefix.map(shapeListed), ...listName.map(shapeListed)],
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

    // Nothing here knows about listings outside the US: the SEC and Nasdaq
    // files cover US exchanges only, so a European line like the VanEck
    // Semiconductor UCITS ETF simply is not in the universe. Yahoo's own
    // search does know, so it fills in when we come up short — one request,
    // only when the local answer is thin, and only after the local answer has
    // had its say, so a familiar US ticker is never pushed down the list by a
    // foreign line that merely matches.
    if (results.length < 5 && q.length >= 2 && await consume('yahooSearch')) {
      try {
        const foreign = await searchYahoo(q)
        for (const f of foreign) {
          if (seen.has(f.symbol)) continue
          seen.add(f.symbol)
          results.push(f)
          if (results.length >= 8) break
        }
      } catch {
        // The local answer stands. A lookup that cannot reach Yahoo should
        // return what it has rather than fail the whole search.
      }
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

    /**
     * Decide what the symbol is before looking anything up for it.
     *
     * This used to resolve the ticker against the SEC file first: GOLD matched
     * "Gold.com, Inc." and the page presented that company's revenue as the
     * gold price's fundamentals. A commodity is not a company, and a ticker
     * collision must not be allowed to imply otherwise.
     */
    const metalMeta = COMMODITIES[symbol] ?? null
    const coinMeta = metalMeta ? null : await Coin.findById(symbol).lean()
    const isCompany = !metalMeta && !coinMeta

    // Filings cover every ratio that looks backwards and cost nothing, but only
    // a company has any.
    let filings = isCompany ? await loadFinancials(symbol) : null

    // A market cap needs a price. Without this the first view of a newly
    // searched company showed statements and no ratios, which reads as broken
    // rather than as not-yet-fetched.
    if (await hasNoHistory(symbol)) await ensureHistory(symbol)
    const quote = await currentQuote(symbol)

    /**
     * Fetch on first view rather than pre-loading ten thousand companies.
     *
     * EDGAR is unmetered, so this costs a few seconds once and is then cached
     * like any other. Pre-loading the whole universe would take hundreds of
     * megabytes to serve companies nobody looks at.
     */
    if (isCompany && !filings) {
      const cik = await cikFor(symbol)
      if (cik) {
        try {
          await refreshFinancials(symbol, cik)
          filings = await loadFinancials(symbol)
        } catch {
          // A company with no usable XBRL still gets its price and its name.
        }
      }
    }

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
    const member = isCompany ? await Constituent.findById(symbol).lean() : null
    const coin = coinMeta
    const listed = isCompany && !member ? await Listing.findById(symbol).lean() : null
    const metal = metalMeta

    /**
     * What kind of thing this is, so the page can stop describing a coin as a
     * company. A cryptocurrency has no income statement and no P/E; reporting
     * those as "unavailable" implies they are missing rather than inapplicable.
     */
    const kind = metal ? 'commodity' : coin ? 'crypto' : 'stock'

    const identity = {
      kind,
      name: doc.name || member?.name || coin?.name || metal?.name || listed?.name || filings?.entityName || null,
      sector: doc.sector || member?.sector || (coin ? 'Cryptocurrency' : metal ? 'Commodity' : null),
      industry: doc.industry || member?.subIndustry || (metal ? `Priced per ${metal.unit}` : null),
      logo: coin?.image ?? null,
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
    // Only a company can be missing financials; a coin simply does not file any.
    const statementsExpected = kind === 'stock'
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
      statementsAvailable: isCompany && statementsAvailable,
      statementsExpected,
      // A metal has no peer group, and a ticker collision would otherwise
      // hand it the mining companies that share its name.
      peers: isCompany ? doc.peers ?? [] : [],
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
