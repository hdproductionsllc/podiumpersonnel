/* eslint-disable @typescript-eslint/no-require-imports -- a plain CommonJS node script, run with `node` */
/**
 * preview-auto-cascade.js — what WOULD auto-offer do for an organization,
 * if you switched it on? READ-ONLY: it only ever sends GET requests.
 *
 *   node scripts/preview-auto-cascade.js <orgId>        one organization, chair by chair
 *   node scripts/preview-auto-cascade.js --all          every organization
 *   add --counts-only                                   totals only, no names
 *
 * Run it from the folder that holds .env.local (the service key is read from
 * there). For each upcoming active gig it lists every chair and what the
 * automatic offer would do next:
 *
 *   - a chair someone holds: nothing;
 *   - a chair with an offer out: "if <musician> declines or lets it lapse,
 *     Podium would offer it to <next> at <pay> until <time>", or "would email
 *     the admins: nobody left", or why it would do nothing;
 *   - an empty chair with no offer out: nothing. Auto-offer only acts when an
 *     offer ends, so it never starts on a chair by itself. If the chair's last
 *     offer was declined or ran out, it also says what Podium WOULD have done
 *     then, had auto-offer been on (switching it on does not go back and do it).
 *
 * It runs the app's own planner (src/lib/staffing/cascade-plan.ts, the code
 * advance() uses), so the answer is the real one, not a re-implementation.
 * Writes are impossible two ways: every request goes through getOnlyFetch,
 * which refuses anything but GET/HEAD, and the app's server clients (which
 * could write) are replaced by stubs that throw (scripts/lib/).
 *
 * Nothing is emailed, nothing is changed. Safe to run any time.
 */

const fs = require('fs')
const path = require('path')

/** fetch that refuses anything but GET and HEAD. */
function getOnlyFetch(input, init = {}) {
  const fromRequest = typeof Request !== 'undefined' && input instanceof Request ? input.method : undefined
  const method = String(init.method || fromRequest || 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    return Promise.reject(new Error(`preview-auto-cascade is read-only: refused a ${method} request`))
  }
  return fetch(input, init)
}

function readEnv() {
  const file = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(file)) {
    console.error(`No .env.local in ${process.cwd()}. Run this from the Podium folder.`)
    process.exit(1)
  }
  const env = fs.readFileSync(file, 'utf8')
  const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim()
  const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }
  return { url, key }
}

/** The app's TypeScript, loaded with the server clients swapped for throwing stubs. */
async function loadPlanner() {
  const { createJiti } = require('jiti')
  const jiti = createJiti(__filename, {
    fsCache: false,
    alias: {
      '@/lib/supabase/server': path.join(__dirname, 'lib', 'read-only-supabase-server.js'),
      '@': path.join(__dirname, '..', 'src'),
    },
  })
  return jiti.import(path.join(__dirname, '..', 'src', 'lib', 'staffing', 'cascade-plan.ts'))
}

const REASONS = {
  auto_off: 'auto-offer is off',
  not_ready: 'migration 096 is not applied yet: paste scripts/sql/096-auto-cascade-settings.paste.sql first',
  not_found: 'the offer or chair is gone',
  chair_opted_out: 'this chair is switched out of auto-offer',
  gig_closed: 'the gig is cancelled or completed',
  gig_not_active: 'the gig is not active',
  trigger_not_ended: 'the offer has not ended',
  already_cascaded: 'it already caused an automatic offer',
  already_exhausted: 'the list already ran out for it',
  chair_filled: 'the chair is filled',
  chair_has_live_offer: 'someone else is already being asked',
  no_time_left: "the gig's first service has started",
  error: 'something failed (see above)',
}

function money(n) {
  return `$${Number(n).toFixed(2).replace(/\.00$/, '')}`
}

function describePay(terms) {
  const base = terms.customPay != null ? `${money(terms.customPay)} for the whole gig` : "each service's own rate"
  if (terms.includeLeaderFee === true) return `${base}, leader fee ${money(terms.leaderFeeAmount ?? 0)}`
  if (terms.includeLeaderFee === false) return `${base}, no leader fee`
  return `${base} (leader fee as the offer email decides by default)`
}

function when(iso, timezone) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone || 'America/Chicago',
  })
}

const name = (m) => (m ? `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || 'someone' : 'someone')

async function must(promise, what) {
  const { data, error } = await promise
  if (error) throw new Error(`${what}: ${error.message || error.code}`)
  return data
}

async function previewOrg(db, planner, org, opts, totals) {
  const say = (line) => {
    if (!opts.countsOnly) console.log(line)
  }
  const now = Date.now()
  const tz = org.timezone

  const projects = await must(
    db
      .from('projects')
      .select('id, name, status, services(start_time)')
      .eq('organization_id', org.id)
      .eq('status', 'active'),
    `gigs of ${org.id}`
  )
  const upcoming = (projects || [])
    .map((p) => ({ ...p, firstStart: Math.min(...(p.services || []).map((s) => new Date(s.start_time).getTime()).filter(Number.isFinite)) }))
    .filter((p) => Number.isFinite(p.firstStart) && p.firstStart > now)
    .sort((a, b) => a.firstStart - b.firstStart)

  const counts = { gigs: upcoming.length, chairs: 0, filled: 0, waiting: 0, idle: 0, wouldOffer: 0, wouldEmailNobodyLeft: 0, wouldDoNothing: {}, hindsight: {} }
  say(`\n=== ${opts.countsOnly ? org.id : `${org.name} (${org.id})`} — auto-offer is ${org.auto_cascade === true ? 'ON' : 'off'} ===`)
  if (upcoming.length === 0) say('  No upcoming active gigs.')

  for (const project of upcoming) {
    say(`\n  ${project.name} — first service ${when(new Date(project.firstStart).toISOString(), tz)}`)
    const chairs = await must(
      db
        .from('project_positions')
        .select('id, chair_number, musician_id, instrument:instruments(name), musician:musicians(first_name, last_name)')
        .eq('project_id', project.id)
        .order('chair_number'),
      `chairs of gig ${project.id}`
    )
    const offers = await must(
      db
        .from('contract_offers')
        .select('id, status, project_position_id, sent_at, expires_at, musician:musicians(first_name, last_name)')
        .in('project_position_id', chairs.map((c) => c.id).length ? chairs.map((c) => c.id) : ['00000000-0000-0000-0000-000000000000'])
        .in('status', ['pending', 'viewed', 'declined', 'expired', 'released']),
      `offers of gig ${project.id}`
    )

    for (const chair of chairs) {
      counts.chairs++
      const label = `${chair.instrument?.name ?? 'Chair'} ${chair.chair_number}`
      if (chair.musician_id) {
        counts.filled++
        say(`    ${label}: filled by ${name(chair.musician)} — nothing to do`)
        continue
      }
      const onChair = offers
        .filter((o) => o.project_position_id === chair.id)
        .sort((a, b) => new Date(b.sent_at || 0).getTime() - new Date(a.sent_at || 0).getTime())
      const live = onChair.find((o) => o.status === 'pending' || o.status === 'viewed')
      if (!live) {
        counts.idle++
        const last = onChair[0]
        if (!last) {
          say(`    ${label}: empty, never offered — nothing (auto-offer only acts when an offer ends)`)
          continue
        }
        const had = await planner.planCascade(db, { positionId: chair.id, triggerOfferId: last.id, now, assume: { autoCascadeOn: true } })
        counts.hindsight[had.kind === 'skip' ? had.reason : had.kind] = (counts.hindsight[had.kind === 'skip' ? had.reason : had.kind] || 0) + 1
        const then =
          had.kind === 'offer'
            ? `it would have gone to ${name(had.musician)} at ${describePay(had.terms)}`
            : had.kind === 'exhausted'
              ? 'nobody free was left: the admins would have been emailed once'
              : `it would have done nothing (${REASONS[had.reason] || had.reason})`
        say(`    ${label}: empty, no offer out — nothing now. Its last offer (${name(last.musician)}) was ${last.status}; had auto-offer been on then, ${then}.`)
        continue
      }

      counts.waiting++
      const lapsed = live.expires_at && new Date(live.expires_at).getTime() < now
      const ask = `${name(live.musician)}'s offer ${lapsed ? 'has lapsed (the next cron run collects it)' : live.expires_at ? `runs to ${when(live.expires_at, tz)}` : 'has no deadline'}`
      const plan = await planner.planCascade(db, {
        positionId: chair.id,
        triggerOfferId: live.id,
        now,
        assume: { autoCascadeOn: true, triggerEnded: true },
      })

      if (plan.kind === 'offer') {
        counts.wouldOffer++
        say(`    ${label}: ${ask}. If it ends unanswered or declined, Podium would offer it to ${name(plan.musician)} at ${describePay(plan.terms)}, answer by ${when(plan.terms.expiresAt, tz)}${plan.skippedConflicts ? ` (passing over ${plan.skippedConflicts} with a conflict)` : ''}.`)
      } else if (plan.kind === 'exhausted') {
        counts.wouldEmailNobodyLeft++
        say(`    ${label}: ${ask}. If it ends, nobody free is left: Podium would email the admins once ("please pick someone").`)
      } else {
        counts.wouldDoNothing[plan.reason] = (counts.wouldDoNothing[plan.reason] || 0) + 1
        say(`    ${label}: ${ask}. Podium would do nothing: ${REASONS[plan.reason] || plan.reason}.`)
      }
    }
  }

  console.log(
    `  Totals for ${opts.countsOnly ? org.id : org.name}: ${counts.gigs} upcoming gig(s), ${counts.chairs} chair(s): ${counts.filled} filled, ` +
      `${counts.waiting} with an offer out, ${counts.idle} empty with none. If those offers end: ` +
      `${counts.wouldOffer} would be offered on, ${counts.wouldEmailNobodyLeft} would email "nobody left"` +
      `${Object.keys(counts.wouldDoNothing).length ? `, nothing for ${Object.entries(counts.wouldDoNothing).map(([r, n]) => `${n} (${r})`).join(', ')}` : ''}.` +
      (Object.keys(counts.hindsight).length
        ? ` Empty chairs whose last offer ended, had auto-offer been on: ${Object.entries(counts.hindsight).map(([r, n]) => `${n} ${r}`).join(', ')}.`
        : '')
  )
  for (const key of ['gigs', 'chairs', 'filled', 'waiting', 'idle', 'wouldOffer', 'wouldEmailNobodyLeft']) totals[key] = (totals[key] || 0) + counts[key]
}

async function main() {
  const args = process.argv.slice(2)
  const opts = { countsOnly: args.includes('--counts-only'), all: args.includes('--all') }
  const orgId = args.find((a) => !a.startsWith('--'))
  if (!orgId && !opts.all) {
    console.error('Usage: node scripts/preview-auto-cascade.js <orgId> [--counts-only]   (or --all)')
    process.exit(1)
  }

  const { url, key } = readEnv()
  const { createClient } = require('@supabase/supabase-js')
  const db = createClient(url, key, {
    global: { fetch: getOnlyFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const planner = await loadPlanner()

  let orgsQuery = db.from('organizations').select('id, name, timezone, auto_cascade').order('name')
  if (!opts.all) orgsQuery = orgsQuery.eq('id', orgId)
  let { data: orgs, error } = await orgsQuery
  if (error && /auto_cascade/.test(error.message || '')) {
    console.log('(migration 096 is not applied yet; reading without the auto-offer switch)')
    let fallback = db.from('organizations').select('id, name, timezone').order('name')
    if (!opts.all) fallback = fallback.eq('id', orgId)
    ;({ data: orgs, error } = await fallback)
  }
  if (error) throw new Error(`organizations: ${error.message}`)
  if (!orgs || orgs.length === 0) {
    console.error(`No organization ${orgId}`)
    process.exit(1)
  }

  const totals = {}
  for (const org of orgs) await previewOrg(db, planner, org, opts, totals)
  if (orgs.length > 1) {
    console.log(
      `\nAll ${orgs.length} organizations: ${totals.gigs} upcoming gig(s), ${totals.chairs} chair(s), ${totals.waiting} with an offer out; ` +
        `${totals.wouldOffer} would be offered on, ${totals.wouldEmailNobodyLeft} would email "nobody left".`
    )
  }
  console.log('\nRead-only: nothing was changed and nothing was sent.')
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err)
    process.exit(1)
  })
}

module.exports = { getOnlyFetch }
