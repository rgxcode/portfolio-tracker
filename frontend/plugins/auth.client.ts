import { useAuthStore } from '~/stores/auth'

export default defineNuxtPlugin(async () => {
  const auth = useAuthStore()
  auth.loadToken()
  if (auth.token) {
    await auth.fetchMe()
  }
})
