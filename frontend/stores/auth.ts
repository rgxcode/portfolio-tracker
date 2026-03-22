import { defineStore } from 'pinia'

interface AuthUser {
  id: string
  email: string
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
