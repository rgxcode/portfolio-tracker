<template>
  <div class="min-h-screen bg-gray-900 text-gray-100">
    <!-- Navigation -->
    <nav class="bg-gray-800/80 backdrop-blur border-b border-gray-700 sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <NuxtLink to="/" class="flex items-center gap-2 font-bold text-lg text-white">
            <svg class="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Portfolio Tracker
          </NuxtLink>

          <div class="flex items-center gap-1">
            <template v-if="authStore.isAuthenticated">
              <NuxtLink
                to="/"
                class="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                :class="$route.path === '/' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'"
              >
                Dashboard
              </NuxtLink>
              <NuxtLink
                to="/assets"
                class="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                :class="$route.path === '/assets' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'"
              >
                Assets
              </NuxtLink>
              <span class="text-gray-400 text-sm ml-3 hidden sm:inline">{{ authStore.user?.email }}</span>
              <button
                @click="authStore.logout()"
                class="ml-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Logout
              </button>
            </template>
            <template v-else>
              <NuxtLink
                to="/auth"
                class="px-3 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Sign In
              </NuxtLink>
            </template>
          </div>
        </div>
      </div>
    </nav>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <slot />
    </main>

    <footer class="border-t border-gray-800 mt-16 py-6 text-center text-gray-500 text-sm">
      Portfolio Tracker · Prices from CoinGecko & Alpha Vantage
    </footer>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

const authStore = useAuthStore()
</script>
