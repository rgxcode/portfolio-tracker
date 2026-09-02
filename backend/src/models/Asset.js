import mongoose from 'mongoose'

const assetSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    symbol: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['crypto', 'stock', 'commodity', 'cash'], required: true },
    quantity: { type: Number, required: true, min: 0 },
    /**
     * What one unit cost, in USD, averaged over every buy.
     *
     * Adding to a holding folds into this rather than making a second row, so
     * it is a weighted average across the whole position, not the price of the
     * first purchase.
     */
    purchasePrice: { type: Number, required: true, min: 0 },
    currentPrice: { type: Number, default: 0 },
    change24h: { type: Number, default: 0 },

    /**
     * Cash only: which currency the balance is held in (ISO 4217).
     *
     * The balance itself is `quantity`, and `currentPrice` is what one unit is
     * worth in USD — 1 for dollars, the inverse of the FX rate otherwise. That
     * keeps cash on exactly the same footing as every other holding: the
     * portfolio totals multiply quantity by price and neither knows nor cares
     * that this row is money rather than an instrument, and a balance held in
     * a currency that has since moved shows that move as a gain or a loss,
     * which is the truth of holding it.
     */
    currency: { type: String, default: null },
  },
  { timestamps: true },
)

/**
 * One row per holding, per person.
 *
 * Buying more of something you already own folds into the position you have;
 * without that the same asset sits in the book twice, splitting its weight,
 * its cost basis and its coverage between two rows that disagree.
 *
 * That rule is enforced in the POST route rather than by a unique index here.
 * A unique index is the stronger guarantee, but declaring one in the schema
 * means Mongoose tries to build it on boot — and on a database that already
 * contains duplicates the build fails every time the server starts. The
 * consolidation script (scripts/merge-duplicate-assets.mjs) merges what is
 * there and creates the index afterwards, which is the only order that works.
 *
 * Cash is keyed by currency rather than ticker, so dollars and rupees are two
 * holdings while two deposits of rupees are one.
 */

export default mongoose.model('Asset', assetSchema)
