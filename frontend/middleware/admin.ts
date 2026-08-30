import { useAuthStore } from '~/stores/auth'

/**
 * Keeps the admin page out of a non-admin's hands.
 *
 * This is convenience, not security: the page is static and the check runs in
 * the browser, so it stops an ordinary mis-navigation rather than a determined
 * visitor. The data itself is protected server-side — /api/admin refuses any
 * request whose user is not configured as an admin.
 */
export default defineNuxtRouteMiddleware(() => {
  const auth = useAuthStore()

  if (!auth.isAuthenticated) return navigateTo('/auth')
  if (!auth.isAdmin) return navigateTo('/')
})
