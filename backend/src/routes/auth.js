import { Router } from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import auth from '../middleware/auth.js'
import { isAdminEmail } from '../admins.js'

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
  }
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

// POST /api/auth/signup
router.post('/signup', async (req, res, next) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() })
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }

    const passwordHash = await User.hashPassword(password)
    const user = await User.create({ email: email.toLowerCase().trim(), passwordHash })

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
