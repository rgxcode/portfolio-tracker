import mongoose from 'mongoose'

/**
 * One S&P 500 member.
 *
 * Kept in the database rather than fetched when needed: the list changes a few
 * times a year, every job that walks the index needs it, and depending on a
 * third-party file being reachable at request time would make an unrelated
 * outage look like our bug.
 *
 * The GICS classification is the useful part beyond the ticker list — it gives
 * a real peer group (same sub-industry) instead of inferring one from what
 * people happen to click on.
 */
const constituentSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // ticker, e.g. 'AMD'
    name: String,
    sector: String,
    subIndustry: String,
    headquarters: String,
    dateAdded: String,
    /** Zero-padded ten-digit SEC identifier, the key for EDGAR's filings API. */
    cik: String,
    updatedAt: { type: Date, required: true },
  },
  { versionKey: false },
)

// Peer lookups filter on sub-industry, then fall back to sector.
constituentSchema.index({ subIndustry: 1 })
constituentSchema.index({ sector: 1 })

export default mongoose.model('Constituent', constituentSchema, 'constituents')
