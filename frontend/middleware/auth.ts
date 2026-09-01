import { useAuthStore } from '~/stores/auth'

/**
 * Keeps signed-out visitors off the app's pages.
 *
 * Client-only, deliberately. The session lives in localStorage, which does not
 * exist while these pages are being prerendered — so on the server this check
 * always concluded "signed out" and Nuxt baked the redirect into the static
 * file. The home page became a 91-byte meta-refresh to /auth, and every visitor
 * bounced there before the app had a chance to load.
 */
export default defineNuxtRouteMiddleware(() => {
  if (import.meta.server) return

  const auth = useAuthStore()
  // The store may not have read storage yet on a hard load.
  if (!auth.token) auth.loadToken()
  if (!auth.token) return navigateTo('/auth')
})
