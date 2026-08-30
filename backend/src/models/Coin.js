import mongoose from 'mongoose'

/**
 * A tracked cryptocurrency, refreshed from market-cap rankings.
 *
 * Previously this was a hardcoded list of thirty symbols, which was a snapshot
 * of the rankings on the day it was written: CRO had since risen into range and
 * was unknown to the app, and MATIC had been renamed. A stored list refreshed
 * from the provider keeps up on its own.
 */
const coinSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },        // ticker, e.g. 'CRO'
    coingeckoId: { type: String, required: true }, // 'crypto-com-chain'
    name: String,
    rank: Number,
    /** Yahoo's symbol for history, once verified to be the same asset. */
    yahooSymbol: String,
    updatedAt: { type: Date, required: true },
  },
  { versionKey: false },
)

coinSchema.index({ rank: 1 })

export default mongoose.model('Coin', coinSchema, 'coins')
