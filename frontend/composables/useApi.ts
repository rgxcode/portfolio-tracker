/**
 * Composable providing an authenticated fetch wrapper.
 * Attaches the JWT Bearer token from the auth store to every request.
 */
import { useAuthStore } from '~/stores/auth'

export function useApi() {
  const config = useRuntimeConfig()
  const authStore = useAuthStore()

  async function apiFetch<T>(path: string, options: any = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...options.headers,
    }

    if (authStore.token) {
      headers.Authorization = `Bearer ${authStore.token}`
    }

    return $fetch<T>(`${config.public.apiBaseUrl}${path}`, {
      ...options,
      headers,
    })
  }

  return { apiFetch }
}
