/**
 * The universe of US-listed companies, from the SEC's published ticker file.
 *
 * https://www.sec.gov/files/company_tickers.json — about 10,000 entries mapping
 * ticker to CIK, which is the key to everything else: filings, statements, and
 * therefore computed ratios. Official, free, and unmetered.
 */

import Listing from '../models/Listing.js'
import Constituent from '../models/Constituent.js'
import { formatCET } from './marketHours.js'

const SOURCE = 'https://www.sec.gov/files/company_tickers.json'
const UA = process.env.SEC_USER_AGENT || 'portfolio-tracker (ranajoy121@gmail.com)'

const log = (...a) => console.log(`[${formatCET()}] listings:`, ...a)

export async function refreshListings() {
  const res = await fetch(SOURCE, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`listings: HTTP ${res.status}`)

  const rows = Object.values(await res.json())
  if (rows.length < 1000) throw new Error(`listings: only ${rows.length} rows, refusing to store`)

  // Which tickers are index members, so search can favour the recognisable.
  const members = new Set(
    (await Constituent.find({}, { _id: 1 }).lean()).map(c => c._id),
  )

  const now = new Date()
  const seen = new Set()
  const ops = []
  for (const r of rows) {
    // Class shares use a dash on Yahoo where the SEC file uses none.
    const ticker = String(r.ticker ?? '').toUpperCase().replace(/\./g, '-')
    if (!ticker || seen.has(ticker)) continue
    seen.add(ticker)
    ops.push({
      updateOne: {
        filter: { _id: ticker },
        update: {
          $set: {
            cik: String(r.cik_str).padStart(10, '0'),
            name: r.title,
            inIndex: members.has(ticker),
            updatedAt: now,
          },
        },
        upsert: true,
      },
    })
  }

  // Chunked: a single bulkWrite of ten thousand operations is a large payload
  // for a shared-tier database to accept in one go.
  for (let i = 0; i < ops.length; i += 2000) {
    await Listing.bulkWrite(ops.slice(i, i + 2000), { ordered: false })
  }

  const removed = await Listing.deleteMany({ updatedAt: { $lt: now } })
  log(`${ops.length} listings stored, ${removed.deletedCount} delisted`)
  return ops.length
}

/** CIK for a ticker, from the index record first and the wider file second. */
export async function cikFor(symbol) {
  const s = String(symbol).toUpperCase()
  const member = await Constituent.findById(s, { cik: 1 }).lean()
  if (member?.cik) return member.cik
  const listed = await Listing.findById(s, { cik: 1 }).lean()
  return listed?.cik ?? null
}
