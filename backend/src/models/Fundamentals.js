import mongoose from 'mongoose'

/**
 * Company fundamentals for one ticker, cached in the database.
 *
 * Alpha Vantage's free tier allows 25 requests a day and a full refresh costs
 * four of them, so this is emphatically not something to fetch per page view.
 * Fundamentals also barely move: statements change once a quarter, and the
 * ratios that shift daily are recomputed from a price we already store. Caching
 * for days is therefore the correct behaviour rather than a compromise.
 *
 * Stored as-is per symbol, keyed by ticker, and replaced wholesale on refresh.
 */
const quarterSchema = new mongoose.Schema({ _id: false }, { strict: false })

const fundamentalsSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // upper-case ticker, e.g. 'AMD'

    name: String,
    description: String,
    sector: String,
    industry: String,
    exchange: String,
    currency: String,
    country: String,

    /** Headline ratios, already coerced to numbers — the provider sends strings. */
    metrics: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },

    /** Newest first, trimmed to a readable span rather than the provider's full history. */
    balanceSheetQuarterly: { type: [quarterSchema], default: () => [] },
    incomeQuarterly: { type: [quarterSchema], default: () => [] },
    earningsQuarterly: { type: [quarterSchema], default: () => [] },

    /** Related tickers, each one a symbol this API can also serve. */
    peers: { type: [String], default: () => [] },

    /** Which upstreams actually answered, so a partial refresh is visible. */
    sources: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },

    /**
     * True when the metered provider could not be reached, so the record holds
     * only what free sources gave. Short-lived — see the TTL in the route.
     */
    partial: { type: Boolean, default: false },
    unavailableReason: String,

    fetchedAt: { type: Date, required: true },
  },
  { minimize: false, versionKey: false },
)

export default mongoose.model('Fundamentals', fundamentalsSchema, 'fundamentals')
