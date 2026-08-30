/**
 * Sign in with Google, via the authorization-code flow.
 *
 * The code exchange needs the client secret, so it has to happen on a server —
 * which is why this lives in the API rather than the frontend. The frontend is
 * a static bundle; a secret shipped to a browser is not a secret.
 *
 * No OAuth library: Google's endpoints are three plain HTTP calls, and a
 * dependency here would be more surface area than code.
 */

import jwt from 'jsonwebtoken'

const AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN = 'https://oauth2.googleapis.com/token'
const USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

/** Where Google sends the browser back to. Must match the console exactly. */
export function callbackUrl() {
  const base = process.env.API_BASE_URL
  if (!base) throw new Error('API_BASE_URL is not set — Google would redirect nowhere')
  return `${base.replace(/\/$/, '')}/api/auth/google/callback`
}

/**
 * The `state` parameter, signed rather than stored.
 *
 * It exists to prove the callback belongs to a flow this server started —
 * without it, an attacker can feed a victim a callback URL and log them into
 * the attacker's account. Signing it keeps the check stateless, which matters
 * on an instance that sleeps and loses memory between requests.
 */
export function signState(payload = {}) {
  return jwt.sign({ ...payload, purpose: 'oauth-state' }, JWT_SECRET, { expiresIn: '10m' })
}

export function verifyState(state) {
  try {
    const decoded = jwt.verify(state, JWT_SECRET)
    return decoded.purpose === 'oauth-state' ? decoded : null
  } catch {
    return null
  }
}

export function authorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    // Ask for an account chooser rather than silently reusing whichever Google
    // session the browser happens to hold.
    prompt: 'select_account',
  })
  return `${AUTHORIZE}?${params}`
}

/** Swap the one-time code for an access token, then read the profile. */
export async function exchangeCode(code) {
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl(),
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`token exchange failed: ${res.status} ${detail.slice(0, 200)}`)
  }

  const { access_token: accessToken } = await res.json()
  if (!accessToken) throw new Error('no access token returned')

  const profileRes = await fetch(USERINFO, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!profileRes.ok) throw new Error(`profile fetch failed: ${profileRes.status}`)

  const p = await profileRes.json()
  if (!p.sub || !p.email) throw new Error('profile missing subject or email')

  return {
    providerId: p.sub,
    email: String(p.email).toLowerCase().trim(),
    // Google returns this as a boolean or the string "true" depending on path.
    emailVerified: p.email_verified === true || p.email_verified === 'true',
    name: p.name ?? null,
    avatarUrl: p.picture ?? null,
  }
}
