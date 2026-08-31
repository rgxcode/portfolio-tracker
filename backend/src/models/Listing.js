import mongoose from 'mongoose'

/**
 * Every company listed on a US exchange, from the SEC's own ticker file.
 *
 * Separate from `constituents`, which holds the S&P 500 with its GICS
 * classification. That richer record drives peer groups; this one exists so the
 * app knows a ticker exists at all. Scoping search to the index meant MP
 * Materials and SoFi simply could not be found, despite both filing everything
 * needed to support them.
 */
const listingSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },        // ticker
    cik: { type: String, required: true },        // zero-padded, for EDGAR
    name: String,
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
