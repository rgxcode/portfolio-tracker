import User from '../models/User.js'
import { isAdminEmail } from '../admins.js'

/**
 * Gate for admin-only routes. Run it after `auth`, which establishes req.userId.
 *
 * The token deliberately carries no admin claim: a claim minted at login would
 * keep working for the rest of the token's 7-day life after someone stopped
 * being an admin. Reading the address from the database on each request costs
 * one indexed lookup and is always current.
 */
export default async function requireAdmin(req, res, next) {
  try {
    const user = await User.findById(req.userId).select('email')
    if (!user || !isAdminEmail(user.email)) {
      // Deliberately the same response for "not an admin" and "no such user":
      // a distinct message would confirm which addresses are privileged.
      return res.status(403).json({ error: 'Administrator access required' })
    }
    req.userEmail = user.email
    next()
  } catch (err) {
    next(err)
  }
}
