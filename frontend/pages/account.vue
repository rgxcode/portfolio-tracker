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

    <!-- Right of access and portability -->
    <section class="bg-gray-800 border border-gray-700 rounded-2xl p-5 mt-5">
      <h2 class="font-semibold text-white mb-1">Your data</h2>
      <p class="text-sm text-gray-400 mb-3">
        Everything held about you — account details and holdings — as a JSON file. Prices and
        filings are public market data shared by all accounts and are not part of your record.
      </p>
      <button
        class="px-3 py-2 rounded-lg text-sm bg-gray-900 border border-gray-700 text-gray-200 hover:bg-gray-700 transition-colors disabled:opacity-50"
        :disabled="exporting"
        @click="exportData"
      >
        {{ exporting ? 'Preparing…' : 'Download my data' }}
      </button>
    </section>

    <!-- Right to erasure -->
    <section class="bg-red-950/20 border border-red-900/60 rounded-2xl p-5 mt-5">
      <h2 class="font-semibold text-red-200 mb-1">Delete this account</h2>
      <p class="text-sm text-gray-400 mb-3">
        Removes your account and every holding immediately. This cannot be undone, and nothing is
        kept behind a flag. Consider downloading your data first.
      </p>

      <div v-if="deleteError" class="mb-3 bg-red-900/30 border border-red-700 rounded-lg p-3">
        <p class="text-red-300 text-sm">{{ deleteError }}</p>
      </div>

      <template v-if="confirming">
        <label class="block mb-3">
          <span class="text-sm text-gray-300">Type <strong>{{ authStore.user?.email }}</strong> to confirm</span>
          <input
            v-model="confirmEmail"
            autocomplete="off"
            class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-red-500"
          />
        </label>
        <label v-if="authStore.user?.hasPassword !== false" class="block mb-4">
          <span class="text-sm text-gray-300">Your password</span>
          <input
            v-model="deletePassword"
            type="password"
            autocomplete="current-password"
            class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-red-500"
          />
        </label>
        <div class="flex gap-2">
          <button
            class="px-3 py-2 rounded-lg text-sm bg-red-700 hover:bg-red-600 text-white font-medium disabled:opacity-40"
            :disabled="deleting || confirmEmail.trim().toLowerCase() !== authStore.user?.email"
            @click="deleteAccount"
          >
            {{ deleting ? 'Deleting…' : 'Permanently delete' }}
          </button>
          <button class="px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white" @click="cancelDelete">
            Cancel
          </button>
        </div>
      </template>

      <button
        v-else
        class="px-3 py-2 rounded-lg text-sm bg-transparent border border-red-800 text-red-300 hover:bg-red-900/30 transition-colors"
        @click="confirming = true"
      >
        Delete account
      </button>
    </section>

    <p class="text-xs text-gray-600 mt-5 text-center">
      <NuxtLink to="/privacy" class="hover:text-gray-400">Privacy Policy</NuxtLink>
      ·
      <NuxtLink to="/terms" class="hover:text-gray-400">Terms of Service</NuxtLink>
    </p>
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

const { apiFetch } = useApi()
const config = useRuntimeConfig()

const exporting = ref(false)
const confirming = ref(false)
const confirmEmail = ref('')
const deletePassword = ref('')
const deleting = ref(false)
const deleteError = ref<string | null>(null)

async function exportData() {
  exporting.value = true
  try {
    const data = await apiFetch<any>('/api/auth/export')
    // Built in the browser rather than served as a download, so the token never
    // has to travel in a URL to authenticate a plain link.
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'portfolio-tracker-export.json'
    a.click()
    URL.revokeObjectURL(url)
  } catch (err: any) {
    deleteError.value = err?.data?.error || 'Could not prepare the export'
  } finally {
    exporting.value = false
  }
}

function cancelDelete() {
  confirming.value = false
  confirmEmail.value = ''
  deletePassword.value = ''
  deleteError.value = null
}

async function deleteAccount() {
  deleting.value = true
  deleteError.value = null
  try {
    await $fetch(`${config.public.apiBaseUrl}/api/auth/account`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authStore.token}` },
      body: { confirmEmail: confirmEmail.value, password: deletePassword.value },
    })
    // The account is gone; drop the local session rather than leaving a token
    // that now authenticates nothing.
    authStore.logout()
  } catch (err: any) {
    deleteError.value = err?.data?.error || 'Could not delete the account'
  } finally {
    deleting.value = false
  }
}

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
