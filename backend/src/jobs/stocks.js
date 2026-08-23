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
async function fetchFromYahoo(symbol) {
  if (!await consume('yahoo')) throw new Error('daily yahoo budget exhausted')

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
export async function fetchStockPrices(symbols, { alphaVantageKey, previous = {}, log } = {}) {
  const results = {}

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i]
    if (i > 0) await delay(STAGGER_MS)

    let quote
    try {
      quote = await fetchFromYahoo(symbol)
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

    results[symbol] = { symbol, name: symbol, type: 'stock', ...quote }
  }

  return results
}

export { remaining }
