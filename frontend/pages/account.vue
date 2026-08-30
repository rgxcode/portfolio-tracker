<template>
  <div class="max-w-md mx-auto">
    <h1 class="text-2xl font-bold text-white mb-1">Account</h1>
    <p class="text-sm text-gray-400 mb-6">{{ authStore.user?.email }}</p>

    <div
      v-if="authStore.user && authStore.user.hasPassword === false"
      class="bg-gray-800 border border-gray-700 rounded-2xl p-5"
    >
      <h2 class="font-semibold text-white mb-2">Sign-in method</h2>
      <p class="text-sm text-gray-400">
        This account signs in with {{ (authStore.user.providers ?? ['a provider']).join(', ') }},
        so there is no password to change.
      </p>
    </div>

    <form v-else class="bg-gray-800 border border-gray-700 rounded-2xl p-5" @submit.prevent="submit">
      <h2 class="font-semibold text-white mb-4">Change password</h2>

      <div v-if="success" class="mb-4 bg-emerald-900/30 border border-emerald-700 rounded-lg p-3">
        <p class="text-emerald-300 text-sm">Password changed. Use the new one next time you sign in.</p>
      </div>
      <div v-if="error" class="mb-4 bg-red-900/30 border border-red-700 rounded-lg p-3">
        <p class="text-red-300 text-sm">{{ error }}</p>
      </div>

      <label class="block mb-3">
        <span class="text-sm text-gray-300">Current password</span>
        <input
          v-model="current"
          type="password"
          autocomplete="current-password"
          required
          class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
        />
      </label>

      <label class="block mb-3">
        <span class="text-sm text-gray-300">New password</span>
        <input
          v-model="next"
          type="password"
          autocomplete="new-password"
          required
          minlength="8"
          class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
        />
        <span class="text-xs text-gray-500">At least 8 characters.</span>
      </label>

      <label class="block mb-5">
        <span class="text-sm text-gray-300">Confirm new password</span>
        <input
          v-model="confirm"
          type="password"
          autocomplete="new-password"
          required
          class="mt-1 w-full bg-gray-900 border rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
          :class="mismatch ? 'border-red-600' : 'border-gray-700'"
        />
        <span v-if="mismatch" class="text-xs text-red-400">The two new passwords do not match.</span>
      </label>

      <button
        type="submit"
        :disabled="saving || mismatch || !current || next.length < 8"
        class="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 text-white font-medium transition-colors"
      >
        {{ saving ? 'Changing…' : 'Change password' }}
      </button>

      <p class="text-xs text-gray-500 mt-4">
        You stay signed in here. Sessions already open on other devices keep working until their
        token expires — this app has no token store, so it cannot end them early.
      </p>
    </form>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

definePageMeta({ middleware: 'auth' })

const authStore = useAuthStore()

const current = ref('')
const next = ref('')
const confirm = ref('')
const saving = ref(false)
const error = ref<string | null>(null)
const success = ref(false)

const mismatch = computed(() => confirm.value.length > 0 && confirm.value !== next.value)

async function submit() {
  if (mismatch.value) return
  saving.value = true
  error.value = null
  success.value = false
  try {
    await authStore.changePassword(current.value, next.value)
    success.value = true
    current.value = ''
    next.value = ''
    confirm.value = ''
  } catch (err: any) {
    error.value = err?.data?.error || err?.message || 'Could not change the password'
  } finally {
    saving.value = false
  }
}
</script>
