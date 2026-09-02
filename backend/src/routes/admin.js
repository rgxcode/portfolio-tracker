import { Router } from 'express'
import mongoose from 'mongoose'
import auth from '../middleware/auth.js'
import requireAdmin from '../middleware/requireAdmin.js'
import User from '../models/User.js'
import Asset from '../models/Asset.js'
import PriceHistory from '../models/PriceHistory.js'
import { loadSnapshot, STANDARD, LLM } from '../jobs/snapshotStore.js'
import { usage as rateUsage } from '../jobs/rateBudget.js'
import { stockWindowStatus, isStockWindowOpen, formatCET } from '../jobs/marketHours.js'
import { refresherStatus } from '../agents/llmRefresher.js'
import { adminEmails, isAdminEmail } from '../admins.js'

const router = Router()

// Everything here is operational data about the deployment, so nothing may be
// cached and every route is admin-only.
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})
router.use(auth, requireAdmin)

/**
 * Storage ceiling to measure against. Atlas' free M0 tier allows 512MB, which
 * is the plan this runs on; a different tier can override it without a release.
 */
const STORAGE_LIMIT_MB = Number(process.env.DB_STORAGE_LIMIT_MB ?? 512)

const MB = 1024 * 1024

/** Age in minutes, or null when the timestamp is missing. */
function ageMinutes(value) {
  if (!value) return null
  return Math.round((Date.now() - new Date(value).getTime()) / 60000)
}

/**
 * Per-collection sizes.
 *
 * $collStats is not guaranteed on every tier, so a failure here degrades to
 * document counts rather than failing the whole page — knowing a collection has
 * 18,000 documents is still useful when its byte size is unavailable.
 */
async function collectionBreakdown(db) {
  const names = (await db.listCollections().toArray())
    .map(c => c.name)
    .filter(n => !n.startsWith('system.'))
    .sort()

  return Promise.all(names.map(async (name) => {
    try {
      const [stats] = await db
        .collection(name)
        .aggregate([{ $collStats: { storageStats: {} } }])
        .toArray()
      const s = stats?.storageStats ?? {}
      return {
        name,
        documents: s.count ?? null,
        dataMB: s.size != null ? +(s.size / MB).toFixed(2) : null,
        storageMB: s.storageSize != null ? +(s.storageSize / MB).toFixed(2) : null,
        indexMB: s.totalIndexSize != null ? +(s.totalIndexSize / MB).toFixed(2) : null,
      }
    } catch {
      return {
        name,
        documents: await db.collection(name).estimatedDocumentCount().catch(() => null),
        dataMB: null,
        storageMB: null,
        indexMB: null,
        note: 'size unavailable on this tier',
      }
    }
  }))
}

/** Totals for the database as a whole, plus how close it is to the plan limit. */
async function databaseUsage(db) {
  const stats = await db.stats()
  const dataMB = +(stats.dataSize / MB).toFixed(2)
  const storageMB = +(stats.storageSize / MB).toFixed(2)
  const indexMB = +(stats.indexSize / MB).toFixed(2)

  // Atlas counts data + indexes against the quota, not the on-disk storageSize,
  // so that is what the percentage is based on.
  const countedMB = +(dataMB + indexMB).toFixed(2)

  return {
    name: db.databaseName,
    collections: stats.collections,
    documents: stats.objects,
    dataMB,
    storageMB,
    indexMB,
    countedMB,
    limitMB: STORAGE_LIMIT_MB,
    percentUsed: +((countedMB / STORAGE_LIMIT_MB) * 100).toFixed(1),
  }
}

/** How current each price snapshot is, and who wrote it. */
async function snapshots() {
  const [standard, llm] = await Promise.all([
    loadSnapshot(STANDARD),
    loadSnapshot(LLM),
  ])

  return {
    standard: standard && {
      updatedAt: standard.updatedAt,
      updatedAtCET: standard.updatedAtCET,
      ageMinutes: ageMinutes(standard.updatedAt),
      cryptoCount: Object.keys(standard.crypto ?? {}).length,
      stocksCount: Object.keys(standard.stocks ?? {}).length,
      stocksUpdatedAtCET: standard.stocksUpdatedAtCET ?? null,
    },
    llm: llm && {
      updatedAt: llm.updatedAt,
      updatedAtCET: llm.updatedAtCET,
      ageMinutes: ageMinutes(llm.updatedAt),
      method: llm.method,
      costUsd: llm.costUsd,
      symbols: Object.keys(llm.prices ?? {}),
      errors: llm.errors ?? 0,
      failures: llm.failures ?? null,
    },
  }
}

/** Coverage of the stored history the charts are drawn from. */
async function history() {
  const [total, symbols, newest, oldest] = await Promise.all([
    PriceHistory.estimatedDocumentCount(),
    PriceHistory.distinct('symbol'),
    PriceHistory.findOne().sort({ ts: -1 }).select('symbol ts').lean(),
    PriceHistory.findOne().sort({ ts: 1 }).select('symbol ts').lean(),
  ])

  return {
    points: total,
    symbols: symbols.length,
    newest: newest?.ts ?? null,
    newestAgeMinutes: ageMinutes(newest?.ts),
    oldest: oldest?.ts ?? null,
    spanDays: oldest && newest
      ? Math.round((new Date(newest.ts) - new Date(oldest.ts)) / 86400e3)
      : null,
  }
}

// GET /api/admin/overview — everything the admin page renders.
router.get('/overview', async (_req, res, next) => {
  try {
    const db = mongoose.connection.db
    const connected = mongoose.connection.readyState === 1
    if (!connected || !db) {
      return res.status(503).json({ error: 'Database not connected' })
    }

    const [database, collections, snaps, hist, rate, users, assets] = await Promise.all([
      databaseUsage(db),
      collectionBreakdown(db),
      snapshots(),
      history(),
      rateUsage(),
      User.countDocuments(),
      Asset.countDocuments(),
    ])

    res.json({
      generatedAt: new Date().toISOString(),
      generatedAtCET: formatCET(),
      admins: adminEmails(),
      database,
      collections,
      snapshots: snaps,
      history: hist,
      rateBudget: rate,
      // stockWindowStatus() is prose for a log line; the flag is what the UI
      // renders, so send both rather than parsing the sentence client-side.
      market: { open: isStockWindowOpen(), reason: stockWindowStatus() },
      llmRefresher: refresherStatus(),
      counts: { users, assets },
      process: {
        node: process.version,
        uptimeHours: +(process.uptime() / 3600).toFixed(2),
        // Resident set size: what the instance is actually holding, which is
        // what a 512MB container runs out of.
        rssMB: +(process.memoryUsage().rss / MB).toFixed(1),
        heapUsedMB: +(process.memoryUsage().heapUsed / MB).toFixed(1),
      },
    })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/admin/users — who has an account, and what they hold.
 *
 * Selected field by field rather than fetched whole and trimmed afterwards.
 * Two things must never leave the database here: `passwordHash`, which is a
 * credential an operator has no use for and every reason not to handle, and
 * each provider's subject identifier, which is the key to someone's Google
 * account rather than a fact about their use of this app. Naming the fields
 * wanted means a column added to the user schema later cannot quietly start
 * appearing in this response.
 *
 * Holdings are counted per user in one aggregate rather than a query each, so
 * the cost does not grow with the number of accounts.
 */
router.get('/users', async (req, res, next) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200))

    const users = await User.find(
      {},
      {
        email: 1,
        name: 1,
        firstName: 1,
        lastName: 1,
        emailVerified: 1,
        avatarUrl: 1,
        createdAt: 1,
        updatedAt: 1,
        // The names of linked providers are useful — "how does this person sign
        // in" — while the ids behind them are not, so only the names are read.
        'providers.provider': 1,
        'providers.linkedAt': 1,
        // Selected only to answer "can this account use a password at all". The
        // value is turned into a boolean below and never serialised.
        passwordHash: 1,
      },
    )
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()

    const holdings = await Asset.aggregate([
      {
        $group: {
          _id: '$userId',
          assets: { $sum: 1 },
          // Best-effort: `currentPrice` is whatever the last refresh wrote, so
          // this is the same figure the person sees on their own dashboard.
          value: { $sum: { $multiply: ['$currentPrice', '$quantity'] } },
          types: { $addToSet: '$type' },
        },
      },
    ])
    const byUser = new Map(holdings.map(h => [String(h._id), h]))

    res.json({
      total: await User.countDocuments(),
      limit,
      users: users.map((u) => {
        const h = byUser.get(String(u._id))
        return {
          id: String(u._id),
          email: u.email,
          name: u.name || [u.firstName, u.lastName].filter(Boolean).join(' ') || null,
          emailVerified: Boolean(u.emailVerified),
          avatarUrl: u.avatarUrl ?? null,
          isAdmin: isAdminEmail(u.email),
          // A boolean, never the hash itself.
          hasPassword: Boolean(u.passwordHash),
          providers: (u.providers ?? []).map(p => p.provider),
          createdAt: u.createdAt ?? null,
          updatedAt: u.updatedAt ?? null,
          assets: h?.assets ?? 0,
          portfolioValue: h ? +h.value.toFixed(2) : 0,
          types: (h?.types ?? []).sort(),
        }
      }),
    })
  } catch (err) {
    next(err)
  }
})

export default router
