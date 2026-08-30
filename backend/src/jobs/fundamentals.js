/**
 * Fetches company fundamentals and stores them, so the browser never talks to a
 * data provider and a page view never costs an API call.
 *
 * Alpha Vantage supplies the statements and ratios; Yahoo supplies related
 * tickers. Both are called from here only — see routes/fundamentals.js for the
 * read path and when a refresh is triggered.
 */

import Fundamentals from '../models/Fundamentals.js'
import { consume } from './rateBudget.js'
import { sectorPeers } from './sp500.js'
import { formatCET } from './marketHours.js'

const AV = 'https://www.alphavantage.co/query'
const YAHOO_PEERS = 'https://query2.finance.yahoo.com/v6/finance/recommendationsbysymbol'

/** How many quarters to keep. Providers return 20 years; nobody reads that. */
const QUARTERS = 8

/** Free tier throttles bursts, so requests are spaced rather than parallel. */
const SPACING_MS = 1500

const log = (...a) => console.log(`[${formatCET()}] fundamentals:`, ...a)

const sleep = ms => new Promise(r => setTimeout(r, ms))

/** Alpha Vantage sends every number as a string, and "None" for absent ones. */
function num(value) {
  if (value == null || value === 'None' || value === '-' || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * One Alpha Vantage call.
 *
 * A throttled response is a 200 carrying an Information/Note field rather than
 * an error status, so the body has to be inspected — treating it as success
 * would cache an empty record for days.
 */
async function alphaVantage(fn, symbol, key) {
  const url = `${AV}?function=${fn}&symbol=${encodeURIComponent(symbol)}&apikey=${key}`
  let lastNotice = null

  // The free tier throttles short bursts and says so in a 200 response. That is
  // temporary and clears within seconds, unlike the daily quota, which repeats
  // the same message all day — so retry a couple of times with a widening gap
  // and give up rather than hammering it.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await consume('alphavantage'))) {
      throw new Error('daily Alpha Vantage budget exhausted')
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!res.ok) throw new Error(`${fn}: HTTP ${res.status}`)

    const body = await res.json()
    const notice = body.Information ?? body.Note ?? body['Error Message']
    if (!notice) return body

    lastNotice = String(notice)
    // A daily-limit notice will not clear by waiting, so stop immediately.
    if (/\b25 requests per day\b|rate limit is 25/i.test(lastNotice)) break
    await sleep(SPACING_MS * (attempt + 2))
  }

  throw new Error(`${fn}: ${lastNotice.slice(0, 120)}`)
}

/** Balance-sheet lines worth showing, in the order they are presented. */
function balanceSheetRow(r) {
  return {
    fiscalDateEnding: r.fiscalDateEnding,
    reportedCurrency: r.reportedCurrency,
    totalAssets: num(r.totalAssets),
    totalCurrentAssets: num(r.totalCurrentAssets),
    cashAndCashEquivalents: num(r.cashAndCashEquivalentsAtCarryingValue),
    inventory: num(r.inventory),
    totalLiabilities: num(r.totalLiabilities),
    totalCurrentLiabilities: num(r.totalCurrentLiabilities),
    longTermDebt: num(r.longTermDebt),
    totalShareholderEquity: num(r.totalShareholderEquity),
    commonStockSharesOutstanding: num(r.commonStockSharesOutstanding),
  }
}

function incomeRow(r) {
  return {
    fiscalDateEnding: r.fiscalDateEnding,
    totalRevenue: num(r.totalRevenue),
    grossProfit: num(r.grossProfit),
    operatingIncome: num(r.operatingIncome),
    netIncome: num(r.netIncome),
    researchAndDevelopment: num(r.researchAndDevelopment),
    ebitda: num(r.ebitda),
  }
}

function earningsRow(r) {
  return {
    fiscalDateEnding: r.fiscalDateEnding,
    reportedDate: r.reportedDate,
    reportedEPS: num(r.reportedEPS),
    estimatedEPS: num(r.estimatedEPS),
    surprise: num(r.surprise),
    surprisePercentage: num(r.surprisePercentage),
  }
}

/**
 * Related tickers from Yahoo. Keyless and cheap, but it answers "what else do
 * people look at", not "what are the competitors" — so the result can carry an
 * unrelated name or two. Presented as related rather than as a peer group.
 */
async function fetchPeers(symbol) {
  if (!(await consume('yahoo'))) return []
  const res = await fetch(`${YAHOO_PEERS}/${encodeURIComponent(symbol)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`peers: HTTP ${res.status}`)
  const body = await res.json()
  const list = body?.finance?.result?.[0]?.recommendedSymbols ?? []
  return list
    .map(r => String(r.symbol).toUpperCase())
    .filter(s => s && s !== symbol.toUpperCase())
    .slice(0, 6)
}

/**
 * Refresh one symbol and store the result.
 *
 * Each upstream is allowed to fail on its own: a company with no earnings
 * history should still get a balance sheet, and an exhausted daily budget
 * should not discard the parts already fetched. What failed is recorded in
 * `sources` so the UI can say so rather than silently showing nothing.
 */
export async function refreshFundamentals(symbol) {
  const ticker = String(symbol).toUpperCase().trim()
  const key = process.env.ALPHA_VANTAGE_API_KEY
  if (!key) throw new Error('ALPHA_VANTAGE_API_KEY is not set')

  const sources = {}
  const doc = { _id: ticker, fetchedAt: new Date() }

  // Peers first, deliberately. Neither source is metered, so when the
  // fundamentals provider is exhausted this still gives the page something real
  // to show rather than an error and nothing else.
  //
  // The index classification is preferred where we have it: it is an actual
  // peer group. Yahoo's list is what other people also viewed, which for a
  // chipmaker has returned a streaming service — fine as a fallback for
  // anything outside the index, misleading as the primary answer.
  try {
    const classified = await sectorPeers(ticker)
    if (classified.length > 0) {
      doc.peers = classified
      doc.peerBasis = 'gics'
      sources.peers = 'ok'
    } else {
      doc.peers = await fetchPeers(ticker)
      doc.peerBasis = 'coviewed'
      sources.peers = 'ok'
    }
  } catch (err) {
    doc.peers = []
    doc.peerBasis = null
    sources.peers = err.message
  }

  try {
    const o = await alphaVantage('OVERVIEW', ticker, key)
    if (!o.Symbol) throw new Error('OVERVIEW: unknown symbol')
    Object.assign(doc, {
      name: o.Name,
      description: o.Description,
      sector: o.Sector,
      industry: o.Industry,
      exchange: o.Exchange,
      currency: o.Currency,
      country: o.Country,
      metrics: {
        peRatio: num(o.PERatio),
        forwardPE: num(o.ForwardPE),
        trailingPE: num(o.TrailingPE),
        pegRatio: num(o.PEGRatio),
        eps: num(o.EPS),
        marketCap: num(o.MarketCapitalization),
        bookValue: num(o.BookValue),
        priceToBook: num(o.PriceToBookRatio),
        priceToSales: num(o.PriceToSalesRatioTTM),
        evToEbitda: num(o.EVToEBITDA),
        profitMargin: num(o.ProfitMargin),
        operatingMargin: num(o.OperatingMarginTTM),
        returnOnEquity: num(o.ReturnOnEquityTTM),
        revenueTTM: num(o.RevenueTTM),
        grossProfitTTM: num(o.GrossProfitTTM),
        dividendYield: num(o.DividendYield),
        beta: num(o.Beta),
        week52High: num(o['52WeekHigh']),
        week52Low: num(o['52WeekLow']),
        analystTargetPrice: num(o.AnalystTargetPrice),
        sharesOutstanding: num(o.SharesOutstanding),
      },
    })
    sources.overview = 'ok'
  } catch (err) {
    sources.overview = err.message
  }

  await sleep(SPACING_MS)
  try {
    const b = await alphaVantage('BALANCE_SHEET', ticker, key)
    doc.balanceSheetQuarterly = (b.quarterlyReports ?? []).slice(0, QUARTERS).map(balanceSheetRow)
    sources.balanceSheet = 'ok'
  } catch (err) {
    sources.balanceSheet = err.message
  }

  await sleep(SPACING_MS)
  try {
    const i = await alphaVantage('INCOME_STATEMENT', ticker, key)
    doc.incomeQuarterly = (i.quarterlyReports ?? []).slice(0, QUARTERS).map(incomeRow)
    sources.income = 'ok'
  } catch (err) {
    sources.income = err.message
  }

  await sleep(SPACING_MS)
  try {
    const e = await alphaVantage('EARNINGS', ticker, key)
    doc.earningsQuarterly = (e.quarterlyEarnings ?? []).slice(0, QUARTERS).map(earningsRow)
    sources.earnings = 'ok'
  } catch (err) {
    sources.earnings = err.message
  }

  doc.sources = sources

  /**
   * A record with no financials is still worth keeping: it carries the peer
   * links and lets the page explain itself. It is marked partial and given a
   * short life so the next visit retries, instead of caching an empty company
   * for the full week a complete record earns.
   */
  doc.partial = sources.overview !== 'ok' && !doc.balanceSheetQuarterly?.length
  if (doc.partial) doc.unavailableReason = sources.overview

  await Fundamentals.findByIdAndUpdate(ticker, doc, { upsert: true, new: true })
  log(`${ticker}${doc.partial ? ' (partial)' : ''}: ${Object.entries(sources).map(([k, v]) => `${k}=${v === 'ok' ? 'ok' : 'fail'}`).join(' ')}`)
  return doc
}

export async function loadFundamentals(symbol) {
  return Fundamentals.findById(String(symbol).toUpperCase().trim()).lean()
}
