/**
 * Recording and housekeeping for the price history collection.
 *
 * Every scheduled run appends the current quotes as points. Over time this
 * becomes our own time series, which is what the charts draw — no third party
 * involved at request time.
 */

import PriceHistory from '../models/PriceHistory.js'

/** Intraday points older than this are thinned to one per day. */
const INTRADAY_RETENTION_DAYS = 30

/**
 * Append one point per quote. Uses an idempotent upsert on (symbol, ts) so a
 * re-run — or a source that hasn't ticked since the last poll — can't create
 * duplicates.
 */
export async function recordSnapshot(quotes, log = console.log) {
  const ops = Object.values(quotes)
    .filter(q => typeof q.price === 'number' && q.asOf)
    .map(q => ({
      updateOne: {
        filter: { symbol: q.symbol.toUpperCase(), ts: new Date(q.asOf) },
        update: {
          $set: {
            symbol: q.symbol.toUpperCase(),
            type: q.type,
            ts: new Date(q.asOf),
            price: q.price,
            source: q.source ?? null,
            granularity: 'intraday',
          },
        },
        upsert: true,
      },
    }))

  if (ops.length === 0) return { inserted: 0 }

  const res = await PriceHistory.bulkWrite(ops, { ordered: false })
  const inserted = res.upsertedCount ?? 0
  log?.(`  history: +${inserted} new point(s) from ${ops.length} quote(s)`)
  return { inserted }
}

/**
 * Thin old intraday data: beyond the retention window we keep only the last
 * point of each day. Charts at those ranges plot daily resolution anyway, so
 * nothing visible is lost and the collection stops growing without bound.
 */
export async function pruneIntraday(log = console.log) {
  const cutoff = new Date(Date.now() - INTRADAY_RETENTION_DAYS * 86400000)

  const survivors = await PriceHistory.aggregate([
    { $match: { ts: { $lt: cutoff }, granularity: 'intraday' } },
    {
      $group: {
        _id: {
          symbol: '$symbol',
          day: { $dateToString: { format: '%Y-%m-%d', date: '$ts' } },
        },
        keep: { $last: '$_id' },
      },
    },
  ])

  if (survivors.length === 0) return { removed: 0 }

  const keepIds = survivors.map(s => s.keep)
  const res = await PriceHistory.deleteMany({
    ts: { $lt: cutoff },
    granularity: 'intraday',
    _id: { $nin: keepIds },
  })

  // What survives stands in for the day, so relabel it.
  await PriceHistory.updateMany(
    { _id: { $in: keepIds } },
    { $set: { granularity: 'daily' } },
  )

  if (res.deletedCount > 0) log?.(`  history: pruned ${res.deletedCount} old intraday point(s)`)
  return { removed: res.deletedCount }
}
