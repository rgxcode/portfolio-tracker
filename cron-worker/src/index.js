/**
 * Triggers the price workflows on a real schedule.
 *
 * GitHub throttles `schedule:` triggers hard on this repository — a workflow
 * asking for every 15 minutes actually fired at gaps of 25 to 700 minutes, so
 * deployed prices went hours stale. Manual `workflow_dispatch` runs are not
 * throttled, so an external clock calling the dispatch API gets the cadence the
 * cron expressions only claim.
 *
 * Cloudflare's cron triggers are free and run whether or not anything else is
 * awake, which is the whole point: nothing here depends on a laptop being on.
 */

const OWNER = 'rgxcode'
const REPO = 'portfolio-tracker'

/** Workflows to dispatch on every tick. */
const WORKFLOWS = ['fetch-prices.yml', 'llm-prices.yml']

/**
 * Workflows that do not need every tick. Published commentary does not turn
 * over hourly, and a runner spun up every five minutes to decide it has nothing
 * to do is waste — so these fire on matching hours only.
 */
const PERIODIC = [
  { workflow: 'insights.yml', hours: [6, 18] },
]

async function dispatch(workflow, token) {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        // GitHub rejects API requests without one.
        'User-Agent': 'portfolio-tracker-cron',
      },
      body: JSON.stringify({ ref: 'main' }),
    },
  )

  // 204 No Content is success here; anything else is worth seeing in the logs.
  if (res.status !== 204) {
    console.log(`${workflow}: ${res.status} ${await res.text()}`)
    return false
  }
  return true
}

async function runAll(env) {
  if (!env.GITHUB_TOKEN) {
    console.log('GITHUB_TOKEN is not set — nothing dispatched.')
    return { ok: false, error: 'missing token' }
  }

  // The cron fires every five minutes, so a periodic workflow is dispatched in
  // the first tick of its hour and skipped for the rest.
  const now = new Date()
  const due = PERIODIC
    .filter(p => p.hours.includes(now.getUTCHours()) && now.getUTCMinutes() < 5)
    .map(p => p.workflow)

  // Independent workflows, so fire them together rather than in sequence.
  const results = await Promise.all(
    [...WORKFLOWS, ...due].map(async w => [w, await dispatch(w, env.GITHUB_TOKEN)]),
  )
  const summary = Object.fromEntries(results)
  console.log('dispatched:', JSON.stringify(summary))
  return { ok: results.every(([, v]) => v), dispatched: summary }
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runAll(env))
  },

  /**
   * Same work over HTTP, so the schedule can be verified without waiting for
   * it. Requires the same token as a bearer, otherwise anyone could spend the
   * repository's Actions minutes.
   */
  async fetch(request, env) {
    const auth = request.headers.get('Authorization')
    if (!env.GITHUB_TOKEN || auth !== `Bearer ${env.GITHUB_TOKEN}`) {
      return new Response('Unauthorized\n', { status: 401 })
    }
    const result = await runAll(env)
    return Response.json(result, { status: result.ok ? 200 : 500 })
  },
}
