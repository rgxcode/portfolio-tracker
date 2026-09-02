/**
 * The universe of US-listed securities, from two published files.
 *
 * https://www.sec.gov/files/company_tickers.json — about 10,000 entries mapping
 * ticker to CIK, which is the key to everything else: filings, statements, and
 * therefore computed ratios. Official, free, and unmetered.
 *
 * https://www.nasdaqtrader.com/dynamic/symdir/nasdaqtraded.txt — every symbol
 * actually trading, with a flag for which are funds. The SEC file alone could
 * not offer ETFs: a fund organised as a series of a trust files under the
 * umbrella rather than per fund, so SOXX, SMH, VOO and XLK are absent from it
 * entirely, while SPY and GLD — their own trusts — are present. Searching for a
 * semiconductor ETF therefore returned nothing at all.
 *
 * Both are loaded in the same run on purpose. The sweep at the end removes
 * anything this run did not touch, so a second job writing ETFs separately
 * would have them deleted by the next run of this one.
 */

import Listing from '../models/Listing.js'
import Constituent from '../models/Constituent.js'
import { formatCET } from './marketHours.js'

const SEC_SOURCE = 'https://www.sec.gov/files/company_tickers.json'
const NASDAQ_SOURCE = 'https://www.nasdaqtrader.com/dynamic/symdir/nasdaqtraded.txt'
const UA = process.env.SEC_USER_AGENT || 'portfolio-tracker (ranajoy121@gmail.com)'

const log = (...a) => console.log(`[${formatCET()}] listings:`, ...a)

/**
 * Yahoo writes class shares and units with a dash where these files use a dot
 * or a slash. Prices are fetched by this symbol, so it has to match Yahoo's.
 */
function normalise(ticker) {
  return String(ticker ?? '').toUpperCase().trim().replace(/[./]/g, '-')
}

/** Ticker → CIK and name, for everything that files with the SEC. */
async function fetchSec() {
  const res = await fetch(SEC_SOURCE, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`listings: SEC HTTP ${res.status}`)

  const rows = Object.values(await res.json())
  if (rows.length < 1000) throw new Error(`listings: only ${rows.length} SEC rows, refusing to store`)

  const out = new Map()
  for (const r of rows) {
    const ticker = normalise(r.ticker)
    if (!ticker || out.has(ticker)) continue
    out.set(ticker, { cik: String(r.cik_str).padStart(10, '0'), name: r.title })
  }
  return out
}

/**
 * Ticker → name and fund flag, for everything actually trading.
 *
 * Pipe-delimited with a header row and a "File Creation Time" footer, neither
 * of which is a security. Test issues are excluded: they are exchange plumbing
 * that nobody can hold.
 */
async function fetchNasdaq() {
  const res = await fetch(NASDAQ_SOURCE, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`listings: Nasdaq HTTP ${res.status}`)

  const lines = (await res.text()).split('\n')
  const out = new Map()

  for (const line of lines) {
    const p = line.trimEnd().split('|')
    // Columns: traded, symbol, name, exchange, category, etf, lot, test, …
    if (p.length < 8) continue
    if (p[0] === 'Nasdaq Traded' || p[0].startsWith('File Creation Time')) continue
    if (p[7] !== 'N') continue

    const ticker = normalise(p[1])
    if (!ticker || out.has(ticker)) continue
    out.set(ticker, { name: p[2]?.trim() || ticker, isEtf: p[5] === 'Y' })
  }

  if (out.size < 1000) {
    throw new Error(`listings: only ${out.size} Nasdaq rows, refusing to store`)
  }
  return out
}

export async function refreshListings() {
  // Fetched together so one slow source does not double the run, and so a
  // failure in either aborts before anything is written — a half-loaded
  // universe would have the sweep below delete whatever was missing.
  const [sec, nasdaq] = await Promise.all([fetchSec(), fetchNasdaq()])

  // Which tickers are index members, so search can favour the recognisable.
  const members = new Set(
    (await Constituent.find({}, { _id: 1 }).lean()).map(c => c._id),
  )

  const now = new Date()
  const ops = []
  let funds = 0

  for (const ticker of new Set([...sec.keys(), ...nasdaq.keys()])) {
    const s = sec.get(ticker)
    const n = nasdaq.get(ticker)
    if (n?.isEtf) funds++

    ops.push({
      updateOne: {
        filter: { _id: ticker },
        update: {
          $set: {
            // The SEC's CIK where there is one; a fund simply has none.
            cik: s?.cik ?? null,
            // The SEC's title is the legal entity and reads better for a
            // company; Nasdaq's is the only name a fund has here.
            name: s?.name ?? n?.name ?? ticker,
            isEtf: n?.isEtf ?? false,
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
  log(`${ops.length} listings stored (${funds} funds), ${removed.deletedCount} delisted`)
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
