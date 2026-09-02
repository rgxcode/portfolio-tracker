/**
 * Fold duplicate holdings into one row each, then enforce that they stay that
 * way.
 *
 * Adding to a holding used to create a second row rather than fold into the
 * first, so a book can already contain the same asset several times over —
 * fifteen Tesla shares in one row and two in another, or the same coin under
 * "Ether" and "Ethereum". The route no longer does this, but it cannot fix
 * what is already stored.
 *
 * Rows are grouped by owner, type, and symbol compared case-insensitively.
 * Each group collapses into its oldest row: the quantities sum and the
 * purchase price becomes the quantity-weighted average, which is what the
 * average cost of a position means. The oldest row's name survives, so a
 * holding does not rename itself as a side effect of being tidied.
 *
 * Dry by default — it prints what it would do and changes nothing. Pass
 * --apply to write, which is also when the unique index is created; the index
 * cannot be built while duplicates are still present, which is why it lives
 * here rather than in the schema.
 *
 *   node scripts/merge-duplicate-assets.mjs            # show me
 *   node scripts/merge-duplicate-assets.mjs --apply    # do it
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import Asset from '../src/models/Asset.js'

// Read .env the way the rest of the backend does — by hand, rather than
// adding a dependency for one file.
const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envContent = readFileSync(resolve(__dirname, '..', '.env'), 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim()
  }
} catch {
  // No .env — rely on the environment.
}

const APPLY = process.argv.includes('--apply')
const MONGO_URL = process.env.MONGODB_URI

if (!MONGO_URL) {
  console.error('MONGODB_URI is not set — nothing to connect to.')
  process.exit(1)
}

const money = n => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`

async function main() {
  await mongoose.connect(MONGO_URL, { serverSelectionTimeoutMS: 8000 })
  console.log(`Connected. Mode: ${APPLY ? 'APPLY (will write)' : 'dry run (no changes)'}`)
  console.log('')

  // Oldest first, so the row a group collapses into is the original holding.
  const assets = await Asset.find({}).sort({ createdAt: 1 })

  const groups = new Map()
  for (const a of assets) {
    const key = [String(a.userId), a.type, String(a.symbol).trim().toUpperCase()].join(' ')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(a)
  }

  const duplicated = [...groups.values()].filter(g => g.length > 1)

  if (duplicated.length === 0) {
    console.log('No duplicate holdings found.')
  }

  let removed = 0

  for (const group of duplicated) {
    const [keep, ...rest] = group
    const totalQty = group.reduce((sum, a) => sum + a.quantity, 0)
    const avgCost = totalQty > 0
      ? group.reduce((sum, a) => sum + a.quantity * a.purchasePrice, 0) / totalQty
      : keep.purchasePrice

    console.log(`${keep.symbol} (${keep.type}) — ${group.length} rows into 1`)
    for (const a of group) {
      const marker = a === keep ? '   [keeping this row]' : ''
      console.log(`    ${a.quantity} @ ${money(a.purchasePrice)}  "${a.name}"${marker}`)
    }
    console.log(`  = ${totalQty} @ ${money(avgCost)} averaged, named "${keep.name}"`)
    console.log('')

    if (APPLY) {
      keep.quantity = totalQty
      keep.purchasePrice = avgCost
      keep.symbol = String(keep.symbol).trim().toUpperCase()
      await keep.save()
      await Asset.deleteMany({ _id: { $in: rest.map(a => a._id) } })
      removed += rest.length
    }
  }

  if (APPLY) {
    // Normalise the case of every surviving symbol. The unique index uses a
    // case-insensitive collation, but storing them consistently means the
    // route's exact-match paths agree with it too.
    const survivors = await Asset.find({})
    let renamed = 0
    for (const a of survivors) {
      const upper = String(a.symbol).trim().toUpperCase()
      if (a.symbol !== upper) {
        await Asset.updateOne({ _id: a._id }, { symbol: upper })
        renamed++
      }
    }

    console.log(`Merged away ${removed} duplicate row${removed === 1 ? '' : 's'}.`)
    if (renamed) console.log(`Normalised the case of ${renamed} symbol${renamed === 1 ? '' : 's'}.`)

    try {
      await Asset.collection.createIndex(
        { userId: 1, type: 1, symbol: 1 },
        { unique: true, collation: { locale: 'en', strength: 2 }, name: 'one_row_per_holding' },
      )
      console.log('Unique index "one_row_per_holding" is in place.')
    } catch (err) {
      console.error(`Could not create the unique index: ${err.message}`)
      console.error('The merge itself succeeded; re-run once the conflict above is resolved.')
    }
  } else if (duplicated.length) {
    console.log('Nothing was changed. Re-run with --apply to write these merges.')
  }

  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
