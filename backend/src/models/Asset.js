import mongoose from 'mongoose'

const assetSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    symbol: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['crypto', 'stock'], required: true },
    quantity: { type: Number, required: true, min: 0 },
    purchasePrice: { type: Number, required: true, min: 0 },
    currentPrice: { type: Number, default: 0 },
    change24h: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: null },
  },
  { timestamps: true },
)

export default mongoose.model('Asset', assetSchema)
