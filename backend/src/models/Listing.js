import mongoose from 'mongoose'

/**
 * Every security listed on a US exchange.
 *
 * Two sources, because neither is complete on its own. The SEC's ticker file
 * covers entities that file their own reports and carries the CIK, which is the
 * key to filings and therefore to every computed ratio. It does not cover most
 * ETFs: a fund organised as a series of a trust files under the umbrella, not
 * per fund, so SOXX, SMH, VOO and XLK are simply absent from it while SPY and
 * GLD — which are their own trusts — are present. Nasdaq's traded-symbol file
 * fills that in: it lists everything actually trading and flags which are
 * funds, but carries no CIK.
 *
 * Separate from `constituents`, which holds the S&P 500 with its GICS
 * classification. That richer record drives peer groups; this one exists so the
 * app knows a ticker exists at all.
 */
const listingSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },        // ticker
    /**
     * Zero-padded, for EDGAR. Absent for funds: an ETF that files under its
     * umbrella trust has no CIK of its own, and it has no filings to fetch
     * either, so there is nothing for one to unlock.
     */
    cik: { type: String, default: null },
    name: String,
    /** True for ETFs and other exchange-traded funds, per Nasdaq's own flag. */
    isEtf: { type: Boolean, default: false },
    /** True for S&P 500 members, so search can rank the familiar first. */
    inIndex: { type: Boolean, default: false },
    updatedAt: { type: Date, required: true },
  },
  { versionKey: false },
)

// Name search needs to scan; a text index would be heavier than the collection.
listingSchema.index({ name: 1 })
listingSchema.index({ inIndex: 1 })

export default mongoose.model('Listing', listingSchema, 'listings')
