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

        <form @submit.prevent="handleSubmit" class="space-y-4">
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

// Redirect if already logged in
onMounted(() => {
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
      await authStore.signup(email.value, password.value)
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
