import { Router } from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import Asset from '../models/Asset.js'
import auth from '../middleware/auth.js'
import { isAdminEmail } from '../admins.js'
import {
  googleConfigured, authorizeUrl, exchangeCode, signState, verifyState,
} from '../auth/google.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'
const JWT_EXPIRES_IN = '7d'

/**
 * The client-facing shape of a user. isAdmin is derived here rather than stored
 * on the document or put in the token, so it always reflects current
 * configuration - see admins.js. It only drives what the UI offers; every
 * admin route checks for itself.
 */
function shapeUser(user) {
  return {
    id: user._id,
    email: user.email,
    isAdmin: isAdminEmail(user.email),
    name: user.name ?? null,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    // Lets the account page hide a password form that could not work.
    hasPassword: Boolean(user.passwordHash),
    providers: (user.providers ?? []).map(p => p.provider),
  }
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

/** Where the browser is sent back to once we have minted a token. */
function frontendUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '')
}

/**
 * GET /api/auth/providers — what sign-in methods this deployment offers.
 * Lets the page show a Google button only where it would actually work.
 */
router.get('/providers', (_req, res) => {
  res.json({ password: true, google: googleConfigured() })
})

// GET /api/auth/google — start the flow.
router.get('/google', (req, res) => {
  if (!googleConfigured()) {
    return res.status(503).json({ error: 'Google sign-in is not configured on this server' })
  }
  res.redirect(authorizeUrl(signState()))
})

/**
 * GET /api/auth/google/callback — Google sends the browser here with a code.
 *
 * Errors redirect back to the sign-in page carrying a short reason rather than
 * rendering JSON: the user is mid-navigation in a browser, and a raw error
 * object is a dead end for them.
 */
router.get('/google/callback', async (req, res, next) => {
  const fail = reason =>
    res.redirect(`${frontendUrl()}/auth?error=${encodeURIComponent(reason)}`)

  try {
    if (!googleConfigured()) return fail('Google sign-in is not configured')
    if (req.query.error) return fail(String(req.query.error))
    if (!req.query.code) return fail('No authorization code returned')
    if (!verifyState(String(req.query.state ?? ''))) return fail('Sign-in link expired — try again')

    const profile = await exchangeCode(String(req.query.code))

    // Match on the provider's subject id first: it is stable even if the
    // person later changes the address on their Google account.
    let user = await User.findOne({
      providers: { $elemMatch: { provider: 'google', providerId: profile.providerId } },
    })

    if (!user) {
      const existing = await User.findOne({ email: profile.email })

      if (existing) {
        /**
         * Linking by email is only safe when the provider has verified it.
         * Otherwise anyone could register a provider account claiming someone
         * else's address and inherit their portfolio.
         */
        if (!profile.emailVerified) {
          return fail('Google has not verified this email address')
        }
        existing.providers.push({
          provider: 'google', providerId: profile.providerId, email: profile.email,
        })
        existing.emailVerified = true
        existing.name = existing.name || profile.name
        existing.avatarUrl = existing.avatarUrl || profile.avatarUrl
        await existing.save()
        user = existing
      } else {
        user = await User.create({
          email: profile.email,
          emailVerified: profile.emailVerified,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          providers: [{
            provider: 'google', providerId: profile.providerId, email: profile.email,
          }],
        })
      }
    }

    /**
     * The token travels in the fragment, not the query string: a fragment is
     * never sent to a server and stays out of Referer headers and server logs.
     */
    res.redirect(`${frontendUrl()}/auth#token=${encodeURIComponent(signToken(user._id))}`)
  } catch (err) {
    // Genuine faults still surface in the server log; the user gets a sentence.
    console.error('google callback:', err.message)
    if (!res.headersSent) return fail('Could not complete Google sign-in')
    next(err)
  }
})

// POST /api/auth/signup
router.post('/signup', async (req, res, next) => {
  try {
    const { email, password } = req.body
    // Trimmed before the emptiness check, so a field of spaces is not a name.
    const firstName = String(req.body?.firstName ?? '').trim()
    const lastName = String(req.body?.lastName ?? '').trim()

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'First name and last name are required' })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() })
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }

    const passwordHash = await User.hashPassword(password)
    const user = await User.create({
      email: email.toLowerCase().trim(),
      passwordHash,
      firstName,
      lastName,
      // Kept in step with the halves so the avatar and menu have one field to
      // read, whichever way the account was created.
      name: `${firstName} ${lastName}`,
    })

    const token = signToken(user._id)
    res.status(201).json({ token, user: shapeUser(user) })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() })
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const valid = await user.comparePassword(password)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const token = signToken(user._id)
    res.json({ token, user: shapeUser(user) })
  } catch (err) {
    next(err)
  }
})

// POST /api/auth/change-password (protected)
router.post('/change-password', auth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {}

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both the current and new password are required' })
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' })
    }
    if (newPassword === currentPassword) {
      return res.status(400).json({ error: 'New password must differ from the current one' })
    }

    const user = await User.findById(req.userId)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    if (!user.hasPassword()) {
      // Signed up through a provider, so there is nothing to verify against.
      return res.status(400).json({
        error: 'This account signs in with Google and has no password to change',
      })
    }

    // Re-check the current password even though the request is authenticated:
    // a token alone should not be enough to take over an account, since it may
    // have been left behind on a shared machine.
    const valid = await user.comparePassword(currentPassword)
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' })
    }

    user.passwordHash = await User.hashPassword(newPassword)
    await user.save()

    // A fresh token, so the response cannot be mistaken for having invalidated
    // the old one. Existing tokens stay valid until they expire - revoking them
    // would need a token store, which this app does not have.
    res.json({ token: signToken(user._id), user: shapeUser(user) })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/auth/export — everything held about the caller, as JSON.
 *
 * The right of access and to portability under GDPR. Personal data lives in
 * exactly two collections; prices and filings are public market data shared by
 * every account, so they are not part of anyone's record.
 */
router.get('/export', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).lean()
    if (!user) return res.status(404).json({ error: 'User not found' })

    const assets = await Asset.find({ userId: req.userId }).lean()

    // The hash is deliberately excluded: it is a credential, and handing back a
    // bcrypt digest helps an attacker who obtained the export, not the person.
    const { passwordHash, ...safe } = user

    res.setHeader('Content-Disposition', 'attachment; filename="portfolio-tracker-export.json"')
    res.json({
      exportedAt: new Date().toISOString(),
      account: {
        ...safe,
        hasPassword: Boolean(passwordHash),
      },
      holdings: assets.map(({ userId, ...a }) => a),
      note: 'Prices and company filings are public market data shared by all accounts and are not personal data.',
    })
  } catch (err) {
    next(err)
  }
})

/**
 * DELETE /api/auth/account — erase the account and everything in it.
 *
 * The right to erasure. Irreversible and immediate: there is no soft-delete
 * flag, because a record marked deleted is still a record being kept.
 *
 * Confirmation is by typing the address, which is deliberate friction on an
 * action nothing can undo. A password account must also supply its password —
 * a token left open on a shared machine should not be enough to destroy data.
 */
router.delete('/account', auth, async (req, res, next) => {
  try {
    const { confirmEmail, password } = req.body ?? {}

    const user = await User.findById(req.userId)
    if (!user) return res.status(404).json({ error: 'User not found' })

    if (String(confirmEmail ?? '').toLowerCase().trim() !== user.email) {
      return res.status(400).json({ error: 'Type your email address exactly to confirm' })
    }

    if (user.hasPassword()) {
      if (!password) return res.status(400).json({ error: 'Your password is required' })
      if (!(await user.comparePassword(password))) {
        return res.status(401).json({ error: 'Password is incorrect' })
      }
    }

    const { deletedCount } = await Asset.deleteMany({ userId: user._id })
    await User.deleteOne({ _id: user._id })

    res.json({ deleted: true, holdingsRemoved: deletedCount })
  } catch (err) {
    next(err)
  }
})

// GET /api/auth/me — get current user (protected)
router.get('/me', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select('-passwordHash')
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    res.json(shapeUser(user))
  } catch (err) {
    next(err)
  }
})

export default router
