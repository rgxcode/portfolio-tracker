/**
 * What buying and selling does to a holding.
 *
 * Extracted so there is exactly one answer. Adding a holding and recording a
 * buy are the same event described two ways, and when each route carried its
 * own copy of the averaging arithmetic they were one edit away from disagreeing
 * about what a position costs.
 */

import Asset from './models/Asset.js'
import { loadSnapshot, STANDARD } from './jobs/snapshotStore.js'
import { fetchStockPrices } from './jobs/stocks.js'
import { resolveCoin, fetchCoinQuote } from './jobs/coinlist.js'

/** Escape a symbol before it goes into a RegExp — "BRK.B" has a dot in it. */
export function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Quantities are floating point; a position this small is closed, not open. */
const DUST = 1e-9

/**
 * What this holding is worth per unit, right now.
 *
 * A new holding used to open at its purchase price, which reads as a real
 * quote: the row shows a value, a 24h move of exactly +0.00%, and nothing to
 * say the number is a placeholder. It stays that way until the scheduled job
 * next runs — up to fifteen minutes inside market hours, and all night outside
 * them — so a share bought at $50 that trades at $550 sits in the book an order
 * of magnitude wrong, looking entirely settled.
 *
 * The stored snapshot answers for anything already tracked, which costs
 * nothing. Only a symbol nobody holds yet needs a request, and that draws on
 * the lookup allowance rather than the price job's.
 *
 * Returns null when there is genuinely no price to be had. The caller then
 * falls back to the purchase price but leaves `lastUpdated` unset, so an
 * unpriced holding stays distinguishable from one that simply has not moved.
 */
export async function livePrice({ symbol, type, currency }) {
  const snap = await loadSnapshot(STANDARD).catch(() => null)

  if (type === 'cash') {
    const code = String(currency ?? symbol).toUpperCase()
    if (code === 'USD') return { price: 1, change24h: 0 }
    const rate = snap?.fxRates?.[code]
    return rate > 0 ? { price: 1 / rate, change24h: 0 } : null
  }

  const bucket = type === 'crypto' ? snap?.crypto
    : type === 'commodity' ? snap?.commodities
      : snap?.stocks
  const known = bucket?.[symbol]
  if (known?.price) {
    return { price: known.price, change24h: known.change24h ?? 0, asOf: known.asOf ?? null }
  }

  /**
   * A coin outside the ranked window is looked up rather than refused.
   *
   * The window is fifty deep and a dozen of those slots are stablecoins, so
   * real assets sit outside it — Polkadot at rank 56, POL at 70. Holding
   * either used to mean a row that showed its purchase price forever, because
   * the scheduled job only prices what it already knows about. Resolving here
   * stores the coin, so this add gets a price and every run after this one
   * keeps it current.
   */
  if (type === 'crypto') {
    const coin = await resolveCoin(symbol)
    if (!coin?.coingeckoId) return null
    const quote = await fetchCoinQuote(coin.coingeckoId)
    return quote
      ? { price: quote.price, change24h: quote.change24h, asOf: quote.asOf }
      : null
  }

  // A metal not in the snapshot is one the price job does not track, and
  // guessing is worse than waiting for it.
  if (type !== 'stock') return null

  try {
    const [quote] = Object.values(await fetchStockPrices([symbol], {
      fxRates: snap?.fxRates ?? null,
      budget: 'yahooSearch',
    }))
    return quote?.price
      ? { price: quote.price, change24h: quote.change24h ?? 0, asOf: quote.asOf ?? null }
      : null
  } catch {
    return null
  }
}

/** The holding this trade is about, matched case-insensitively. */
export function findHolding(userId, symbol, type) {
  return Asset.findOne({
    userId,
    type,
    symbol: new RegExp(`^${escapeRegex(symbol)}$`, 'i'),
  })
}

/**
 * Buy: fold into the position already held, or open a new one.
 *
 * Buying more of something is not a new position. Creating a row per purchase
 * split the weight, the cost basis and the coverage between two rows that
 * disagreed, and neither could answer "what did this cost me".
 */
export async function applyBuy({ userId, symbol, name, type, quantity, unitPrice, currency }) {
  const existing = await findHolding(userId, symbol, type)

  if (existing) {
    const totalQty = existing.quantity + quantity
    // Weighted by quantity: a hundred shares at $10 and one at $500 average
    // to $14.85, not to $255.
    existing.purchasePrice = totalQty > 0
      ? (existing.quantity * existing.purchasePrice + quantity * unitPrice) / totalQty
      : unitPrice
    existing.quantity = totalQty
    existing.symbol = symbol
    await existing.save()
    return { asset: existing, created: false }
  }

  const live = await livePrice({ symbol, type, currency })

  const asset = await Asset.create({
    userId,
    symbol,
    name,
    type,
    quantity,
    purchasePrice: unitPrice,
    // The purchase price only stands in when nothing could be quoted, and
    // then `lastUpdated` stays null so the row is not mistaken for priced.
    currentPrice: live?.price ?? unitPrice,
    change24h: live?.change24h ?? 0,
    lastUpdated: live ? new Date() : null,
    currency: type === 'cash' ? String(currency ?? symbol).toUpperCase() : null,
  })
  return { asset, created: true }
}

/**
 * Sell: take the quantity off the position, and close it if nothing is left.
 *
 * Average cost is deliberately untouched. Selling does not change what the
 * remaining units cost — only how many there are — so re-averaging on a sale
 * would rewrite the history of purchases that already happened.
 *
 * Returns `{ error }` rather than throwing for the two things a person can get
 * wrong, so the route can answer them in its own words.
 */
export async function applySell({ userId, symbol, type, quantity, unitPrice }) {
  const existing = await findHolding(userId, symbol, type)
  if (!existing) return { error: `You do not hold any ${symbol}.` }

  if (quantity > existing.quantity + DUST) {
    return {
      error: `You hold ${existing.quantity} ${symbol}, so ${quantity} cannot be sold.`,
      held: existing.quantity,
    }
  }

  // Read the basis before the row is changed or removed: a later purchase would
  // move it, and this sale was made against the average as it stood today.
  const avgCost = existing.purchasePrice
  const realizedPnl = (unitPrice - avgCost) * quantity
  const remaining = existing.quantity - quantity

  // Selling the lot closes the position rather than leaving a row at zero,
  // which would still be counted, charted and searched for news.
  if (remaining <= DUST) {
    await existing.deleteOne()
    return { asset: null, closed: true, avgCost, realizedPnl }
  }

  existing.quantity = remaining
  await existing.save()
  return { asset: existing, closed: false, avgCost, realizedPnl }
}
