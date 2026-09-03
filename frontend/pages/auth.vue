<template>
  <div class="min-h-screen flex bg-n-bg text-n-text">
    <!-- ── The form ────────────────────────────────────────────────────── -->
    <div class="w-full lg:w-[500px] lg:flex-none flex flex-col px-6 sm:px-10 lg:px-[52px] py-11">
      <div class="flex items-center gap-2.5">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--n-accent)" stroke-width="2" stroke-linecap="round">
          <path d="M4 20V13M10 20V5M16 20V9M22 20V3" />
        </svg>
        <span class="text-sm font-medium">Portfolio Tracker</span>
      </div>

      <div class="my-auto py-9 w-full max-w-[396px] mx-auto lg:mx-0">
        <!--
          Both headings name the action, because this page is most people's
          first sight of the product and the heading is the first thing read.
          It said "Welcome back" on the log-in tab, which is where everyone
          lands — greeting a first-time visitor as a returning one, and
          claiming a history they do not have.
        -->
        <h1 class="text-[32px] leading-tight tracking-[-0.03em] font-medium mb-2">
          {{ mode === 'login' ? 'Log in to your portfolio' : 'Create your account' }}
        </h1>
        <!--
          Only what the app actually does. The analysis is a model's read of
          news we fetched ourselves, with every citation checked back against
          that list (backend/src/jobs/insights.js), and the comparison is the
          /compare page — so neither word is a promise the product cannot keep.
        -->
        <p class="text-sm text-n-400 mb-[26px]">
          Every holding you own, one number, updated every five minutes — with
          AI-powered analysis and side-by-side comparison.
        </p>

        <!-- Log in / Sign up as a switch rather than two pages -->
        <div class="flex gap-[3px] p-[3px] border border-n-divider rounded-[9px] mb-6">
          <button
            v-for="m in modes"
            :key="m.id"
            type="button"
            class="flex-1 h-[34px] rounded-md text-[13px] font-medium transition-colors"
            :class="mode === m.id
              ? 'bg-[rgba(145,132,217,.16)] text-na-300'
              : 'text-n-500 hover:text-n-text'"
            :aria-pressed="mode === m.id"
            @click="mode = m.id"
          >
            {{ m.label }}
          </button>
        </div>

        <div v-if="oauthError" class="mb-5 rounded-lg border border-[rgba(224,121,140,.4)] bg-[rgba(224,121,140,.08)] p-3">
          <p class="text-down text-[13px]">{{ oauthError }}</p>
        </div>

        <!-- OAuth first, then email -->
        <div class="flex gap-2.5 mb-5">
          <a
            v-if="providers.google"
            :href="googleUrl"
            class="flex-1 h-[42px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-n-divider text-[13px] font-medium transition-colors hover:bg-[rgba(233,233,237,.07)] active:bg-[rgba(233,233,237,.14)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" class="block">
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
              <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1 .7-2.3 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
              <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
              <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
            </svg>
            Google
          </a>

          <!--
            Apple is in the design and will be wired up, but there is no Apple
            OAuth app yet. It is rendered disabled rather than omitted so the
            row keeps its shape, and it says why on hover and to a screen
            reader — a button that simply does nothing when pressed is the one
            outcome worth avoiding.
          -->
          <button
            type="button"
            disabled
            title="Apple sign-in isn’t available yet"
            aria-label="Apple sign-in isn’t available yet"
            class="flex-1 h-[42px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-n-divider text-[13px] font-medium opacity-45 cursor-not-allowed"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="block">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
            </svg>
            Apple
          </button>
        </div>

        <div v-if="providers.google" class="flex items-center gap-3 mb-5">
          <span class="flex-1 h-px bg-gradient-to-r from-transparent to-[rgba(233,233,237,.16)]" />
          <span class="text-[11px] text-n-600">or with email</span>
          <span class="flex-1 h-px bg-gradient-to-l from-transparent to-[rgba(233,233,237,.16)]" />
        </div>

        <form @submit.prevent="handleSubmit">
          <!-- Signup only, and rendered rather than hidden: a `required` field
               left in the DOM would block the login form from submitting. -->
          <div v-if="mode === 'signup'" class="grid grid-cols-2 gap-[11px] mb-3.5">
            <div>
              <label for="first-name" class="block text-xs mb-[5px] text-[rgba(233,233,237,.7)]">First name</label>
              <input id="first-name" v-model="firstName" type="text" required autocomplete="given-name" placeholder="Ada" :class="inputClass" />
            </div>
            <div>
              <label for="last-name" class="block text-xs mb-[5px] text-[rgba(233,233,237,.7)]">Last name</label>
              <input id="last-name" v-model="lastName" type="text" required autocomplete="family-name" placeholder="Lovelace" :class="inputClass" />
            </div>
          </div>

          <div class="mb-3.5">
            <label for="email" class="block text-xs mb-[5px] text-[rgba(233,233,237,.7)]">Email</label>
            <input id="email" v-model="email" type="email" required autocomplete="email" placeholder="you@example.com" :class="inputClass" />
          </div>

          <div class="mb-2">
            <label for="password" class="block text-xs mb-[5px] text-[rgba(233,233,237,.7)]">Password</label>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              minlength="8"
              :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
              placeholder="••••••••••"
              :class="inputClass"
            />
          </div>

          <!--
            The design puts a "Forgot password?" link here. There is no reset
            flow in the API (only change-password, which needs a session), so
            the link is left out rather than pointed at a dead end.
          -->
          <p class="text-[11.5px] text-n-500 mb-[22px]">At least 8 characters</p>

          <div v-if="authStore.error" class="mb-4 rounded-lg border border-[rgba(224,121,140,.4)] bg-[rgba(224,121,140,.08)] p-3 text-down text-[13px]">
            {{ authStore.error }}
          </div>

          <button
            type="submit"
            :disabled="authStore.loading"
            class="w-full h-11 rounded-lg border border-n-accent text-n-accent text-sm font-medium transition-colors hover:bg-[rgba(145,132,217,.12)] active:bg-[rgba(145,132,217,.22)] disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {{ ctaLabel }}
          </button>
        </form>
      </div>

      <p class="text-[11.5px] text-n-600 leading-relaxed">
        By continuing you agree to the
        <NuxtLink to="/terms" class="text-n-accent hover:text-na-400">Terms</NuxtLink> and
        <NuxtLink to="/privacy" class="text-n-accent hover:text-na-400">Privacy Policy</NuxtLink>.
        Prices are informational, not advice.
      </p>
    </div>

    <!-- ── What the product looks like ─────────────────────────────────── -->
    <!--
      An illustration of the product, not the visitor's own portfolio — nobody
      is signed in yet, so there are no real numbers to show. The heading says
      "a portfolio" for that reason. Hidden below lg, where it would push the
      form off the fold on a phone.
    -->
    <div
      class="hidden lg:block flex-1 relative overflow-hidden"
      style="background: linear-gradient(160deg, #1b1e30, #141621 60%, #101220)"
      aria-hidden="true"
    >
      <div
        class="absolute -left-[70px] -top-[120px] w-[520px] h-[420px] rounded-full"
        style="background: radial-gradient(circle, rgba(145,132,217,.32), rgba(145,132,217,0) 70%)"
      />
      <div
        class="absolute -right-[120px] -bottom-20 w-[420px] h-[360px] rounded-full"
        style="background: radial-gradient(circle, rgba(95,201,155,.13), rgba(95,201,155,0) 70%)"
      />

      <div class="relative h-full flex flex-col justify-between px-9 py-[34px]">
        <div>
          <div class="text-[10.5px] tracking-[.17em] uppercase text-n-500 mb-3">A portfolio, in one number</div>
          <div
            class="text-[44px] font-medium tracking-[-.04em]"
            style="text-shadow: 0 0 40px rgba(145,132,217,.45)"
          >
            $249,223.27
          </div>
          <div class="flex gap-2.5 items-center mt-2.5 text-[13px]">
            <span class="text-up">+$3,199.04 today</span>
            <span class="text-n-600">·</span>
            <span class="text-n-400">+26.9% all time</span>
          </div>
        </div>

        <div class="flex flex-col gap-[9px]">
          <div
            v-for="(row, i) in showcase"
            :key="row.symbol"
            class="flex items-center gap-[11px] px-[13px] py-[11px] rounded-[10px]"
            :style="{
              background: `rgba(35,37,50,${[0.7, 0.55, 0.4][i]})`,
              boxShadow: `inset 0 0 0 1px rgba(233,233,237,${[0.07, 0.06, 0.05][i]})`,
              backdropFilter: i === 0 ? 'blur(6px)' : undefined,
            }"
          >
            <span class="w-6 h-6 rounded-md bg-n-800 grid place-items-center text-[9.5px] font-semibold">
              {{ row.tag }}
            </span>
            <span class="text-[13px] font-medium">{{ row.symbol }}</span>
            <span class="text-xs text-n-500">{{ row.units }}</span>
            <span class="ml-auto text-[13px]">{{ row.value }}</span>
            <span class="text-xs text-up w-[52px] text-right">{{ row.change }}</span>
          </div>
        </div>

        <svg viewBox="0 0 640 210" width="100%" height="128" preserveAspectRatio="none" class="block opacity-90">
          <defs>
            <linearGradient id="auth-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#9184d9" stop-opacity=".3" />
              <stop offset="1" stop-color="#9184d9" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path :d="`${SHOWCASE_LINE} L640,210 L0,210 Z`" fill="url(#auth-fill)" />
          <path :d="SHOWCASE_LINE" fill="none" stroke="#b5abfc" stroke-width="1.6" vector-effect="non-scaling-stroke" />
        </svg>
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

const modes = [
  { id: 'login', label: 'Log in' },
  { id: 'signup', label: 'Sign up' },
] as const

const inputClass =
  'w-full min-h-[38px] px-2.5 py-1.5 text-sm rounded-lg bg-n-surface border border-n-divider text-n-text ' +
  'placeholder:text-n-600 caret-[color:var(--n-accent)] transition-colors ' +
  'hover:border-[rgba(233,233,237,.45)] focus:border-n-accent focus:outline-none'

const ctaLabel = computed(() => {
  if (authStore.loading) return mode.value === 'login' ? 'Logging in…' : 'Creating account…'
  return mode.value === 'login' ? 'Log in' : 'Create account'
})

/** The line in the panel behind the form. Decorative, so it is a fixed shape. */
const SHOWCASE_LINE =
  'M0,197 C40,190 80,178 120,176 C160,174 200,158 240,150 C280,142 320,120 360,104 ' +
  'C400,88 440,86 480,66 C520,46 560,44 600,24 C620,15 632,11 640,14'

const showcase = [
  { tag: 'NV', symbol: 'NVDA', units: '48 units', value: '$50,033.28', change: '+2.41%' },
  { tag: 'BT', symbol: 'BTC', units: '0.62', value: '$48,627.84', change: '+1.44%' },
  { tag: 'XA', symbol: 'GOLD', units: '9.5 oz', value: '$42,831.70', change: '+0.62%' },
]

const config = useRuntimeConfig()
const route = useRoute()

/**
 * Assume Google is available rather than waiting to be told.
 *
 * The button used to render only after a round trip to the API, so the one
 * thing this page exists to show was the last thing to appear — and on a free
 * instance that has gone to sleep, that is a wait of up to a minute. The last
 * known answer is remembered so a returning visitor never even flickers, and a
 * deployment without Google configured corrects itself on the first reply.
 */
const providers = ref<{ google: boolean }>({ google: true })
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

  // Remembered answer first, so there is nothing to wait for.
  try {
    const cached = localStorage.getItem('authProviders')
    if (cached) providers.value = JSON.parse(cached)
  } catch { /* private mode, or nothing stored */ }

  // Then confirm, without blocking anything above.
  $fetch<{ google: boolean }>(`${config.public.apiBaseUrl}/api/auth/providers`)
    .then((res) => {
      providers.value = res
      try { localStorage.setItem('authProviders', JSON.stringify(res)) } catch { /* ignore */ }
    })
    .catch(() => {
      // Unreachable API: leave the button up. Clicking it fails visibly, which
      // is more useful than silently hiding the only way in.
    })

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
