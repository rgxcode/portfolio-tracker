/**
 * Read/write helpers for the current price snapshot.
 *
 * Every writer and reader goes through here, so there is exactly one place that
 * knows where snapshots live. Callers must already have a mongoose connection
 * open — the job, the agent, and the API server each manage their own.
 */

import Snapshot from '../models/Snapshot.js'

export const STANDARD = 'standard'
export const LLM = 'llm'

/** Replace the snapshot for one source. Upsert, so the first run creates it. */
export async function saveSnapshot(kind, payload) {
  await Snapshot.findByIdAndUpdate(
    kind,
    { payload, updatedAt: new Date() },
    { upsert: true, new: true },
  )
  return payload
}

/** The stored payload, or null when nothing has been written yet. */
export async function loadSnapshot(kind) {
  const doc = await Snapshot.findById(kind).lean()
  return doc?.payload ?? null
}
