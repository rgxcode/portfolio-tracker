// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },

  modules: [
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
  ],

  css: ['~/assets/css/main.css'],

  // Force the static preset so every page is pre-rendered to HTML.
  // Pinning it matters: Nitro otherwise auto-detects a host-specific preset
  // from the build environment, which can silently switch the build to
  // server-side rendering. `nuxt generate` then produces plain files that any
  // static host will serve.
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
      // Inter is the design system's typeface. Preconnect first so the font
      // request does not wait on a fresh TLS handshake, and `display=swap` so
      // text is readable in the fallback while it loads rather than invisible.
      link: [
        // The app's own mark. SVG so it stays sharp at any size; the .ico is
        // not provided, so browsers that ignore SVG icons simply show none
        // rather than fetching a 404.
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap',
        },
      ],
    },
  },

  compatibilityDate: '2025-01-01',
})
