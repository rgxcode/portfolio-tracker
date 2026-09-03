import { Router } from 'express'
import Asset from '../models/Asset.js'
import auth from '../middleware/auth.js'
import { loadSnapshot, STANDARD } from '../jobs/snapshotStore.js'
import { fetchStockPrices } from '../jobs/stocks.js'
import { resolveCoin, fetchCoinQuote } from '../jobs/coinlist.js'

const router = Router()

/** Escape a symbol before it goes into a RegExp — "BRK.B" has a dot in it. */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}


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
async function livePrice({ symbol, type, currency }) {
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

// All asset routes require authentication
router.use(auth)

// GET /api/assets — list current user's assets
router.get('/', async (req, res, next) => {
  try {
    const assets = await Asset.find({ userId: req.userId }).sort({ createdAt: -1 })
    res.json(assets)
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/assets — add a holding, folding into one you already own.
 *
 * Buying more of something is not a new position. The old behaviour created a
 * row per submission, so fifteen Tesla shares plus two more read as two
 * separate holdings of the same company: the weight was split, the coverage
 * was fetched twice, and neither row could answer "what did this cost me".
 *
 * Adding to an existing holding sums the quantity and re-averages the cost by
 * quantity, which is what the average cost of a position means. The name on
 * the existing row is kept rather than overwritten — the same coin arrives as
 * "Ether" from one lookup and "Ethereum" from another, and a holding should
 * not rename itself because of where the second purchase was entered from.
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, type, quantity, purchasePrice, currency } = req.body

    // Symbols are matched case-insensitively but stored uppercase, so "eth"
    // and "ETH" are one holding rather than two that merely look alike.
    const symbol = String(req.body.symbol ?? '').trim().toUpperCase()
    if (!symbol) return res.status(400).json({ error: 'A symbol is required' })

    const qty = Number(quantity)
    const price = Number(purchasePrice)
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than zero' })
    }
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: 'Purchase price must be a number' })
    }

    const existing = await Asset.findOne({
      userId: req.userId,
      type,
      symbol: new RegExp(`^${escapeRegex(symbol)}$`, 'i'),
    })

    if (existing) {
      const totalQty = existing.quantity + qty
      // Weighted by quantity: a hundred shares at $10 and one at $500 average
      // to $14.85, not to $255.
      existing.purchasePrice = totalQty > 0
        ? (existing.quantity * existing.purchasePrice + qty * price) / totalQty
        : price
      existing.quantity = totalQty
      existing.symbol = symbol
      await existing.save()
      return res.json(existing)
    }

    const live = await livePrice({ symbol, type, currency })

    const asset = await Asset.create({
      userId: req.userId,
      symbol,
      name,
      type,
      quantity: qty,
      purchasePrice: price,
      // The purchase price only stands in when nothing could be quoted, and
      // then `lastUpdated` stays null so the row is not mistaken for priced.
      currentPrice: live?.price ?? price,
      change24h: live?.change24h ?? 0,
      lastUpdated: live ? new Date() : null,
      currency: type === 'cash' ? String(currency ?? symbol).toUpperCase() : null,
    })
    res.status(201).json(asset)
  } catch (err) {
    next(err)
  }
})

/**
 * PATCH /api/assets/:id — correct a holding.
 *
 * Merging on add means a mistyped quantity can no longer be fixed by deleting
 * one of two rows, so there has to be a way to set the position outright.
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const update = {}
    if (req.body.name !== undefined) update.name = String(req.body.name).trim()

    if (req.body.quantity !== undefined) {
      const qty = Number(req.body.quantity)
      if (!Number.isFinite(qty) || qty < 0) {
        return res.status(400).json({ error: 'Quantity must be zero or more' })
      }
      update.quantity = qty
    }

    if (req.body.purchasePrice !== undefined) {
      const price = Number(req.body.purchasePrice)
      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({ error: 'Purchase price must be zero or more' })
      }
      update.purchasePrice = price
    }

    const asset = await Asset.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      update,
      { new: true },
    )
    if (!asset) return res.status(404).json({ error: 'Asset not found' })
    res.json(asset)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/assets/:id — remove an asset (only if owned by current user)
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await Asset.findOneAndDelete({ _id: req.params.id, userId: req.userId })
    if (!deleted) return res.status(404).json({ error: 'Asset not found' })
    res.json({ message: 'Asset removed' })
  } catch (err) {
    next(err)
  }
})

// PATCH /api/assets/:id/price — update price info (only if owned by current user)
router.patch('/:id/price', async (req, res, next) => {
  try {
    const { currentPrice, change24h } = req.body
    const asset = await Asset.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { currentPrice, change24h, lastUpdated: new Date() },
      { new: true },
    )
    if (!asset) return res.status(404).json({ error: 'Asset not found' })
    res.json(asset)
  } catch (err) {
    next(err)
  }
})

export default router
