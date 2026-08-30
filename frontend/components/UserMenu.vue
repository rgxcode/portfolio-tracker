<template>
  <div ref="root" class="relative">
    <button
      class="flex items-center gap-2 rounded-full p-0.5 pr-2 transition-colors"
      :class="open ? 'bg-gray-700' : 'hover:bg-gray-700/70'"
      :aria-expanded="open"
      aria-haspopup="menu"
      :title="user?.email"
      @click="open = !open"
    >
      <!-- Google supplies a picture; everyone else gets initials on a colour
           derived from the address, so the avatar is stable per account. -->
      <img
        v-if="user?.avatarUrl && !imageFailed"
        :src="user.avatarUrl"
        alt=""
        referrerpolicy="no-referrer"
        class="w-8 h-8 rounded-full object-cover"
        @error="imageFailed = true"
      />
      <span
        v-else
        class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
        :style="{ backgroundColor: avatarColor }"
      >{{ initials }}</span>

      <svg
        class="w-3.5 h-3.5 text-gray-400 transition-transform"
        :class="open ? 'rotate-180' : ''"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <div
      v-if="open"
      role="menu"
      class="absolute right-0 mt-2 w-60 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-50"
    >
      <!-- Who you are signed in as. The email is the identity even when a
           display name exists, so both are shown rather than one replacing it. -->
      <div class="px-4 py-3 border-b border-gray-700">
        <p v-if="user?.name" class="text-sm font-semibold text-white truncate">{{ user.name }}</p>
        <p class="text-xs text-gray-400 truncate">{{ user?.email }}</p>
        <p v-if="user?.isAdmin" class="text-[10px] text-amber-400/90 mt-1 uppercase tracking-wide">Administrator</p>
      </div>

      <nav class="py-1">
        <NuxtLink
          v-for="item in items"
          :key="item.to"
          :to="item.to"
          role="menuitem"
          class="flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          @click="open = false"
        >
          <span class="text-gray-500" v-html="item.icon" />
          {{ item.label }}
        </NuxtLink>
      </nav>

      <div class="py-1 border-t border-gray-700">
        <button
          role="menuitem"
          class="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors text-left"
          @click="signOut"
        >
          <span class="text-gray-500">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
          </span>
          Log out
        </button>
      </div>

      <div class="px-4 py-2 border-t border-gray-700 flex gap-3">
        <NuxtLink to="/privacy" class="text-[11px] text-gray-500 hover:text-gray-300" @click="open = false">Privacy</NuxtLink>
        <NuxtLink to="/terms" class="text-[11px] text-gray-500 hover:text-gray-300" @click="open = false">Terms</NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

const authStore = useAuthStore()
const user = computed(() => authStore.user)

const open = ref(false)
const imageFailed = ref(false)
const root = ref<HTMLElement | null>(null)

const icon = {
  account: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>',
  assets: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>',
  compare: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6H5v6h4zm5 0V5h-4v14h4zm5 0v-9h-4v9h4z"/></svg>',
  admin: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3l7 4v5c0 4.4-3 8.4-7 9-4-.6-7-4.6-7-9V7l7-4z"/></svg>',
}

const items = computed(() => {
  const base = [
    { to: '/account', label: 'Account & settings', icon: icon.account },
    { to: '/assets', label: 'Manage holdings', icon: icon.assets },
    { to: '/compare', label: 'Compare stocks', icon: icon.compare },
  ]
  if (user.value?.isAdmin) base.push({ to: '/admin', label: 'Admin', icon: icon.admin })
  return base
})

/** Initials from a display name where there is one, otherwise the address. */
const initials = computed(() => {
  const name = user.value?.name?.trim()
  if (name) {
    const parts = name.split(/\s+/)
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
  }
  return (user.value?.email?.[0] ?? '?').toUpperCase()
})

/** Derived from the address so the same person always gets the same colour. */
const avatarColor = computed(() => {
  const seed = user.value?.email ?? ''
  let h = 0
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h)
  return `hsl(${Math.abs(h) % 360}, 55%, 42%)`
})

function signOut() {
  open.value = false
  authStore.logout()
}

// A menu that only closes via its own button is a trap on touch devices.
function onPointerDown(e: MouseEvent) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', onPointerDown)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onPointerDown)
  document.removeEventListener('keydown', onKey)
})
</script>
