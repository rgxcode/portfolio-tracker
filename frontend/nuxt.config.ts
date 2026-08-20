// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },

  modules: [
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
  ],

  css: ['~/assets/css/main.css'],

  // Force static preset so all pages are pre-rendered as HTML.
  // Without this, Azure's Oryx build system causes Nitro to auto-detect
  // the "azure-swa" preset, which skips page pre-rendering and expects
  // server-side rendering via Azure Functions.
  nitro: {
    preset: 'static',
  },

  runtimeConfig: {
    public: {
      // Backend API base URL — the only origin the browser talks to.
      // Market data keys deliberately live in backend/.env instead: the browser
      // never calls a price provider, so shipping keys in the bundle would be
      // exposure with no purpose.
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL || 'http://localhost:4000',
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
