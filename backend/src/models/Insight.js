import mongoose from 'mongoose'

/**
 * An LLM-written read on one holding, grounded in real articles.
 *
 * The sources are not the model's own: they are fetched deterministically
 * before the model is asked anything, and every link it returns is checked
 * against that list before storing. A model asked for "commentary with sources"
 * will invent plausible URLs, and a fabricated citation is worse than none —
 * so the architecture makes one impossible rather than unlikely.
 */
const insightSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // ticker or coin symbol
    name: String,
    type: { type: String, enum: ['stock', 'crypto'] },

    /** A few sentences on what the coverage is actually saying. */
    summary: String,
    /** Short bullet points — the themes a holder would want flagged. */
    themes: { type: [String], default: () => [] },
    /** positive | negative | mixed | unclear — the tone of the coverage, not advice. */
    sentiment: String,

    /** Only articles we fetched. Each one is a real, dated, published piece. */
    sources: {
      type: [new mongoose.Schema({
        title: String,
        url: String,
        publisher: String,
        publishedAt: Date,
      }, { _id: false })],
      default: () => [],
    },

    model: String,
    generatedAt: { type: Date, required: true },
  },
  { minimize: false, versionKey: false },
)

export default mongoose.model('Insight', insightSchema, 'insights')
