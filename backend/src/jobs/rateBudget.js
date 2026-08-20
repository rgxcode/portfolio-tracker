/**
 * Persisted per-day request budget.
 *
 * The counter lives on disk, so it survives restarts and reboots: a provider's
 * daily cap can't be blown by the job being reloaded ten times in an hour.
 * Counts reset when the calendar day changes in CET.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { TZ } from './marketHours.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, '..', '..', 'data')
const BUDGET_FILE = resolve(DATA_DIR, 'rate-budget.json')

/**
 * Daily caps, set deliberately below each provider's published limit so we
 * stop short of it rather than discovering it by being throttled.
 *   Alpha Vantage free tier: 25 req/day  → we allow 20
 *   Yahoo (unofficial):      no published limit → we self-limit to stay polite
 */
export const CAPS = {
  alphavantage: 20,
  yahoo: 800,
  coingecko: 2000,
  // The 30-second agent needs 2,880 calls/day. Both exchanges publish limits
  // far above that (Kraken ~1 req/s, Binance 1,200 weight/min), so the cap here
  // is a safety net against a runaway loop rather than a provider requirement.
  kraken: 5000,
  binance: 5000,
}

function today() {
  // Calendar day in CET, e.g. "2026-08-20"
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function load() {
  try {
    const data = JSON.parse(readFileSync(BUDGET_FILE, 'utf-8'))
    if (data.date === today()) return data
  } catch {
    // Missing or unreadable — start fresh.
  }
  return { date: today(), counts: {} }
}

function save(state) {
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(BUDGET_FILE, JSON.stringify(state, null, 2))
}

/** How many requests are still allowed today for a provider. */
export function remaining(provider) {
  const state = load()
  return Math.max(0, (CAPS[provider] ?? Infinity) - (state.counts[provider] ?? 0))
}

/** Reserve one request. Returns false when the cap is reached — caller must skip. */
export function consume(provider, n = 1) {
  const state = load()
  const used = state.counts[provider] ?? 0
  const cap = CAPS[provider] ?? Infinity
  if (used + n > cap) return false
  state.counts[provider] = used + n
  save(state)
  return true
}

/** Snapshot of today's usage, surfaced through the API for visibility. */
export function usage() {
  const state = load()
  return Object.fromEntries(
    Object.keys(CAPS).map(p => [
      p,
      { used: state.counts[p] ?? 0, cap: CAPS[p], remaining: remaining(p) },
    ]),
  )
}
