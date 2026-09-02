import { Router } from 'express'
import Asset from '../models/Asset.js'
import auth from '../middleware/auth.js'

const router = Router()

/** Escape a symbol before it goes into a RegExp — "BRK.B" has a dot in it. */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

    const asset = await Asset.create({
      userId: req.userId,
      symbol,
      name,
      type,
      quantity: qty,
      purchasePrice: price,
      currentPrice: price,
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
