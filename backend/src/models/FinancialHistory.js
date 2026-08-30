import mongoose from 'mongoose'

/**
 * A company's reported financials over time, as filed with the SEC.
 *
 * Sourced from EDGAR's XBRL company-facts API rather than a commercial provider:
 * it is free, needs no key, imposes no daily quota, and reaches back to the
 * company's first XBRL filing — typically 2008-2010 — where the metered
 * provider gave eight quarters. That difference is what makes covering the whole
 * index possible at all.
 *
 * One document per company holding its quarters, rather than a document per
 * quarter: the page always wants the whole series, the series is small, and this
 * keeps 500 documents instead of 30,000.
 */
const financialHistorySchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // ticker
    cik: String,
    entityName: String,

    /**
     * Newest first. Income-statement figures cover the quarter; balance-sheet
     * figures are the position at its end. A missing value means the company
     * did not report that concept for that period — never a zero.
     */
    quarters: { type: [new mongoose.Schema({ _id: false }, { strict: false })], default: () => [] },

    /**
     * Shares in issue at the most recent filing's cover date — a company-level
     * fact, not a quarterly one, and what a market cap needs.
     */
    sharesOutstanding: Number,
    sharesAsOf: String,

    fetchedAt: { type: Date, required: true },
  },
  { minimize: false, versionKey: false },
)

export default mongoose.model('FinancialHistory', financialHistorySchema, 'financialhistories')
