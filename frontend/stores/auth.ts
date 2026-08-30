import { defineStore } from 'pinia'

interface AuthUser {
  id: string
  email: string
  // Derived by the server from configuration, never sent by the client. It only
  // decides whether the UI offers the admin link; the API enforces access
  // independently on every admin route.
  isAdmin?: boolean
  name?: string | null
  avatarUrl?: string | null
  /** False for accounts created through a provider — nothing to change. */
  hasPassword?: boolean
  providers?: string[]
}

interface AuthState {
  user: AuthUser | null
  token: string | null
  loading: boolean
  error: string | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    token: null,
    loading: false,
    error: null,
  }),

  getters: {
    isAuthenticated: (state) => !!state.token && !!state.user,
    isAdmin: (state) => state.user?.isAdmin === true,
  },

  actions: {
    async signup(email: string, password: string) {
      this.loading = true
      this.error = null
      try {
        const config = useRuntimeConfig()
        const data = await $fetch<{ token: string; user: AuthUser }>(
          `${config.public.apiBaseUrl}/api/auth/signup`,
          {
            method: 'POST',
            body: { email, password },
          },
        )
        this.token = data.token
        this.user = data.user
        this.persistToken()
      } catch (err: any) {
        this.error = err?.data?.error || err?.message || 'Signup failed'
        throw err
      } finally {
        this.loading = false
      }
    },

    async login(email: string, password: string) {
      this.loading = true
      this.error = null
      try {
        const config = useRuntimeConfig()
        const data = await $fetch<{ token: string; user: AuthUser }>(
          `${config.public.apiBaseUrl}/api/auth/login`,
          {
            method: 'POST',
            body: { email, password },
          },
        )
        this.token = data.token
        this.user = data.user
        this.persistToken()
      } catch (err: any) {
        this.error = err?.data?.error || err?.message || 'Login failed'
        throw err
      } finally {
        this.loading = false
      }
    },

    async changePassword(currentPassword: string, newPassword: string) {
      const config = useRuntimeConfig()
      const data = await $fetch<{ token: string; user: AuthUser }>(
        `${config.public.apiBaseUrl}/api/auth/change-password`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.token}` },
          body: { currentPassword, newPassword },
        },
      )
      // The server issues a fresh token; adopt it so the session continues
      // rather than appearing to work and then expiring on the old one.
      this.token = data.token
      this.user = data.user
      this.persistToken()
    },

    async fetchMe() {
      if (!this.token) return
      try {
        const config = useRuntimeConfig()
        const data = await $fetch<AuthUser>(
          `${config.public.apiBaseUrl}/api/auth/me`,
          {
            headers: { Authorization: `Bearer ${this.token}` },
          },
        )
        this.user = data
      } catch {
        this.logout()
      }
    },

    logout() {
      this.user = null
      this.token = null
      this.error = null
      if (import.meta.client) {
        localStorage.removeItem('auth-token')
      }
      navigateTo('/auth')
    },

    persistToken() {
      if (import.meta.client && this.token) {
        localStorage.setItem('auth-token', this.token)
      }
    },

    loadToken() {
      if (import.meta.client) {
        const token = localStorage.getItem('auth-token')
        if (token) {
          this.token = token
        }
      }
    },
  },
})
