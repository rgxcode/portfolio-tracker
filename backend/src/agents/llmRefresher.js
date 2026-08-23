/**
 * Keeps the 'llm' snapshot fresh while somebody is actually watching it.
 *
 * The agent shells out to the `opencode` CLI, which takes anywhere from 10 to
 * 40 seconds depending on how loaded the free model tier is. That is far too
 * long to hold an HTTP request open, so a request never waits: it triggers a
 * refresh if the snapshot has gone stale and returns whatever is stored right
 * now. The dashboard already polls every 8 seconds, so the fresh value lands on
 * a subsequent poll.
 *
 * The effect is that LLM prices update continuously while the tab is open and
 * stop costing anything the moment nobody is looking — which is the only way
 * this fits on a free instance.
 */

import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { formatCET } from '../jobs/marketHours.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BACKEND_DIR = resolve(__dirname, '..', '..')
const AGENT = resolve(__dirname, 'opencodePriceAgent.js')

/** Refresh once the stored snapshot is older than this. */
const STALE_SEC = Number(process.env.LLM_STALE_SEC ?? 8)

/**
 * How long to wait before trying again after a failed run. Without this a
 * broken agent would spawn a fresh process on every poll — eight seconds apart,
 * forever — and exhaust a small instance.
 */
const FAILURE_COOLDOWN_MS = 60_000

/** Hard ceiling on one run, in case the CLI wedges. */
const RUN_TIMEOUT_MS = 90_000

let inFlight = false
let cooldownUntil = 0

const log = (...a) => console.log(`[${formatCET()}] llm-refresh:`, ...a)

/**
 * `opencode` is a project dependency rather than a global install, so the
 * binary lives in node_modules/.bin. Putting it on PATH keeps the agent
 * spawning a bare `opencode`, which is still what a developer runs by hand.
 */
function agentEnv() {
  const binDir = resolve(BACKEND_DIR, 'node_modules', '.bin')
  return {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
  }
}

/**
 * Trigger a refresh if the snapshot is stale. Returns immediately — the caller
 * is never blocked, and the return value only says whether a run was started.
 */
export function refreshIfStale(snapshot) {
  if (inFlight) return false
  if (Date.now() < cooldownUntil) return false

  const updatedAt = snapshot?.updatedAt ? new Date(snapshot.updatedAt).getTime() : 0
  const ageSec = (Date.now() - updatedAt) / 1000
  if (ageSec < STALE_SEC) return false

  inFlight = true
  const startedAt = Date.now()

  const child = spawn(process.execPath, [AGENT, '--once'], {
    cwd: BACKEND_DIR,
    env: agentEnv(),
    // stdin must not be a pipe or socket: opencode probes the descriptor and
    // stalls when it is neither a TTY nor /dev/null.
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stderr = ''
  child.stderr.on('data', (d) => { stderr += d })
  child.stdout.resume() // drain, so a full pipe can never block the child

  const timer = setTimeout(() => child.kill('SIGKILL'), RUN_TIMEOUT_MS)

  const finish = (label) => {
    clearTimeout(timer)
    inFlight = false
    const secs = ((Date.now() - startedAt) / 1000).toFixed(1)
    if (label === 'ok') {
      log(`refreshed in ${secs}s`)
    } else {
      cooldownUntil = Date.now() + FAILURE_COOLDOWN_MS
      log(`${label} after ${secs}s — pausing ${FAILURE_COOLDOWN_MS / 1000}s. ${stderr.trim().split('\n')[0] ?? ''}`)
    }
  }

  child.on('exit', code => finish(code === 0 ? 'ok' : `exited ${code}`))
  child.on('error', err => finish(`could not start (${err.message})`))

  return true
}
