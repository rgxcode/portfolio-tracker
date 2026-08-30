/**
 * Who counts as an administrator.
 *
 * Kept as a list of addresses rather than a flag on the user document: there is
 * exactly one admin, and storing it in the database would mean the answer could
 * drift between the local and deployed copies, or be changed by anyone who
 * reaches the data. Deployment configuration is the right place for it.
 *
 * Override with ADMIN_EMAILS (comma-separated) to change it without a release.
 */
const DEFAULT_ADMINS = ['ranajoy121@gmail.com']

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)

const ADMINS = ADMIN_EMAILS.length > 0 ? ADMIN_EMAILS : DEFAULT_ADMINS

/** Addresses are stored lowercased, but compare defensively anyway. */
export function isAdminEmail(email) {
  if (!email) return false
  return ADMINS.includes(String(email).toLowerCase().trim())
}

export function adminEmails() {
  return [...ADMINS]
}
