<template>
  <article class="max-w-2xl mx-auto prose-invert">
    <h1 class="text-2xl font-bold text-white mb-1">Privacy Policy</h1>
    <p class="text-sm text-gray-500 mb-8">Last updated {{ updated }}</p>

    <section v-for="s in sections" :key="s.title" class="mb-7">
      <h2 class="text-base font-semibold text-white mb-2">{{ s.title }}</h2>
      <p v-for="(p, i) in s.body" :key="i" class="text-sm text-gray-300 leading-relaxed mb-2">
        <span v-html="p" />
      </p>
      <ul v-if="s.list" class="mt-2 space-y-1.5">
        <li v-for="l in s.list" :key="l" class="text-sm text-gray-400 flex gap-2">
          <span class="text-gray-600 shrink-0">•</span><span v-html="l" />
        </li>
      </ul>
    </section>

    <p class="text-xs text-gray-600 border-t border-gray-800 pt-4">
      Questions, or a request about your data: <a :href="`mailto:${contact}`" class="text-blue-400 hover:text-blue-300">{{ contact }}</a>
    </p>
  </article>
</template>

<script setup lang="ts">
/**
 * Written to describe what this application actually does, not from a
 * template. Every claim below is checkable against the code: the data listed is
 * the whole of the User and Asset schemas, and the processors listed are the
 * only services the deployment uses.
 */
const contact = 'ranajoy121@gmail.com'
const updated = '30 August 2026'

const sections = [
  {
    title: 'Who is responsible',
    body: [
      `This app is run by an individual, reachable at <a class="text-blue-400" href="mailto:${contact}">${contact}</a>. That address is the controller for the purposes of the GDPR.`,
    ],
  },
  {
    title: 'What is collected',
    body: ['Only what the app needs to hold an account and show a portfolio:'],
    list: [
      '<strong>Your email address</strong> — identifies the account and is how you sign in.',
      '<strong>A password hash</strong>, if you signed up with a password. Hashed with bcrypt; the password itself is never stored and cannot be recovered from the hash.',
      '<strong>Your Google account identifier, name and profile picture</strong>, if you signed in with Google. No other Google data is requested — not your contacts, mail, or files.',
      '<strong>Your holdings</strong> — ticker, quantity, and the price you paid.',
      '<strong>Timestamps</strong> for when the account and each holding were created or changed.',
    ],
  },
  {
    title: 'What is not collected',
    body: [
      'There are no analytics, no advertising, no tracking pixels and no third-party cookies. Nothing is sold or shared for marketing. No IP-based profiling is performed.',
      'Prices and company filings are fetched on a schedule for all users at once, never per person — so browsing a company is not recorded against your account.',
    ],
  },
  {
    title: 'Why it is held',
    body: [
      'To operate the account you asked for: authenticating you, and storing the holdings you entered so they are there next time. That is the contractual basis under Article 6(1)(b) — the data is what makes the service work, not a by-product of it.',
    ],
  },
  {
    title: 'Where it is stored',
    body: ['The application is assembled from managed services, each of which processes data on the controller’s behalf:'],
    list: [
      '<strong>MongoDB Atlas</strong> — the database holding your account and holdings.',
      '<strong>Render</strong> — runs the API that reads and writes it.',
      '<strong>Cloudflare</strong> — serves the website itself, and holds no account data.',
      '<strong>Google</strong> — only if you choose to sign in with Google, and only to confirm who you are.',
      '<strong>GitHub Actions</strong> — runs the scheduled price and filings jobs. These touch market data, never your holdings.',
    ],
  },
  {
    title: 'How long',
    body: [
      'For as long as the account exists. Delete the account and the record and every holding are removed immediately — there is no hidden “deleted” flag, because a record marked deleted is still a record being kept.',
      'Backups held by the database provider may retain a copy for a short period before rotating out.',
    ],
  },
  {
    title: 'Your rights',
    body: [
      'Under the GDPR you may access, correct, export, or erase your data, and object to its processing. Two of these are buttons rather than requests:',
    ],
    list: [
      '<strong>Export</strong> — Account page, downloads everything held about you as JSON.',
      '<strong>Erase</strong> — Account page, removes the account and all holdings immediately.',
      '<strong>Correct</strong> — holdings are editable on the Assets page.',
      `Anything else, or a complaint: <a class="text-blue-400" href="mailto:${contact}">${contact}</a>. You also have the right to complain to your national data protection authority.`,
    ],
  },
  {
    title: 'Security, stated honestly',
    body: [
      'Passwords are hashed with bcrypt and never stored in the clear. Traffic is encrypted in transit. Sessions use signed tokens that expire after seven days.',
      'This is a personal project run on free hosting tiers, not an audited financial institution. It is built carefully, but you should not treat it as a system of record for anything you cannot afford to lose. Keep your own copy of anything that matters.',
    ],
  },
  {
    title: 'Not financial advice',
    body: [
      'Prices, company figures and the written summaries are provided for information only. The summaries are produced by a language model from published articles and can be wrong or out of date. Nothing here is advice, a recommendation, or a solicitation to buy or sell anything.',
    ],
  },
  {
    title: 'Changes',
    body: [
      'If this policy changes materially, the date above changes with it. Continued use after that constitutes acceptance.',
    ],
  },
]

useHead({ title: 'Privacy Policy · Portfolio Tracker' })
</script>
