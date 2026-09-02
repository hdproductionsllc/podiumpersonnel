/**
 * seed-crew-demo.js — fill a "Production Company" vertical demo org with a
 * realistic crew, one venue, and one sample show, for live interviews with
 * production-company owners.
 *
 * The org itself is NOT created here — David creates it through normal signup,
 * choosing the "Production Company" vertical. That flow seeds the org's
 * `instruments` table with crew roles (PRODUCTION_CREW_SEEDS, via
 * src/app/api/organization/seed-skills, defined in
 * src/lib/verticals/seeds.ts). This script only fills THAT org with data:
 *
 *   - 1 venue: Marriott Marquis Houston, Texas Ballroom
 *   - 12 crew members (musicians rows) with role assignments
 *   - 1 project ("Acme Corp General Session") with 3 services and 8 open
 *     positions, dated next Friday/Saturday relative to when you run this
 *
 * Every offer that would go out to the seeded crew lands in David's own
 * Gmail inbox — every email is a +plus-address on henrydavidphotography@gmail.com
 * (e.g. henrydavidphotography+a1@gmail.com), never example.com.
 *
 * Idempotent: everything is looked up by name/email first. Re-running this
 * script does not create duplicates.
 *
 * Usage:
 *   node scripts/seed-crew-demo.js --org <organization-uuid>            # dry-run
 *   node scripts/seed-crew-demo.js --org <organization-uuid> --apply    # writes
 *
 * Reads Supabase creds from .env.local (service role — bypasses RLS). The
 * script refuses to run against an org whose `vertical` is not
 * 'production_crew' (checked before anything else).
 */

const fs = require('fs')

const env = fs.readFileSync('.env.local', 'utf8')
const URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim()
const KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY }

const APPLY = process.argv.includes('--apply')
const orgFlagIndex = process.argv.indexOf('--org')
const ORG_ID = orgFlagIndex !== -1 ? process.argv[orgFlagIndex + 1] : null
if (!ORG_ID) {
  console.error('Usage: node scripts/seed-crew-demo.js --org <organization-uuid> [--apply]')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Small REST helpers (mirrors scripts/wire-shared-library.js conventions)
// ---------------------------------------------------------------------------

async function getJson(path) {
  const res = await fetch(URL + path, { headers: H })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

async function postJson(path, body) {
  const res = await fetch(URL + path, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Date/time helpers — America/Chicago wall-clock → UTC ISO string, no library
// ---------------------------------------------------------------------------

// Returns the UTC offset (in minutes, negative = behind UTC) that `timeZone`
// observes at the instant `utcMillis`. Works for any IANA zone using only
// the built-in Intl API (no external dependency).
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

// Converts a America/Chicago wall-clock date+time into a UTC ISO string.
function toISO(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  const naiveUTC = Date.UTC(y, m - 1, d, hh, mm)
  const offset = tzOffsetMinutes('America/Chicago', naiveUTC)
  return new Date(naiveUTC - offset * 60000).toISOString()
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function toDateStr(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

// Next occurrence of `targetDay` (0=Sun..6=Sat) strictly after today.
function nextWeekday(targetDay) {
  const today = new Date()
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let delta = (targetDay - d.getDay() + 7) % 7
  if (delta === 0) delta = 7 // "next Friday" always means a future Friday, not today
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

// Role names must match PRODUCTION_CREW_SEEDS in src/lib/verticals/seeds.ts
// exactly — that's what src/app/api/organization/seed-skills inserted into
// this org's `instruments` table.
const ROLE = {
  A1: 'A1 (FOH Audio Engineer)',
  A2: 'A2 (Monitor / Stage Audio)',
  L1: 'L1 (Lighting Designer)',
  V1: 'V1 (Video Director)',
  LED: 'LED Tech',
  HAND: 'Stagehand',
  RIG: 'Rigger',
}

// 12 crew members. `roles` is [{ name, isPrimary }, ...] — most have one role;
// a few carry a second (non-primary) role so the offer cascade has fallbacks
// (e.g. the A2 can also be called as a Stagehand).
const CREW = [
  { first: 'Marcus', last: 'Webb', plus: 'a1-1', phone: '(713) 555-0101', zip: '77002', callOrder: 1,
    roles: [{ name: ROLE.A1, isPrimary: true }] },
  { first: 'Elena', last: 'Torres', plus: 'a1-2', phone: '(713) 555-0102', zip: '77003', callOrder: 2,
    roles: [{ name: ROLE.A1, isPrimary: true }] },
  { first: 'DeShawn', last: 'Price', plus: 'a2', phone: '(713) 555-0103', zip: '77004', callOrder: 1,
    roles: [{ name: ROLE.A2, isPrimary: true }, { name: ROLE.HAND, isPrimary: false }] },
  { first: 'Casey', last: 'Lindqvist', plus: 'l1-1', phone: '(713) 555-0104', zip: '77005', callOrder: 1,
    roles: [{ name: ROLE.L1, isPrimary: true }] },
  { first: 'Priya', last: 'Anand', plus: 'l1-2', phone: '(713) 555-0105', zip: '77006', callOrder: 2,
    roles: [{ name: ROLE.L1, isPrimary: true }] },
  { first: 'Jordan', last: 'Whitfield', plus: 'v1', phone: '(713) 555-0106', zip: '77007', callOrder: 1,
    roles: [{ name: ROLE.V1, isPrimary: true }] },
  { first: 'Sam', last: 'Okafor', plus: 'led', phone: '(713) 555-0107', zip: '77008', callOrder: 1,
    roles: [{ name: ROLE.LED, isPrimary: true }, { name: ROLE.V1, isPrimary: false }] },
  { first: 'Trevor', last: 'Nguyen', plus: 'hand1', phone: '(713) 555-0108', zip: '77009', callOrder: 1,
    roles: [{ name: ROLE.HAND, isPrimary: true }] },
  { first: 'Bianca', last: 'Ruiz', plus: 'hand2', phone: '(713) 555-0109', zip: '77019', callOrder: 2,
    roles: [{ name: ROLE.HAND, isPrimary: true }] },
  { first: 'Kyle', last: 'Bennett', plus: 'hand3', phone: '(713) 555-0110', zip: '77024', callOrder: 3,
    roles: [{ name: ROLE.HAND, isPrimary: true }, { name: ROLE.RIG, isPrimary: false }] },
  { first: 'Monica', last: 'Ferreira', plus: 'hand4', phone: '(713) 555-0111', zip: '77025', callOrder: 4,
    roles: [{ name: ROLE.HAND, isPrimary: true }] },
  { first: 'Aaron', last: 'Delgado', plus: 'rig', phone: '(713) 555-0112', zip: '77026', callOrder: 1,
    roles: [{ name: ROLE.RIG, isPrimary: true }, { name: ROLE.HAND, isPrimary: false }] },
]

const PROJECT_NAME = 'Acme Corp General Session'

// Positions on the project (project-scoped, not per-service).
const POSITIONS = [
  { role: ROLE.A1, chairs: [1] },
  { role: ROLE.A2, chairs: [1] },
  { role: ROLE.L1, chairs: [1] },
  { role: ROLE.V1, chairs: [1] },
  { role: ROLE.LED, chairs: [1] },
  { role: ROLE.HAND, chairs: [1, 2, 3, 4] },
]

// ---------------------------------------------------------------------------
// Results tracking
// ---------------------------------------------------------------------------

const results = []
function record(kind, label, status, detail) {
  results.push({ kind, label, status, detail: detail || '' })
}

function statusWord() {
  return APPLY ? 'CREATED' : 'WOULD CREATE'
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(APPLY ? '\nAPPLYING seed:\n' : '\nDRY RUN (pass --apply to write):\n')

  // ---- Guard: org must exist and be the production_crew vertical ----------
  const [org] = await getJson(`/rest/v1/organizations?select=id,name,vertical&id=eq.${ORG_ID}`)
  if (!org) {
    console.error(`✗ Organization not found: ${ORG_ID}`)
    process.exit(1)
  }
  console.log(`Organization: ${org.name}  (vertical: ${org.vertical})`)
  if (org.vertical !== 'production_crew') {
    console.error(`\n✗ Refusing to seed — org vertical is '${org.vertical}', not 'production_crew'.`)
    console.error('  This script is for the "Production Company" vertical demo only.')
    process.exit(1)
  }
  console.log('')

  // ---- Resolve role name -> instrument id ----------------------------------
  const orgInstruments = await getJson(`/rest/v1/instruments?select=id,name&organization_id=eq.${ORG_ID}`)
  const instrumentByName = new Map(orgInstruments.map((i) => [i.name, i.id]))

  const neededRoles = new Set([...CREW.flatMap((c) => c.roles.map((r) => r.name)), ...POSITIONS.map((p) => p.role)])
  for (const roleName of neededRoles) {
    if (!instrumentByName.has(roleName)) {
      console.log(`  ACTION NEEDED: role "${roleName}" not found in this org's instruments table — skipping anything that needs it.`)
    }
  }

  // ---- Venue ----------------------------------------------------------------
  let venueId = null
  {
    const existing = await getJson(
      `/rest/v1/venues?select=id,name&organization_id=eq.${ORG_ID}&name=eq.${encodeURIComponent(VENUE.name)}`
    )
    if (existing[0]) {
      venueId = existing[0].id
      record('venue', VENUE.name, 'EXISTS')
    } else if (APPLY) {
      const [created] = await postJson('/rest/v1/venues', {
        organization_id: ORG_ID,
        name: VENUE.name,
        address: VENUE.address,
        city: VENUE.city,
        state: VENUE.state,
        zip: VENUE.zip,
      })
      venueId = created.id
      record('venue', VENUE.name, statusWord())
    } else {
      record('venue', VENUE.name, statusWord())
    }
  }

  // ---- Crew (musicians + musician_instruments) ------------------------------
  const musicianIdByEmail = new Map()

  for (const c of CREW) {
    const email = `henrydavidphotography+${c.plus}@gmail.com`
    const fullName = `${c.first} ${c.last}`

    let musicianId = null
    const existing = await getJson(
      `/rest/v1/musicians?select=id,email&organization_id=eq.${ORG_ID}&email=eq.${encodeURIComponent(email)}`
    )
    if (existing[0]) {
      musicianId = existing[0].id
      record('crew', fullName, 'EXISTS', email)
    } else if (APPLY) {
      const [created] = await postJson('/rest/v1/musicians', {
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
      })
      musicianId = created.id
      record('crew', fullName, statusWord(), email)
    } else {
      record('crew', fullName, statusWord(), email)
    }

    if (musicianId) musicianIdByEmail.set(email, musicianId)

    // Role links (musician_instruments)
    for (const role of c.roles) {
      const instrumentId = instrumentByName.get(role.name)
      if (!instrumentId) {
        record('role link', `${fullName} → ${role.name}`, 'SKIPPED', 'instrument not found')
        continue
      }
      if (!musicianId) {
        // dry-run with no musician id yet (musician doesn't exist and we're not applying)
        record('role link', `${fullName} → ${role.name}${role.isPrimary ? '' : ' (secondary)'}`, statusWord())
        continue
      }
      const existingLink = await getJson(
        `/rest/v1/musician_instruments?select=id&musician_id=eq.${musicianId}&instrument_id=eq.${instrumentId}`
      )
      const label = `${fullName} → ${role.name}${role.isPrimary ? '' : ' (secondary)'}`
      if (existingLink[0]) {
        record('role link', label, 'EXISTS')
      } else if (APPLY) {
        await postJson('/rest/v1/musician_instruments', {
          musician_id: musicianId,
          instrument_id: instrumentId,
          is_primary: role.isPrimary,
        })
        record('role link', label, statusWord())
      } else {
        record('role link', label, statusWord())
      }
    }
  }

  // ---- Project (the sample show) --------------------------------------------
  const friday = nextWeekday(5) // 5 = Friday
  const saturday = new Date(friday)
  saturday.setDate(saturday.getDate() + 1)
  const fridayStr = toDateStr(friday)
  const saturdayStr = toDateStr(saturday)

  let projectId = null
  {
    const existing = await getJson(
      `/rest/v1/projects?select=id,name&organization_id=eq.${ORG_ID}&name=eq.${encodeURIComponent(PROJECT_NAME)}`
    )
    if (existing[0]) {
      projectId = existing[0].id
      record('project', PROJECT_NAME, 'EXISTS')
    } else if (APPLY) {
      const [created] = await postJson('/rest/v1/projects', {
        organization_id: ORG_ID,
        name: PROJECT_NAME,
        description: 'Two-day corporate GA, 1,200 pax, IMAG + LED wall',
        start_date: fridayStr,
        end_date: saturdayStr,
        status: 'active',
      })
      projectId = created.id
      record('project', PROJECT_NAME, statusWord(), `${fridayStr} – ${saturdayStr}`)
    } else {
      record('project', PROJECT_NAME, statusWord(), `${fridayStr} – ${saturdayStr}`)
    }
  }

  // ---- Services ---------------------------------------------------------------
  const SERVICES = [
    { name: `${PROJECT_NAME} - Load-in`, service_type: 'load-in', date: fridayStr, start: '07:00', end: '15:00', call: '06:30', base_pay: 350 },
    { name: `${PROJECT_NAME} - Show Day`, service_type: 'show-day', date: saturdayStr, start: '06:00', end: '22:00', call: '05:30', base_pay: 550 },
    { name: `${PROJECT_NAME} - Strike`, service_type: 'strike', date: saturdayStr, start: '22:00', end: '23:59', call: '22:00', base_pay: 250 },
  ]

  for (const svc of SERVICES) {
    if (!projectId) {
      record('service', svc.name, statusWord())
      continue
    }
    const existing = await getJson(
      `/rest/v1/services?select=id,name&project_id=eq.${projectId}&name=eq.${encodeURIComponent(svc.name)}`
    )
    if (existing[0]) {
      record('service', svc.name, 'EXISTS')
      continue
    }
    if (APPLY) {
      await postJson('/rest/v1/services', {
        project_id: projectId,
        name: svc.name,
        service_type: svc.service_type,
        venue: VENUE.name,
        venue_id: venueId,
        start_time: toISO(svc.date, svc.start),
        end_time: toISO(svc.date, svc.end),
        call_time: toISO(svc.date, svc.call),
        base_pay: svc.base_pay,
        leader_fee: 0,
      })
      record('service', svc.name, statusWord())
    } else {
      record('service', svc.name, statusWord())
    }
  }

  // ---- Positions ----------------------------------------------------------
  for (const pos of POSITIONS) {
    const instrumentId = instrumentByName.get(pos.role)
    for (const chair of pos.chairs) {
      const label = `${pos.role} (chair ${chair})`
      if (!instrumentId) {
        record('position', label, 'SKIPPED', 'instrument not found')
        continue
      }
      if (!projectId) {
        record('position', label, statusWord())
        continue
      }
      const existing = await getJson(
        `/rest/v1/project_positions?select=id&project_id=eq.${projectId}&instrument_id=eq.${instrumentId}&chair_number=eq.${chair}`
      )
      if (existing[0]) {
        record('position', label, 'EXISTS')
        continue
      }
      if (APPLY) {
        await postJson('/rest/v1/project_positions', {
          project_id: projectId,
          instrument_id: instrumentId,
          chair_number: chair,
          status: 'vacant',
        })
        record('position', label, statusWord())
      } else {
        record('position', label, statusWord())
      }
    }
  }

  // ---- RESULTS table --------------------------------------------------------
  console.log('\nRESULTS\n')
  const kindWidth = Math.max(...results.map((r) => r.kind.length), 8)
  const labelWidth = Math.max(...results.map((r) => r.label.length), 5)
  const statusWidth = Math.max(...results.map((r) => r.status.length), 6)
  for (const r of results) {
    console.log(
      `  ${r.kind.padEnd(kindWidth)}  ${r.label.padEnd(labelWidth)}  ${r.status.padEnd(statusWidth)}  ${r.detail}`
    )
  }

  console.log('\nDashboard: https://app.podiumpersonnel.com/dashboard/projects')
  console.log('Reminder: offers sent to the seeded crew land as +plus-address emails in David\'s own Gmail inbox.\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
