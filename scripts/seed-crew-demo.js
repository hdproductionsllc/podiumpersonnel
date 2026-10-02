/* eslint-disable @typescript-eslint/no-require-imports -- a plain CommonJS node script, run with `node` */
/**
 * seed-crew-demo.js — fill a "Production Company" (production_crew) demo org
 * with a realistic crew, one venue and one sample show, for live interviews
 * with production-company owners.
 *
 * DRY RUN BY DEFAULT. Without --apply it only reads, and prints what it would
 * create. With --apply it writes, and every write is idempotent: re-running
 * creates nothing twice.
 *
 * The org itself is NOT created here. Create it through normal sign-up,
 * choosing "Production Company"; that seeds its Roles (PRODUCTION_CREW_SEEDS,
 * src/lib/verticals/seeds.ts) and, with migration 100 applied, turns on
 * call-scoped requirements and "I can't make it" for it. This script then adds:
 *
 *   - 1 venue: Marriott Marquis Houston, Texas Ballroom
 *   - 12 crew (musicians rows) with their roles and call order
 *   - 1 show, "Acme Corp General Session", next Friday and Saturday, with the
 *     three-call show's calls (Load-in, Show Day, Strike: the same call types
 *     and times as threeCallShowServices in src/lib/verticals/presets.ts, and
 *     no leader fee)
 *   - its crew as requirements (create_requirement, migration 099), each for
 *     the calls it works: A1 and L1 every call; A2, V1 and LED the show day;
 *     4 stagehands the load-in, 2 the strike; a rigger the load-in and strike.
 *
 * The crew's email addresses are plus-addresses on the inbox you pass with
 * --inbox (you+a1@gmail.com, ...), so every offer you send in the demo lands
 * in your own inbox and nothing reaches a stranger. Nothing here sends email;
 * offers go out only when you press Send Offer in the app.
 *
 * Usage:
 *   node scripts/seed-crew-demo.js --org <organization-uuid>                              # dry run
 *   node scripts/seed-crew-demo.js --org <organization-uuid> --inbox you@gmail.com --apply
 *
 * Reads Supabase credentials from .env.local (service role: bypasses row
 * security). Refuses to touch an org whose vertical is not 'production_crew',
 * or one whose call-scoped switch is off (migration 100 not applied when it
 * was created; ask Podium to switch it on).
 */

const fs = require('fs')
const crypto = require('crypto')

const APPLY = process.argv.includes('--apply')
function flag(name) {
  const i = process.argv.indexOf(name)
  return i !== -1 ? process.argv[i + 1] || null : null
}
const ORG_ID = flag('--org')
const INBOX = flag('--inbox') || 'demo@example.com'

if (!ORG_ID || !/^[0-9a-f-]{36}$/i.test(ORG_ID)) {
  console.error('Usage: node scripts/seed-crew-demo.js --org <organization-uuid> [--inbox you@gmail.com] [--apply]')
  process.exit(1)
}
if (!/^[^@\s+]+@[^@\s]+\.[^@\s]+$/.test(INBOX)) {
  console.error(`--inbox must be a plain address without a "+" (got "${INBOX}")`)
  process.exit(1)
}
if (APPLY && !flag('--inbox')) {
  console.error('--apply needs --inbox <your address>: the crew\'s emails are plus-addresses on it.')
  process.exit(1)
}

const env = fs.readFileSync('.env.local', 'utf8')
const URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim()
const KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY }

// ---------------------------------------------------------------------------
// REST helpers (the conventions of scripts/wire-shared-library.js)
// ---------------------------------------------------------------------------

async function getJson(path) {
  const res = await fetch(URL + path, { headers: H })
  if (!res.ok) throw new Error(`GET ${path.split('?')[0]} -> ${res.status} ${await res.text()}`)
  return res.json()
}

async function postJson(path, body) {
  if (!APPLY) throw new Error('internal: a write was attempted in a dry run')
  const res = await fetch(URL + path, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path.split('?')[0]} -> ${res.status} ${await res.text()}`)
  return res.json()
}

const q = encodeURIComponent

/** A fixed UUID for a name in this org: the same requirement gets the same request key on every run. */
function stableUuid(...parts) {
  const h = crypto.createHash('sha256').update(parts.join('|')).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

// ---------------------------------------------------------------------------
// Dates: America/Chicago wall clock -> UTC ISO, no library
// ---------------------------------------------------------------------------

function tzOffsetMinutes(timeZone, utcMillis) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = Object.fromEntries(dtf.formatToParts(new Date(utcMillis)).map((p) => [p.type, p.value]))
  const asIfUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  )
  return (asIfUTC - utcMillis) / 60000
}

function toISO(timeZone, dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  const naiveUTC = Date.UTC(y, m - 1, d, hh, mm)
  return new Date(naiveUTC - tzOffsetMinutes(timeZone, naiveUTC) * 60000).toISOString()
}

const pad2 = (n) => String(n).padStart(2, '0')
const toDateStr = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`

/** The next `targetDay` (0 = Sunday .. 6 = Saturday) strictly after today. */
function nextWeekday(targetDay) {
  const today = new Date()
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let delta = (targetDay - d.getDay() + 7) % 7
  if (delta === 0) delta = 7
  d.setDate(d.getDate() + delta)
  return d
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const VENUE = {
  name: 'Marriott Marquis Houston, Texas Ballroom',
  address: '1777 Walker St',
  city: 'Houston',
  state: 'TX',
  zip: '77010',
}

// Role names exactly as PRODUCTION_CREW_SEEDS seeded them.
const ROLE = {
  A1: 'A1 (FOH Audio Engineer)',
  A2: 'A2 (Monitor / Stage Audio)',
  L1: 'L1 (Lighting Designer)',
  V1: 'V1 (Video Director)',
  LED: 'LED Tech',
  HAND: 'Stagehand',
  RIG: 'Rigger',
}

// 12 crew. Most have one role; a few a second one, so a cascade has fallbacks.
const CREW = [
  { first: 'Marcus', last: 'Webb', plus: 'a1-1', phone: '(713) 555-0101', zip: '77002', callOrder: 1, roles: [[ROLE.A1, true]] },
  { first: 'Elena', last: 'Torres', plus: 'a1-2', phone: '(713) 555-0102', zip: '77003', callOrder: 2, roles: [[ROLE.A1, true]] },
  { first: 'DeShawn', last: 'Price', plus: 'a2', phone: '(713) 555-0103', zip: '77004', callOrder: 1, roles: [[ROLE.A2, true], [ROLE.HAND, false]] },
  { first: 'Casey', last: 'Lindqvist', plus: 'l1-1', phone: '(713) 555-0104', zip: '77005', callOrder: 1, roles: [[ROLE.L1, true]] },
  { first: 'Priya', last: 'Anand', plus: 'l1-2', phone: '(713) 555-0105', zip: '77006', callOrder: 2, roles: [[ROLE.L1, true]] },
  { first: 'Jordan', last: 'Whitfield', plus: 'v1', phone: '(713) 555-0106', zip: '77007', callOrder: 1, roles: [[ROLE.V1, true]] },
  { first: 'Sam', last: 'Okafor', plus: 'led', phone: '(713) 555-0107', zip: '77008', callOrder: 1, roles: [[ROLE.LED, true], [ROLE.V1, false]] },
  { first: 'Trevor', last: 'Nguyen', plus: 'hand1', phone: '(713) 555-0108', zip: '77009', callOrder: 1, roles: [[ROLE.HAND, true]] },
  { first: 'Bianca', last: 'Ruiz', plus: 'hand2', phone: '(713) 555-0109', zip: '77019', callOrder: 2, roles: [[ROLE.HAND, true]] },
  { first: 'Kyle', last: 'Bennett', plus: 'hand3', phone: '(713) 555-0110', zip: '77024', callOrder: 3, roles: [[ROLE.HAND, true], [ROLE.RIG, false]] },
  { first: 'Monica', last: 'Ferreira', plus: 'hand4', phone: '(713) 555-0111', zip: '77025', callOrder: 4, roles: [[ROLE.HAND, true]] },
  { first: 'Aaron', last: 'Delgado', plus: 'rig', phone: '(713) 555-0112', zip: '77026', callOrder: 1, roles: [[ROLE.RIG, true], [ROLE.HAND, false]] },
]

const PROJECT_NAME = 'Acme Corp General Session'

// The three-call show on a two-day show (threeCallShowServices, multi-day).
// Base pay is each call's rate, shown to the admin; an offer's pay is the
// whole-engagement amount (the requirement's default_pay below).
const CALLS = [
  { key: 'loadIn', name: `${PROJECT_NAME} Load-in`, service_type: 'load_in', day: 'first', start: '07:00', end: '15:00', call: '06:30', base_pay: 350 },
  { key: 'show', name: `${PROJECT_NAME} Show Day`, service_type: 'show_call', day: 'last', start: '06:00', end: '22:00', call: '05:30', base_pay: 550 },
  { key: 'strike', name: `${PROJECT_NAME} Strike`, service_type: 'strike', day: 'last', start: '22:00', end: '23:59', call: '22:00', base_pay: 250 },
]

// The crew list. calls: null = every call. pay: the whole-engagement amount per person.
const REQUIREMENTS = [
  { label: 'A1', role: ROLE.A1, quantity: 1, calls: null, pay: 1150 },
  { label: 'L1', role: ROLE.L1, quantity: 1, calls: null, pay: 1150 },
  { label: 'A2', role: ROLE.A2, quantity: 1, calls: ['show'], pay: 550 },
  { label: 'V1', role: ROLE.V1, quantity: 1, calls: ['show'], pay: 600 },
  { label: 'LED', role: ROLE.LED, quantity: 1, calls: ['show'], pay: 550 },
  { label: 'Hands load-in', role: ROLE.HAND, quantity: 4, calls: ['loadIn'], pay: 300 },
  { label: 'Hands strike', role: ROLE.HAND, quantity: 2, calls: ['strike'], pay: 200 },
  { label: 'Rigger', role: ROLE.RIG, quantity: 1, calls: ['loadIn', 'strike'], pay: 600 },
]

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

const results = []
const record = (kind, label, status, detail) => results.push({ kind, label, status, detail: detail || '' })
const NEW = APPLY ? 'CREATED' : 'WOULD CREATE'

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(APPLY ? '\nAPPLYING seed:\n' : '\nDRY RUN (nothing is written; pass --inbox and --apply to write):\n')

  // ---- Guard: a production company with its switch on ----------------------
  const [org] = await getJson(`/rest/v1/organizations?select=id,name,vertical,timezone,call_scoped_requirements&id=eq.${ORG_ID}`)
  if (!org) {
    console.error(`Organization not found: ${ORG_ID}`)
    process.exit(1)
  }
  console.log(`Organization: ${org.name} (vertical: ${org.vertical})`)
  if (org.vertical !== 'production_crew') {
    console.error(`\nRefusing: this org's vertical is '${org.vertical}', not 'production_crew'.`)
    console.error('This script is for a "Production Company" demo org only.')
    process.exit(1)
  }
  if (org.call_scoped_requirements !== true) {
    console.error('\nRefusing: this org has call-scoped requirements off (it was created before migration 100).')
    console.error('Ask Podium to switch it on (organizations.call_scoped_requirements), then run this again.')
    process.exit(1)
  }
  const timeZone = org.timezone || 'America/Chicago'

  const [owner] = await getJson(`/rest/v1/organization_members?select=user_id&organization_id=eq.${ORG_ID}&role=eq.owner&limit=1`)
  if (!owner) {
    console.error('\nRefusing: the org has no owner to record as the one who added the crew.')
    process.exit(1)
  }
  console.log(`Crew emails: plus-addresses on ${INBOX}\n`)

  // ---- Roles ------------------------------------------------------------------
  const roles = await getJson(`/rest/v1/instruments?select=id,name&organization_id=eq.${ORG_ID}`)
  const roleId = new Map(roles.map((r) => [r.name, r.id]))
  for (const name of new Set(Object.values(ROLE))) {
    if (!roleId.has(name)) console.log(`  ACTION NEEDED: role "${name}" is not in this org's Roles; anything needing it is skipped.`)
  }

  // ---- Venue ------------------------------------------------------------------
  let venueId = null
  {
    const [existing] = await getJson(`/rest/v1/venues?select=id&organization_id=eq.${ORG_ID}&name=eq.${q(VENUE.name)}`)
    if (existing) {
      venueId = existing.id
      record('venue', VENUE.name, 'EXISTS')
    } else {
      if (APPLY) venueId = (await postJson('/rest/v1/venues', { organization_id: ORG_ID, ...VENUE }))[0].id
      record('venue', VENUE.name, NEW)
    }
  }

  // ---- Crew -------------------------------------------------------------------
  const [user, domain] = INBOX.split('@')
  for (const c of CREW) {
    const email = `${user}+${c.plus}@${domain}`
    const fullName = `${c.first} ${c.last}`
    let musicianId = null
    const [existing] = await getJson(`/rest/v1/musicians?select=id&organization_id=eq.${ORG_ID}&email=eq.${q(email)}`)
    if (existing) {
      musicianId = existing.id
      record('crew', fullName, 'EXISTS', email)
    } else {
      if (APPLY) {
        musicianId = (await postJson('/rest/v1/musicians', {
          organization_id: ORG_ID,
          first_name: c.first,
          last_name: c.last,
          email,
          phone: c.phone,
          is_active: true,
          call_order: c.callOrder,
          zip_code: c.zip,
          service_radius_miles: 50,
          home_region: 'Houston',
        }))[0].id
      }
      record('crew', fullName, NEW, email)
    }

    for (const [roleName, isPrimary] of c.roles) {
      const label = `${fullName} -> ${roleName}${isPrimary ? '' : ' (second role)'}`
      const instrumentId = roleId.get(roleName)
      if (!instrumentId) {
        record('role', label, 'SKIPPED', 'role not found')
        continue
      }
      const [link] = musicianId
        ? await getJson(`/rest/v1/musician_instruments?select=id&musician_id=eq.${musicianId}&instrument_id=eq.${instrumentId}`)
        : []
      if (link) {
        record('role', label, 'EXISTS')
      } else {
        if (APPLY) await postJson('/rest/v1/musician_instruments', { musician_id: musicianId, instrument_id: instrumentId, is_primary: isPrimary })
        record('role', label, NEW)
      }
    }
  }

  // ---- The show ---------------------------------------------------------------
  const friday = nextWeekday(5)
  const saturday = new Date(friday)
  saturday.setDate(saturday.getDate() + 1)
  const days = { first: toDateStr(friday), last: toDateStr(saturday) }

  let projectId = null
  {
    const [existing] = await getJson(`/rest/v1/projects?select=id&organization_id=eq.${ORG_ID}&name=eq.${q(PROJECT_NAME)}`)
    if (existing) {
      projectId = existing.id
      record('show', PROJECT_NAME, 'EXISTS')
    } else {
      if (APPLY) {
        projectId = (await postJson('/rest/v1/projects', {
          organization_id: ORG_ID,
          name: PROJECT_NAME,
          description: 'Two-day corporate general session, 1,200 guests, IMAG and an LED wall',
          start_date: days.first,
          end_date: days.last,
          status: 'active',
        }))[0].id
      }
      record('show', PROJECT_NAME, NEW, `${days.first} to ${days.last}`)
    }
  }

  // ---- Calls ------------------------------------------------------------------
  const callId = {}
  for (const c of CALLS) {
    const [existing] = projectId
      ? await getJson(`/rest/v1/services?select=id&project_id=eq.${projectId}&name=eq.${q(c.name)}`)
      : []
    if (existing) {
      callId[c.key] = existing.id
      record('call', c.name, 'EXISTS')
      continue
    }
    const date = days[c.day]
    if (APPLY) {
      callId[c.key] = (await postJson('/rest/v1/services', {
        project_id: projectId,
        name: c.name,
        service_type: c.service_type,
        venue: VENUE.name,
        venue_id: venueId,
        start_time: toISO(timeZone, date, c.start),
        end_time: toISO(timeZone, date, c.end),
        call_time: toISO(timeZone, date, c.call),
        base_pay: c.base_pay,
        leader_fee: 0,
      }))[0].id
    }
    record('call', c.name, NEW, `${date} ${c.start}-${c.end}`)
  }

  // ---- The crew list (requirements and their chairs) -------------------------
  for (const r of REQUIREMENTS) {
    const label = `${r.quantity} x ${r.role} (${r.calls ? r.calls.join(' + ') : 'every call'})`
    const instrumentId = roleId.get(r.role)
    if (!instrumentId) {
      record('crew list', label, 'SKIPPED', 'role not found')
      continue
    }
    const key = stableUuid('seed-crew-demo', ORG_ID, PROJECT_NAME, r.label)
    const [existing] = await getJson(`/rest/v1/requirements?select=id&request_key=eq.${key}`)
    if (existing) {
      record('crew list', label, 'EXISTS')
      continue
    }
    if (APPLY) {
      const res = await postJson('/rest/v1/rpc/create_requirement', {
        p_project_id: projectId,
        p_instrument_id: instrumentId,
        p_quantity: r.quantity,
        p_created_by: owner.user_id,
        p_service_ids: r.calls ? r.calls.map((k) => callId[k]) : null,
        p_default_pay: r.pay,
        p_notes: null,
        p_request_key: key,
      })
      if (res.result !== 'created' && res.result !== 'existing') {
        record('crew list', label, 'REFUSED', JSON.stringify(res))
        continue
      }
    }
    record('crew list', label, NEW, `$${r.pay} each`)
  }

  // ---- RESULTS ------------------------------------------------------------------
  console.log('\nRESULTS\n')
  const w = (k) => Math.max(...results.map((r) => r[k].length))
  for (const r of results) {
    console.log(`  ${r.kind.padEnd(w('kind'))}  ${r.label.padEnd(w('label'))}  ${r.status.padEnd(w('status'))}  ${r.detail}`)
  }
  if (results.some((r) => r.status === 'REFUSED')) process.exitCode = 1
  console.log('\nNothing was emailed. Offers go out only when you press Send Offer in the app.\n')
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
