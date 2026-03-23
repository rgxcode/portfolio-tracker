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
    try {
      const data = await $fetch<{ rates: { EUR: number } }>(
        'https://api.frankfurter.app/latest?from=USD&to=EUR',
      )
      eurRate.value = data.rates.EUR
      rateLoaded.value = true
    } catch {
      eurRate.value = 0.92 // fallback
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
