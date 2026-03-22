import { Router } from 'express'
import Asset from '../models/Asset.js'

const router = Router()

// GET /api/assets — list all assets
router.get('/', async (_req, res, next) => {
  try {
    const assets = await Asset.find().sort({ createdAt: -1 })
    res.json(assets)
  } catch (err) {
    next(err)
  }
})

// POST /api/assets — create a new asset
router.post('/', async (req, res, next) => {
  try {
    const { symbol, name, type, quantity, purchasePrice } = req.body
    const asset = await Asset.create({
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

// DELETE /api/assets/:id — remove an asset
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await Asset.findByIdAndDelete(req.params.id)
    if (!deleted) return res.status(404).json({ error: 'Asset not found' })
    res.json({ message: 'Asset removed' })
  } catch (err) {
    next(err)
  }
})

// PATCH /api/assets/:id/price — update price info
router.patch('/:id/price', async (req, res, next) => {
  try {
    const { currentPrice, change24h } = req.body
    const asset = await Asset.findByIdAndUpdate(
      req.params.id,
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
