<template>
  <div class="min-h-screen bg-gray-900 flex items-center justify-center px-4">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <svg class="w-12 h-12 mx-auto text-blue-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <h1 class="text-2xl font-bold text-white">Portfolio Tracker</h1>
        <p class="text-gray-400 text-sm mt-1">Track your investments in real-time</p>
      </div>

      <div class="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <div class="flex mb-6">
          <button
            class="flex-1 py-2 text-sm font-medium rounded-lg transition-colors"
            :class="mode === 'login' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'"
            @click="mode = 'login'"
          >
            Log In
          </button>
          <button
            class="flex-1 py-2 text-sm font-medium rounded-lg transition-colors"
            :class="mode === 'signup' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'"
            @click="mode = 'signup'"
          >
            Sign Up
          </button>
        </div>

        <div v-if="oauthError" class="mb-4 bg-red-900/30 border border-red-700 rounded-lg p-3">
          <p class="text-red-300 text-sm">{{ oauthError }}</p>
        </div>

        <template v-if="providers.google">
          <a
            :href="googleUrl"
            class="w-full flex items-center justify-center gap-3 py-2.5 rounded-lg bg-white text-gray-800 font-medium hover:bg-gray-100 transition-colors"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/>
              <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1 .7-2.3 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"/>
              <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1z"/>
              <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/>
            </svg>
            Continue with Google
          </a>

          <div class="flex items-center gap-3 my-5">
            <span class="h-px flex-1 bg-gray-700" />
            <span class="text-xs text-gray-500">or with email</span>
            <span class="h-px flex-1 bg-gray-700" />
          </div>
        </template>

        <form @submit.prevent="handleSubmit" class="space-y-4">
          <!-- Signup only, and rendered rather than hidden: a `required` field
               left in the DOM would block the login form from submitting. -->
          <div v-if="mode === 'signup'" class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">First name</label>
              <input
                v-model="firstName"
                type="text"
                required
                autocomplete="given-name"
                placeholder="Ada"
                class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">Last name</label>
              <input
                v-model="lastName"
                type="text"
                required
                autocomplete="family-name"
                placeholder="Lovelace"
                class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">Email</label>
            <input
              v-model="email"
              type="email"
              required
              autocomplete="email"
              placeholder="you@example.com"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-300 mb-1">Password</label>
            <input
              v-model="password"
              type="password"
              required
              :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
              placeholder="••••••••"
              minlength="8"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p v-if="mode === 'signup'" class="text-gray-500 text-xs mt-1">Must be at least 8 characters</p>
          </div>

          <div v-if="authStore.error" class="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
            {{ authStore.error }}
          </div>

          <button
            type="submit"
            :disabled="authStore.loading"
            class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="authStore.loading">{{ mode === 'login' ? 'Logging in...' : 'Creating account...' }}</span>
            <span v-else>{{ mode === 'login' ? 'Log In' : 'Create Account' }}</span>
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

definePageMeta({ layout: false })

const authStore = useAuthStore()

const mode = ref<'login' | 'signup'>('login')
const email = ref('')
const password = ref('')
const firstName = ref('')
const lastName = ref('')

const config = useRuntimeConfig()
const route = useRoute()

const providers = ref<{ google: boolean }>({ google: false })
const oauthError = ref<string | null>(null)
const googleUrl = computed(() => `${config.public.apiBaseUrl}/api/auth/google`)

onMounted(async () => {
  // The callback hands the token back in the fragment, which never reaches a
  // server and stays out of Referer headers. Consume it and clean the URL so a
  // shared or bookmarked link cannot carry a live session.
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  const token = fragment.get('token')
  if (token) {
    history.replaceState(null, '', window.location.pathname)
    authStore.token = token
    authStore.persistToken()
    await authStore.fetchMe()
    if (authStore.isAuthenticated) return navigateTo('/')
  }

  if (route.query.error) oauthError.value = String(route.query.error)

  // Only offer a provider this deployment can actually complete.
  try {
    providers.value = await $fetch(`${config.public.apiBaseUrl}/api/auth/providers`)
  } catch {
    providers.value = { google: false }
  }

  authStore.loadToken()
  if (authStore.token) {
    authStore.fetchMe().then(() => {
      if (authStore.isAuthenticated) {
        navigateTo('/')
      }
    })
  }
})

async function handleSubmit() {
  try {
    if (mode.value === 'signup') {
      // The browser's `required` only rejects an empty field, so whitespace is
      // trimmed here too rather than left for the server to bounce back.
      if (!firstName.value.trim() || !lastName.value.trim()) {
        authStore.error = 'First name and last name are required'
        return
      }
      await authStore.signup(
        email.value, password.value, firstName.value.trim(), lastName.value.trim(),
      )
    } else {
      await authStore.login(email.value, password.value)
    }
    navigateTo('/')
  } catch {
    // error is shown via authStore.error
  }
}

useHead({ title: 'Sign In – Portfolio Tracker' })
</script>
