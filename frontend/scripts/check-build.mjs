/**
 * Refuse to deploy a build that points at a developer's machine.
 *
 * `nuxt generate` reads frontend/.env, which holds the local API URL, and bakes
 * whatever it finds into every page. Nothing about the output looks wrong: the
 * site builds, prerenders and uploads clean, and the failure only appears when
 * a real visitor's browser tries to POST to a port on their own laptop. That is
 * far too quiet a way to take the app down, so it is checked here instead.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIR = '.output/public'
const FORBIDDEN = /localhost:\d+|127\.0\.0\.1:\d+/

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

const offenders = walk(DIR)
  .filter(p => /\.(html|js|json)$/.test(p))
  .map(p => [p, readFileSync(p, 'utf8').match(FORBIDDEN)?.[0]])
  .filter(([, hit]) => hit)

if (offenders.length) {
  console.error(`\n✖ ${DIR} points at a local address — refusing to deploy.\n`)
  for (const [path, hit] of offenders.slice(0, 10)) console.error(`  ${hit}  ${path}`)
  if (offenders.length > 10) console.error(`  …and ${offenders.length - 10} more`)
  console.error('\n  Build with the real API URL:')
  console.error('  NUXT_PUBLIC_API_BASE_URL=https://… npm run generate\n')
  process.exit(1)
}

console.log(`✓ ${DIR} contains no local addresses`)
