const eurRate = ref<number>(1)
const selectedCurrency = ref<'USD' | 'EUR'>('USD')
const rateLoaded = ref(false)

export function useCurrency() {
  function loadPreference() {
    if (import.meta.client) {
      const saved = localStorage.getItem('preferredCurrency')
      if (saved === 'EUR' || saved === 'USD') selectedCurrency.value = saved
    }
  }

  async function fetchEurRate() {
    if (rateLoaded.value) return
    const config = useRuntimeConfig()
    try {
      // Served from our own backend — the scheduled price job fetches the rate
      // alongside crypto prices, so the browser makes no third-party call.
      const data = await $fetch<{ eurRate: number }>(
        `${config.public.apiBaseUrl}/api/prices`,
      )
      eurRate.value = data.eurRate
      rateLoaded.value = true
    } catch {
      eurRate.value = 0.86 // fallback if the backend is unreachable
    }
  }

  function toggleCurrency() {
    selectedCurrency.value = selectedCurrency.value === 'USD' ? 'EUR' : 'USD'
    if (import.meta.client) {
      localStorage.setItem('preferredCurrency', selectedCurrency.value)
    }
  }

  function convert(usdAmount: number): number {
    return selectedCurrency.value === 'EUR'
      ? usdAmount * eurRate.value
      : usdAmount
  }

  const currencySymbol = computed(() => (selectedCurrency.value === 'EUR' ? '€' : '$'))

  return {
    selectedCurrency: readonly(selectedCurrency),
    currencySymbol,
    convert,
    toggleCurrency,
    loadPreference,
    fetchEurRate,
  }
}
