import mongoose from 'mongoose'

/**
 * One price observation for one symbol at one instant.
 *
 * Written by the scheduled job (every run for crypto, every 15 min for stocks
 * while the CET window is open) and by the one-time backfill. This collection
 * is the only source the charts read from.
 */
const priceHistorySchema = new mongoose.Schema(
  {
    /**
     * What the series is keyed by. A ticker for anything that trades, and
     * `FX:<code>` for a currency — because a currency code is not a ticker and
     * the two collide: INR is the rupee to someone holding cash and Infinity
     * Natural Resources to the NYSE. Sharing one namespace priced a 420,000
     * rupee balance as 420,000 shares of an oil company.
     */
    symbol: { type: String, required: true, uppercase: true },
    type: { type: String, enum: ['crypto', 'stock', 'commodity', 'cash'], required: true },
    // The instant the price belongs to — the exchange/source timestamp, not
    // the moment we fetched it.
    ts: { type: Date, required: true },
    price: { type: Number, required: true },
    source: { type: String, default: null },
    // Daily candles from the backfill vs. live intraday samples. Pruning keeps
    // all dailies forever but thins intraday points after 30 days.
    granularity: { type: String, enum: ['intraday', 'daily'], default: 'intraday' },
  },
  { timestamps: false },
)

// One point per symbol per instant — makes the backfill and the job idempotent.
priceHistorySchema.index({ symbol: 1, ts: 1 }, { unique: true })
// The query the chart endpoint runs: one symbol, a time range, in order.
priceHistorySchema.index({ symbol: 1, ts: -1 })

export default mongoose.model('PriceHistory', priceHistorySchema)
