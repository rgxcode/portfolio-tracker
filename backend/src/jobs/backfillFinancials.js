#!/usr/bin/env node
/**
 * Loads reported financial history from SEC EDGAR for every S&P 500 member.
 *
 * Unlike the fundamentals fetch, this is not metered: EDGAR asks only for a
 * contact address and a request rate under ten per second. The whole index is
 * therefore one run rather than the months a 25-a-day quota would need.
 *
 *   node src/jobs/backfillFinancials.js            # every S&P 500 member
 *   node src/jobs/backfillFinancials.js AMD NVDA   # only these
 *
 * Safe to re-run: each company's document is replaced wholesale, so a repeat
 * refreshes figures and picks up newly filed quarters.
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import mongoose from 'mongoose'
import Constituent from '../models/Constituent.js'
import FinancialHistory from '../models/FinancialHistory.js'
import { refreshFinancials } from './edgar.js'
import { refreshConstituents } from './sp500.js'
import { formatCET } from './marketHours.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const env = readFileSync(resolve(__dirname, '..', '..', '.env'), 'utf-8')
  for (const line of env.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim()
  }
} catch { /* env file is optional */ }

const MONGO_URL = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/portfolio-tracker'

/** SEC allows ten a second; this stays well inside that. */
const STAGGER_MS = 400

const delay = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log(`[${formatCET()}]`, ...a)

async function main() {
  await mongoose.connect(MONGO_URL, { serverSelectionTimeoutMS: 10000 })

  const requested = process.argv.slice(2).map(s => s.toUpperCase())
  let members

  if (requested.length > 0) {
    members = await Constituent.find({ _id: { $in: requested } }).lean()
    const missing = requested.filter(r => !members.some(m => m._id === r))
    if (missing.length) log(`Not in the stored index, skipping: ${missing.join(', ')}`)
  } else {
    // Refresh membership first so the CIK for a recent addition is present.
    if ((await Constituent.estimatedDocumentCount()) === 0) await refreshConstituents()
    members = await Constituent.find({ cik: { $ne: null } }).lean()
  }

  log(`Loading financial history for ${members.length} companies from SEC EDGAR`)

  let ok = 0
  let quarters = 0
  const failures = []

  for (const [i, m] of members.entries()) {
    await delay(STAGGER_MS)
    try {
      const n = await refreshFinancials(m._id, m.cik)
      ok++
      quarters += n
    } catch (err) {
      failures.push(`${m._id} (${err.message})`)
    }
    if ((i + 1) % 25 === 0) {
      log(`  ${i + 1}/${members.length} · ${ok} loaded · ${quarters} quarters · ${failures.length} failed`)
    }
  }

  const stored = await FinancialHistory.estimatedDocumentCount()
  log(`Done. ${ok}/${members.length} companies, ${quarters} quarters. Collection holds ${stored}.`)
  if (failures.length) log(`Failed: ${failures.slice(0, 40).join(', ')}${failures.length > 40 ? ` …and ${failures.length - 40} more` : ''}`)

  await mongoose.disconnect()
}

main().catch(async (err) => {
  log('Financial backfill failed:', err.message)
  try { await mongoose.disconnect() } catch { /* not connected */ }
  process.exit(1)
})
