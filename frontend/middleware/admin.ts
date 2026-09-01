import { useAuthStore } from '~/stores/auth'

/**
 * Keeps the admin page out of a non-admin's hands.
 *
 * Client-only for the same reason as `auth`: on the server there is no session
 * to inspect, and answering anyway bakes a redirect into the prerendered file.
 *
 * This is convenience rather than security — the page is static and the check
 * runs in the browser. /api/admin enforces access for itself.
 */
export default defineNuxtRouteMiddleware(() => {
  if (import.meta.server) return

  const auth = useAuthStore()
  if (!auth.token) auth.loadToken()
  if (!auth.token) return navigateTo('/auth')
  // isAdmin arrives with the profile; let the page load and let the API refuse
  // if it turns out not to be true.
  if (auth.user && !auth.isAdmin) return navigateTo('/')
})
