/**
 * Persisted per-day request budget.
 *
 * Stored in the database, not on disk. A file worked when everything ran on one
 * machine, but a scheduled job in CI gets a fresh container every run — the
 * counter would reset each time and the daily cap would never actually bind.
 *
 * Counts reset when the calendar day changes in CET.
 */

import mongoose from 'mongoose'
import { TZ } from './marketHours.js'

/**
 * Daily caps, set deliberately below each provider's published limit so we stop
 * short of it rather than discovering it by being throttled.
 *   Alpha Vantage free tier: 25 req/day  → we allow 20
 *   Yahoo (unofficial):      no published limit → we self-limit to stay polite
 */
export const CAPS = {
  alphavantage: 20,
  yahoo: 800,
  coingecko: 2000,
  kraken: 5000,
  binance: 5000,
}

const rateBudgetSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // CET calendar day, e.g. "2026-08-23"
    counts: { type: Map, of: Number, default: () => new Map() },
  },
  { minimize: false, versionKey: false },
)

const RateBudget = mongoose.models.RateBudget
  ?? mongoose.model('RateBudget', rateBudgetSchema, 'ratebudgets')

/** In-process fallback used only when no database connection is available. */
const memoryCounts = new Map()

function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function connected() {
  return mongoose.connection?.readyState === 1
}

/**
 * Reserve `n` requests. Returns false when the cap is reached — the caller must
 * skip rather than proceed.
 *
 * The check and the increment happen in a single conditional update, so two
 * concurrent callers can't both slip past the cap.
 */
export async function consume(provider, n = 1) {
  const cap = CAPS[provider] ?? Infinity
  if (cap === Infinity) return true

  if (!connected()) {
    const used = memoryCounts.get(provider) ?? 0
    if (used + n > cap) return false
    memoryCounts.set(provider, used + n)
    return true
  }

  const field = `counts.${provider}`
  try {
    const doc = await RateBudget.findOneAndUpdate(
      {
        _id: today(),
        $or: [{ [field]: { $exists: false } }, { [field]: { $lte: cap - n } }],
      },
      { $inc: { [field]: n } },
      { upsert: true, new: true },
    )
    return Boolean(doc)
  } catch (err) {
    // Upsert raced with another writer creating today's document — the retry
    // finds it and takes the normal conditional path.
    if (err.code === 11000) {
      const doc = await RateBudget.findOneAndUpdate(
        { _id: today(), $or: [{ [field]: { $exists: false } }, { [field]: { $lte: cap - n } }] },
        { $inc: { [field]: n } },
        { new: true },
      )
      return Boolean(doc)
    }
    throw err
  }
}

/** How many requests are still allowed today for a provider. */
export async function remaining(provider) {
  const cap = CAPS[provider] ?? Infinity
  if (!connected()) return Math.max(0, cap - (memoryCounts.get(provider) ?? 0))

  const doc = await RateBudget.findById(today()).lean()
  const used = doc?.counts?.[provider] ?? 0
  return Math.max(0, cap - used)
}

/** Snapshot of today's usage, surfaced through the API for visibility. */
export async function usage() {
  let counts = {}
  if (connected()) {
    const doc = await RateBudget.findById(today()).lean()
    counts = doc?.counts ?? {}
  } else {
    counts = Object.fromEntries(memoryCounts)
  }

  return Object.fromEntries(
    Object.keys(CAPS).map(p => [
      p,
      { used: counts[p] ?? 0, cap: CAPS[p], remaining: Math.max(0, CAPS[p] - (counts[p] ?? 0)) },
    ]),
  )
}
