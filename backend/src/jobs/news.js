/**
 * Recent published coverage for a symbol.
 *
 * Deliberately not an LLM's job. Everything here is fetched and parsed
 * mechanically, so every title, publisher, date and URL is real by
 * construction. The model is only ever shown this list and only ever allowed to
 * cite from it — see insights.js.
 */

import { consume } from './rateBudget.js'

const SEARCH = 'https://query2.finance.yahoo.com/v1/finance/search'

/**
 * Crypto needs its full name.
 *
 * Searching "BTC-USD" returns whatever is on the wire that hour — a mutiny in
 * Niger, in one test — because the ticker matches nothing in the news index.
 * The name matches the coverage.
 */
const QUERY_ALIASES = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  XRP: 'XRP Ripple',
  ADA: 'Cardano',
  DOGE: 'Dogecoin',
  DOT: 'Polkadot',
  AVAX: 'Avalanche crypto',
  LINK: 'Chainlink crypto',
  MATIC: 'Polygon crypto',
  LTC: 'Litecoin',
  BNB: 'Binance Coin',
}

/** Older than this and it is not "recent commentary" in any useful sense. */
const MAX_AGE_DAYS = 21

export function newsQuery(symbol, type) {
  const s = symbol.toUpperCase()
  if (type === 'crypto') return QUERY_ALIASES[s] ?? s
  return s
}

export async function fetchNews(symbol, type, limit = 8) {
  /**
   * News has its own allowance, separate from the price job's.
   *
   * Exhaustion throws rather than returning an empty list: an empty list means
   * "nothing was published about this", and reporting a spent budget that way
   * made every holding look like it had no coverage, with nothing in the log
   * to say otherwise.
   */
  if (!(await consume('yahooNews'))) {
    throw new Error('daily news budget exhausted')
  }

  const q = encodeURIComponent(newsQuery(symbol, type))
  const res = await fetch(`${SEARCH}?q=${q}&newsCount=${limit}&quotesCount=0`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`news: HTTP ${res.status}`)

  const cutoff = Date.now() - MAX_AGE_DAYS * 86400e3

  return (await res.json()).news
    ?.map(n => ({
      title: n.title,
      url: n.link,
      publisher: n.publisher,
      publishedAt: n.providerPublishTime ? new Date(n.providerPublishTime * 1000) : null,
    }))
    .filter(n => n.title && n.url?.startsWith('http'))
    .filter(n => !n.publishedAt || n.publishedAt.getTime() >= cutoff)
    .slice(0, limit) ?? []
}
