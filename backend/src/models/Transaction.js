import mongoose from 'mongoose'

/**
 * One buy or sell, as it happened.
 *
 * Holdings answer "what do I own now"; this answers "how did it get that way".
 * The two are kept separately on purpose. Deriving every position by replaying
 * the whole ledger is the tidier model on paper, but this app already has real
 * positions in it that predate any ledger, and rebuilding them from a history
 * that does not exist yet would mean inventing the history. So a transaction
 * *applies* to a holding rather than defining it, and the ledger starts from
 * the first one recorded.
 */
const transactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    symbol: { type: String, required: true, uppercase: true },
    name: { type: String, default: '' },
    type: { type: String, enum: ['crypto', 'stock', 'commodity', 'cash'], required: true },
    side: { type: String, enum: ['buy', 'sell'], required: true },
    quantity: { type: Number, required: true, min: 0 },

    /**
     * What one unit changed hands at, in USD — the same unit the holding's
     * average cost is in, so the two can be compared without conversion.
     */
    unitPrice: { type: Number, required: true, min: 0 },

    /**
     * When the trade happened, which is not when it was typed in. Someone
     * entering last month's purchase needs the date to be last month, or the
     * ledger says something that never occurred.
     */
    date: { type: Date, required: true },

    /** Cash only: the currency the balance is denominated in. */
    currency: { type: String, default: null },

    /**
     * Sells only: proceeds minus what that quantity cost, using the average
     * cost at the moment of sale.
     *
     * Recorded rather than recomputed, because average cost moves with every
     * later purchase — working it out afterwards would price a past sale using
     * a basis that did not exist when it happened.
     */
    realizedPnl: { type: Number, default: null },
  },
  { timestamps: true },
)

// The ledger is read newest-first, per person, and per holding on an asset page.
transactionSchema.index({ userId: 1, date: -1 })
transactionSchema.index({ userId: 1, symbol: 1, date: -1 })

export default mongoose.model('Transaction', transactionSchema)
