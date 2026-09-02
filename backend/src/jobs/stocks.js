/**
 * Stock price fetching.
 *
 * Which symbols: whatever users actually hold, read from the assets collection,
 * so the job never spends requests on tickers nobody owns.
 *
 * Where from: Yahoo's chart endpoint is primary — no API key, and it returns
 * `regularMarketTime`, the exchange timestamp of the price itself rather than
 * the moment we happened to ask. Alpha Vantage is the fallback, kept on a tight
 * daily budget because its free tier allows only 25 requests per day.
 *
 * Batch quotes are not available (Yahoo's v7 endpoint requires a session crumb),
 * so it is one request per symbol, staggered.
 */

import mongoose from 'mongoose'
import { consume, remaining } from './rateBudget.js'

const YAHOO_URL = 'https://query1.finance.yahoo.com/v8/finance/chart'
const ALPHA_VANTAGE_URL = 'https://www.alphavantage.co/query'
const TIMEOUT_MS = 20000
const STAGGER_MS = 1500 // space out per-symbol requests

/** Tracked when the database has no stock holdings yet. */
const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'AMD', 'GOOGL']

const delay = ms => new Promise(r => setTimeout(r, ms))

async function getJson(url, headers = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0', ...headers },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Distinct stock symbols held by any user. Falls back to a default list if the
 * database is unreachable, so a Mongo outage doesn't silently stop price updates.
 */
export async function resolveStockSymbols(log = console.log) {
  try {
    const symbols = await mongoose.connection
      .collection('assets')
      .distinct('symbol', { type: 'stock' })

    const cleaned = [...new Set(symbols.map(s => String(s).toUpperCase().trim()))].filter(Boolean)
    if (cleaned.length === 0) {
      log('No stock holdings in database — using default watchlist.')
      return DEFAULT_SYMBOLS
    }
    return cleaned
  } catch (err) {
    log(`Could not read symbols from database (${err.message}) — using defaults.`)
    return DEFAULT_SYMBOLS
  }
}

/** Yahoo: price plus the exchange timestamp that price belongs to. */
async function fetchFromYahoo(symbol, budget = 'yahoo') {
  if (!await consume(budget)) throw new Error(`daily ${budget} budget exhausted`)

  const url = `${YAHOO_URL}/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  const data = await getJson(url)
  const meta = data?.chart?.result?.[0]?.meta
  if (!meta || typeof meta.regularMarketPrice !== 'number') {
    throw new Error('no price in Yahoo response')
  }

  const price = meta.regularMarketPrice
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null
  return {
    price,
    change24h: prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
    // The instant the exchange last traded this price, not our fetch time.
    asOf: meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString(),
    currency: meta.currency ?? 'USD',
    exchange: meta.fullExchangeName ?? null,
    source: 'yahoo',
  }
}

/** Alpha Vantage fallback — only reached if Yahoo fails, and only while budget remains. */
async function fetchFromAlphaVantage(symbol, apiKey) {
  if (!apiKey) throw new Error('no Alpha Vantage key configured')
  if (!await consume('alphavantage')) throw new Error('daily Alpha Vantage budget exhausted')

  const url = `${ALPHA_VANTAGE_URL}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`
  const data = await getJson(url)
  const quote = data?.['Global Quote']
  if (!quote?.['05. price']) throw new Error('no price in Alpha Vantage response (rate limited?)')

  return {
    price: parseFloat(quote['05. price']),
    change24h: parseFloat((quote['10. change percent'] ?? '0%').replace('%', '')),
    // Alpha Vantage only gives a trading day, not a time — mark it as the close.
    asOf: new Date(`${quote['07. latest trading day']}T21:00:00Z`).toISOString(),
    currency: 'USD',
    exchange: null,
    source: 'alphavantage',
  }
}

/**
 * Fetch every symbol, staggered. A per-symbol failure is contained: that symbol
 * keeps its previous value and the rest still update.
 */
/**
 * Convert a quote into US dollars, the currency every stored price is in.
 *
 * A European listing is quoted in euros or pence, and until now that number was
 * stored as though it were dollars — a EUR 88 fund appeared in the book as $88.
 * The quote's own currency is what decides, not the symbol's suffix, because
 * London quotes some lines in pounds and others in pence on the same exchange.
 *
 * Without a rate the quote is dropped rather than stored: a price in the wrong
 * currency is worse than a missing one, because nothing downstream can tell it
 * is wrong.
 */
function toUsd(quote, rates, log) {
  const code = String(quote.currency ?? 'USD').toUpperCase()
  if (code === 'USD') return quote

  // GBp/ILA/ZAc are minor units — a hundredth of the currency they belong to.
  const MINOR = { GBP: ['GBX', 'GBP:MINOR'], ILS: ['ILA'], ZAR: ['ZAC'] }
  let major = code
  let divisor = 1
  for (const [parent, minors] of Object.entries(MINOR)) {
    if (minors.includes(code) || code === `${parent}X`) {
      major = parent
      divisor = 100
      break
    }
  }

  const rate = rates?.[major]
  if (!rate || !(rate > 0)) {
    log?.(`  ${quote.symbol ?? ''}: quoted in ${code} with no rate available — skipping`)
    return null
  }

  const factor = 1 / (rate * divisor)
  return {
    ...quote,
    price: quote.price * factor,
    // Kept so the dashboard can say what the exchange actually quoted, and so a
    // wrong conversion is visible rather than baked silently into one number.
    quoteCurrency: code,
    quotePrice: quote.price,
    // A percentage is unitless: the same in either currency, and converting it
    // would be wrong.
    change24h: quote.change24h,
  }
}

/**
 * `budget` names the allowance to draw on. The scheduled price job spends the
 * price budget; a person looking up a symbol before adding it spends the
 * lookup one, so a busy day of scheduled refreshes cannot leave the add form
 * unable to quote anything.
 */
export async function fetchStockPrices(symbols, { alphaVantageKey, previous = {}, fxRates = null, budget = 'yahoo', log } = {}) {
  const results = {}

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i]
    if (i > 0) await delay(STAGGER_MS)

    let quote
    try {
      quote = await fetchFromYahoo(symbol, budget)
    } catch (yahooErr) {
      log?.(`  ${symbol}: Yahoo failed (${yahooErr.message}) — trying Alpha Vantage`)
      try {
        quote = await fetchFromAlphaVantage(symbol, alphaVantageKey)
      } catch (avErr) {
        log?.(`  ${symbol}: Alpha Vantage failed too (${avErr.message}) — keeping previous value`)
        if (previous[symbol]) results[symbol] = previous[symbol]
        continue
      }
    }

    const usd = toUsd({ ...quote, symbol }, fxRates, log)
    if (!usd) continue
    results[symbol] = { symbol, name: symbol, type: 'stock', ...usd }
  }

  return results
}

export { remaining }
