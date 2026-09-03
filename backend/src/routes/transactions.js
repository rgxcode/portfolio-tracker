import { Router } from 'express'
import Transaction from '../models/Transaction.js'
import auth from '../middleware/auth.js'
import { applyBuy, applySell, findHolding } from '../positions.js'

const router = Router()

router.use(auth)

/** How far ahead a trade date may sit. Nobody sells tomorrow. */
function validDate(raw) {
  if (raw === undefined || raw === null || raw === '') return new Date()
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  // A day's grace, so a timezone ahead of the server is not rejected for
  // recording something that has already happened where the user is.
  if (d.getTime() > Date.now() + 86400e3) return null
  return d
}

// GET /api/transactions — the ledger, newest first. ?symbol= narrows it.
router.get('/', async (req, res, next) => {
  try {
    const query = { userId: req.userId }
    const symbol = String(req.query.symbol ?? '').trim().toUpperCase()
    if (symbol) query.symbol = symbol

    const limit = Math.min(Number(req.query.limit) || 200, 500)
    const rows = await Transaction.find(query).sort({ date: -1, createdAt: -1 }).limit(limit).lean()
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

/**
 * POST /api/transactions — record a trade and apply it to the holding.
 *
 * The two happen together or not at all as far as the caller is concerned: the
 * position is changed first, and only a change that succeeded gets written to
 * the ledger. The other order would leave a recorded sale that never reduced
 * anything, which is worse than no record — a ledger that disagrees with the
 * book is not evidence of anything.
 */
router.post('/', async (req, res, next) => {
  try {
    const { name, type, currency } = req.body
    const side = String(req.body.side ?? 'buy').toLowerCase()
    const symbol = String(req.body.symbol ?? '').trim().toUpperCase()

    if (!symbol) return res.status(400).json({ error: 'A symbol is required' })
    if (side !== 'buy' && side !== 'sell') {
      return res.status(400).json({ error: 'A transaction is either a buy or a sell' })
    }
    if (!['crypto', 'stock', 'commodity', 'cash'].includes(type)) {
      return res.status(400).json({ error: 'Unknown asset type' })
    }

    const quantity = Number(req.body.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than zero' })
    }

    const unitPrice = Number(req.body.unitPrice)
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return res.status(400).json({ error: 'Price must be a number' })
    }

    const date = validDate(req.body.date)
    if (!date) return res.status(400).json({ error: 'That date is not a date in the past' })

    let result
    if (side === 'buy') {
      result = await applyBuy({
        userId: req.userId, symbol, name: String(name ?? symbol), type,
        quantity, unitPrice, currency,
      })
    } else {
      result = await applySell({ userId: req.userId, symbol, type, quantity, unitPrice })
      if (result.error) return res.status(400).json({ error: result.error, held: result.held })
    }

    const transaction = await Transaction.create({
      userId: req.userId,
      symbol,
      // A sell keeps the name the holding already carries, so the ledger does
      // not end up with the same asset under two spellings.
      name: String(name ?? result.asset?.name ?? symbol),
      type,
      side,
      quantity,
      unitPrice,
      date,
      currency: type === 'cash' ? String(currency ?? symbol).toUpperCase() : null,
      realizedPnl: side === 'sell' ? result.realizedPnl : null,
    })

    res.status(201).json({
      transaction,
      // Null when the sale closed the position — the client removes the row
      // rather than looking for an asset that no longer exists.
      asset: result.asset ?? null,
      closed: Boolean(result.closed),
    })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/transactions/holdings — what can be sold, and how much of it.
 *
 * The sell form needs the position sizes to stop someone selling more than
 * they have before the request is made, rather than after it is refused.
 */
router.get('/holdings/:symbol', async (req, res, next) => {
  try {
    const symbol = String(req.params.symbol ?? '').trim().toUpperCase()
    const type = String(req.query.type ?? 'stock')
    const held = await findHolding(req.userId, symbol, type)
    res.json({ symbol, quantity: held?.quantity ?? 0, avgCost: held?.purchasePrice ?? null })
  } catch (err) {
    next(err)
  }
})

export default router
