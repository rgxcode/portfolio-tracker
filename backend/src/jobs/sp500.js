/**
 * The S&P 500 membership list, with each company's GICS classification.
 *
 * Sourced from the `datasets/s-and-p-500-companies` repository, which tracks the
 * Wikipedia table. Scraping Wikipedia directly would mean parsing HTML that
 * changes shape without warning; a published CSV is the same data with a stable
 * contract.
 */

import Constituent from '../models/Constituent.js'
import { formatCET } from './marketHours.js'

const SOURCE =
  'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv'

const log = (...a) => console.log(`[${formatCET()}] sp500:`, ...a)

/**
 * Minimal CSV reader for this one file.
 *
 * Only quoted fields containing commas need handling — "Saint Paul, Minnesota"
 * is the case that breaks a naive split. Escaped quotes do not occur here, and
 * pulling in a parser for one well-known file would be the heavier choice.
 */
function parseCsv(text) {
  const rows = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const cells = []
    let cur = ''
    let quoted = false
    for (const ch of line) {
      if (ch === '"') quoted = !quoted
      else if (ch === ',' && !quoted) { cells.push(cur); cur = '' }
      else cur += ch
    }
    cells.push(cur)
    rows.push(cells.map(c => c.trim()))
  }
  return rows
}

/** Fetch the current list and replace what is stored. Returns the tickers. */
export async function refreshConstituents() {
  const res = await fetch(SOURCE, {
    headers: { 'User-Agent': 'portfolio-tracker' },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`constituents: HTTP ${res.status}`)

  const rows = parseCsv(await res.text())
  const [header, ...body] = rows
  const col = name => header.indexOf(name)

  const iSym = col('Symbol')
  const iName = col('Security')
  const iSector = col('GICS Sector')
  const iSub = col('GICS Sub-Industry')
  const iHq = col('Headquarters Location')
  const iAdded = col('Date added')
  const iCik = col('CIK')
  if (iSym === -1) throw new Error('constituents: no Symbol column')

  const now = new Date()
  const ops = []
  for (const r of body) {
    // Yahoo writes class shares with a dash where the index uses a dot.
    const symbol = (r[iSym] ?? '').toUpperCase().replace(/\./g, '-')
    if (!symbol) continue
    ops.push({
      updateOne: {
        filter: { _id: symbol },
        update: {
          $set: {
            name: r[iName], sector: r[iSector], subIndustry: r[iSub],
            headquarters: r[iHq], dateAdded: r[iAdded],
            // EDGAR keys on a zero-padded ten-digit CIK; the CSV drops the padding.
            cik: iCik !== -1 && r[iCik] ? String(r[iCik]).padStart(10, '0') : null,
            updatedAt: now,
          },
        },
        upsert: true,
      },
    })
  }

  if (ops.length < 400) throw new Error(`constituents: only ${ops.length} rows, refusing to store`)

  await Constituent.bulkWrite(ops, { ordered: false })

  // Companies leave the index too; drop anything this refresh did not mention.
  const removed = await Constituent.deleteMany({ updatedAt: { $lt: now } })
  log(`${ops.length} members stored, ${removed.deletedCount} removed`)

  return ops.map(o => o.updateOne.filter._id)
}

/** Tickers currently stored, refreshing first if the collection is empty. */
export async function constituentSymbols() {
  const count = await Constituent.estimatedDocumentCount()
  if (count === 0) return refreshConstituents()
  const docs = await Constituent.find({}, { _id: 1 }).lean()
  return docs.map(d => d._id)
}

/**
 * Companies in the same GICS sub-industry — an actual peer group.
 * Falls back to the broader sector when a sub-industry has too few members.
 */
export async function sectorPeers(symbol, limit = 6) {
  const me = await Constituent.findById(String(symbol).toUpperCase()).lean()
  if (!me) return []

  const pick = async filter =>
    Constituent.find({ ...filter, _id: { $ne: me._id } }, { _id: 1, name: 1 })
      .limit(limit)
      .lean()

  let peers = me.subIndustry ? await pick({ subIndustry: me.subIndustry }) : []
  if (peers.length < 3 && me.sector) peers = await pick({ sector: me.sector })

  return peers.map(p => p._id)
}
