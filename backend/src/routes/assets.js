import { Router } from 'express'
import Asset from '../models/Asset.js'
import auth from '../middleware/auth.js'

const router = Router()

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

// POST /api/assets — create a new asset for current user
router.post('/', async (req, res, next) => {
  try {
    const { symbol, name, type, quantity, purchasePrice } = req.body
    const asset = await Asset.create({
      userId: req.userId,
      symbol,
      name,
      type,
      quantity,
      purchasePrice,
      currentPrice: purchasePrice,
    })
    res.status(201).json(asset)
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
