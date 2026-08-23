import mongoose from 'mongoose'

/**
 * The current price snapshot, stored in the database rather than on disk.
 *
 * On one machine a JSON file was the simplest thing that worked. In a deployed
 * setup it can't be: the scheduled job and the API run on different hosts with
 * separate, ephemeral filesystems, so a file written by the job is invisible to
 * the API and disappears on redeploy. The database is the one thing both share.
 *
 * One document per source, keyed by `_id`:
 *   'standard' — the scheduled job (CoinGecko + Yahoo)
 *   'llm'      — the OpenCode agent reading prices off web pages
 */
const snapshotSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // 'standard' | 'llm'
    // The whole snapshot payload, stored as-is. `minimize: false` keeps empty
    // objects (e.g. a stocks map with nothing in it) instead of dropping them.
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, required: true },
  },
  { minimize: false, versionKey: false },
)

export default mongoose.model('Snapshot', snapshotSchema, 'snapshots')
