/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './components/**/*.{js,vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.{js,ts}',
    './app.vue',
    './error.vue',
  ],
  theme: {
    extend: {
      /**
       * The Nocturne palette from `assets/css/main.css`, exposed as utilities.
       *
       * Names are deliberately short (`bg-n-surface`, `text-n-500`) because
       * they appear on nearly every element in the dashboard. Each one points
       * at the custom property rather than repeating the hex, so retuning the
       * system means editing one file.
       */
      colors: {
        n: {
          bg: 'var(--n-bg)',
          surface: 'var(--n-surface)',
          text: 'var(--n-text)',
          accent: 'var(--n-accent)',
          100: 'var(--n-100)',
          200: 'var(--n-200)',
          300: 'var(--n-300)',
          400: 'var(--n-400)',
          500: 'var(--n-500)',
          600: 'var(--n-600)',
          700: 'var(--n-700)',
          800: 'var(--n-800)',
          900: 'var(--n-900)',
        },
        // The accent ramp, used for the allocation bar's tiers and for the
        // muted states of accent-coloured controls.
        na: {
          100: 'var(--n-accent-100)',
          200: 'var(--n-accent-200)',
          300: 'var(--n-accent-300)',
          400: 'var(--n-accent-400)',
          500: 'var(--n-accent-500)',
          600: 'var(--n-accent-600)',
          700: 'var(--n-accent-700)',
          800: 'var(--n-accent-800)',
          900: 'var(--n-accent-900)',
        },
        // Gain and loss. Named for what they mean, not what colour they are,
        // so a holding that falls is `text-down` wherever it appears.
        up: 'var(--n-up)',
        down: 'var(--n-down)',
      },
      boxShadow: {
        'n-sm': 'var(--n-shadow-sm)',
        'n-md': 'var(--n-shadow-md)',
        'n-lg': 'var(--n-shadow-lg)',
      },
      borderColor: {
        'n-divider': 'var(--n-divider)',
      },
    },
  },
  plugins: [],
}
