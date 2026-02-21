// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },

  modules: [
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
  ],

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      // CoinGecko API key (optional for free tier - add your key here or in .env)
      coinGeckoApiKey: process.env.NUXT_PUBLIC_COINGECKO_API_KEY || '',
      // Alpha Vantage API key for stock data
      alphaVantageApiKey: process.env.NUXT_PUBLIC_ALPHA_VANTAGE_API_KEY || 'YOUR_ALPHA_VANTAGE_API_KEY',
    },
  },

  app: {
    head: {
      title: 'Portfolio Tracker',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Track your investment portfolio in real-time with charts and analytics.' },
      ],
    },
  },

  compatibilityDate: '2025-01-01',
})
