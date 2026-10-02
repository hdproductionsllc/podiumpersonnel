import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { adminClient, asAnon, asUser } from './helpers'

/**
 * Migration 098 (which services a chair works) against real Postgres:
 *
 *   - organizations.call_scoped_requirements is off by default and only
 *     Podium (the service role) can change it;
 *   - every chair is scope_mode 'all' by default, and only 'all' / 'selected'
 *     are accepted;
 *   - a chair can be 'selected' only where the switch is on, and the switch
 *     cannot be turned off under a 'selected' chair;
 *   - position_services pairs a chair only with its own gig's services, goes
 *     with its chair or service, and is read by members / written by admins of
 *     the gig's organization only;
 *   - services_for_position: every service for 'all', the listed ones for
 *     'selected', none when none are listed (never widens);
 *   - cascade_offer's "booked elsewhere" and worker_drop's "has it started"
 *     read the chairs' services, and answer as before for 'all';
 *   - the paste script is idempotent and its RESULTS are all PASS or INFO.
 *
 * All data is synthetic.
 */

let db: Client

beforeAll(async () => {
  db = await adminClient()
  // Another file's paste-script test re-runs 096, which puts back the 096
  // cascade_offer and worker_drop; 098 is idempotent, so apply it again here.
  await db.query(readFileSync(join(process.cwd(), 'supabase', 'migrations', '098_position_services.sql'), 'utf8'))
})

afterAll(async () => {
  await db?.end()
})

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
const at = (ms: number) => new Date(Date.now() + ms).toISOString()

interface Gig {
  orgId: string
  adminUserId: string
  memberUserId: string
  projectId: string
  chairId: string
  instrumentId: string
  musicians: string[]
  /** rehearsal, show: in that order */
  services: string[]
}

/** An organization (switch as given), an admin and a plain member, a gig a week out with a rehearsal and a show, one chair. */
async function gig(opts: { scoped?: boolean; autoCascade?: boolean; rehearsalAt?: string } = {}): Promise<Gig> {
  const g: Gig = {
    orgId: randomUUID(),
    adminUserId: randomUUID(),
    memberUserId: randomUUID(),
    projectId: randomUUID(),
    chairId: randomUUID(),
    instrumentId: randomUUID(),
    musicians: [randomUUID(), randomUUID()],
    services: [randomUUID(), randomUUID()],
  }
  for (const u of [g.adminUserId, g.memberUserId]) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [u, `u-${u}@example.test`])
  }
  await db.query(
    'insert into organizations (id, name, slug, auto_cascade, call_scoped_requirements) values ($1, $2, $3, $4, $5)',
    [g.orgId, `Org ${g.orgId}`, `org-${g.orgId}`, opts.autoCascade ?? false, opts.scoped ?? false]
  )
  await db.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, 'admin'), ($1, $3, 'member')", [
    g.orgId,
    g.adminUserId,
    g.memberUserId,
  ])
  await db.query('insert into instruments (id, organization_id, name) values ($1, $2, $3)', [g.instrumentId, g.orgId, 'Stagehand'])
  for (const [i, id] of g.musicians.entries()) {
    await db.query('insert into musicians (id, organization_id, first_name, last_name, email) values ($1, $2, $3, $4, $5)', [
      id,
      g.orgId,
      `W${i}`,
      'Crew',
      `w${i}-${id}@example.test`,
    ])
  }
  await db.query("insert into projects (id, organization_id, name, status) values ($1, $2, 'Show', 'active')", [g.projectId, g.orgId])
  const rehearsal = opts.rehearsalAt ?? at(7 * DAY)
  await db.query(
    `insert into services (id, project_id, name, service_type, start_time, end_time) values
       ($1, $3, 'Rehearsal', 'rehearsal', $4, ($4::timestamptz + interval '2 hours')),
       ($2, $3, 'Show', 'performance', $5, ($5::timestamptz + interval '2 hours'))`,
    [g.services[0], g.services[1], g.projectId, rehearsal, at(7 * DAY + 6 * HOUR)]
  )
  await db.query('insert into project_positions (id, project_id, instrument_id, chair_number) values ($1, $2, $3, 1)', [
    g.chairId,
    g.projectId,
    g.instrumentId,
  ])
  return g
}

async function scope(g: Gig, chair: string, serviceIds: string[]) {
  await db.query("update project_positions set scope_mode = 'selected' where id = $1", [chair])
  for (const s of serviceIds) {
    await db.query('insert into position_services (project_position_id, service_id) values ($1, $2)', [chair, s])
  }
}

const servicesOf = async (chair: string) =>
  (await db.query('select id from services_for_position($1) order by start_time', [chair])).rows.map((r) => r.id)

/** Expect `fn` to fail with this message (Postgres error text or code). */
async function refused(fn: () => Promise<unknown>, match: RegExp) {
  let error: { message?: string; code?: string } | null = null
  try {
    await fn()
  } catch (e) {
    error = e as { message?: string; code?: string }
  }
  expect(error, 'expected the database to refuse').not.toBeNull()
  expect(`${error!.code} ${error!.message}`).toMatch(match)
}

describe('the defaults: nothing changes for anyone', () => {
  it('a new organization has the switch off; a new chair works every service', async () => {
    const id = randomUUID()
    const { rows } = await db.query('insert into organizations (id, name, slug) values ($1, $2, $3) returning call_scoped_requirements', [
      id,
      `Org ${id}`,
      `org-${id}`,
    ])
    expect(rows[0].call_scoped_requirements).toBe(false)
    const g = await gig()
    const chair = await db.query('select scope_mode from project_positions where id = $1', [g.chairId])
    expect(chair.rows[0].scope_mode).toBe('all')
  })

  it("only 'all' and 'selected' are accepted", async () => {
    const g = await gig({ scoped: true })
    await refused(() => db.query("update project_positions set scope_mode = 'some' where id = $1", [g.chairId]), /scope_mode_check|23514/)
    await refused(() => db.query('update project_positions set scope_mode = null where id = $1', [g.chairId]), /23502|null value/)
  })

  it("a chair in 'all' mode works every service of its gig, whatever position_services says", async () => {
    const g = await gig({ scoped: true })
    await db.query('insert into position_services (project_position_id, service_id) values ($1, $2)', [g.chairId, g.services[1]])
    expect(await servicesOf(g.chairId)).toEqual(g.services)
  })
})

describe("'selected' only where the organization's switch is on", () => {
  it('refused with the switch off, for every role (Podium included)', async () => {
    const g = await gig()
    await refused(() => db.query("update project_positions set scope_mode = 'selected' where id = $1", [g.chairId]), /call_scoped_requirements_off/)
    await refused(
      () =>
        db.query("insert into project_positions (project_id, instrument_id, chair_number, scope_mode) values ($1, $2, 2, 'selected')", [
          g.projectId,
          g.instrumentId,
        ]),
      /call_scoped_requirements_off/
    )
  })

  it('allowed with it on', async () => {
    const g = await gig({ scoped: true })
    await scope(g, g.chairId, [g.services[1]])
    expect(await servicesOf(g.chairId)).toEqual([g.services[1]])
  })

  it('the switch cannot be turned off under a scoped chair; it can once the chair is back to every service', async () => {
    const g = await gig({ scoped: true })
    await scope(g, g.chairId, [g.services[1]])
    await refused(() => db.query('update organizations set call_scoped_requirements = false where id = $1', [g.orgId]), /call_scoped_requirements_in_use/)
    await db.query("update project_positions set scope_mode = 'all' where id = $1", [g.chairId])
    await db.query('update organizations set call_scoped_requirements = false where id = $1', [g.orgId])
    const { rows } = await db.query('select call_scoped_requirements from organizations where id = $1', [g.orgId])
    expect(rows[0].call_scoped_requirements).toBe(false)
  })

  it("an organization's own admin cannot flip the switch (081 freezes it), but keeps the switches they own", async () => {
    const g = await gig()
    await asUser(db, g.adminUserId, async (q) => {
      await refused(() => q('update organizations set call_scoped_requirements = true where id = $1', [g.orgId]), /42501|managed by Podium/)
    })
    const ok = await asUser(db, g.adminUserId, (q) => q('update organizations set auto_cascade = true where id = $1', [g.orgId]))
    expect(ok.rowCount).toBe(1)
  })
})

describe('position_services', () => {
  it("a chair can only be paired with its own gig's services", async () => {
    const g = await gig({ scoped: true })
    const other = await gig({ scoped: true })
    await refused(
      () => db.query('insert into position_services (project_position_id, service_id) values ($1, $2)', [g.chairId, other.services[0]]),
      /position_service_wrong_project/
    )
    await db.query('insert into position_services (project_position_id, service_id) values ($1, $2)', [g.chairId, g.services[0]])
    await refused(
      () => db.query('update position_services set service_id = $2 where project_position_id = $1', [g.chairId, other.services[0]]),
      /position_service_wrong_project/
    )
  })

  it('a chair whose last service is deleted works NO services; it never widens back to the whole gig', async () => {
    const g = await gig({ scoped: true })
    await scope(g, g.chairId, [g.services[1]])
    await db.query('delete from services where id = $1', [g.services[1]])
    expect((await db.query('select 1 from position_services where project_position_id = $1', [g.chairId])).rowCount).toBe(0)
    expect(await servicesOf(g.chairId)).toEqual([])
  })

  it('goes with its chair', async () => {
    const g = await gig({ scoped: true })
    await scope(g, g.chairId, [g.services[0]])
    await db.query('delete from project_positions where id = $1', [g.chairId])
    expect((await db.query('select 1 from position_services where project_position_id = $1', [g.chairId])).rowCount).toBe(0)
  })

  it("members of the gig's organization read it, its admins write it, nobody else sees it", async () => {
    const g = await gig({ scoped: true })
    const other = await gig({ scoped: true })
    await scope(other, other.chairId, [other.services[0]])

    await asUser(db, g.adminUserId, async (q) => {
      await q("update project_positions set scope_mode = 'selected' where id = $1", [g.chairId])
      await q('insert into position_services (project_position_id, service_id) values ($1, $2)', [g.chairId, g.services[0]])
      expect((await q('select project_position_id from position_services')).rows.map((r) => r.project_position_id)).toEqual([g.chairId])
      // The other organization's chair: neither readable nor writable.
      expect((await q('delete from position_services where project_position_id = $1', [other.chairId])).rowCount).toBe(0)
      await refused(() => q('insert into position_services (project_position_id, service_id) values ($1, $2)', [other.chairId, other.services[1]]), /42501|row-level security/)
    })

    await scope(g, g.chairId, [g.services[0]])
    await asUser(db, g.memberUserId, async (q) => {
      expect((await q('select 1 from position_services where project_position_id = $1', [g.chairId])).rowCount).toBe(1)
      expect((await q('delete from position_services where project_position_id = $1', [g.chairId])).rowCount).toBe(0)
      await refused(() => q('insert into position_services (project_position_id, service_id) values ($1, $2)', [g.chairId, g.services[1]]), /42501|row-level security/)
    })

    await asAnon(db, async (q) => {
      expect((await q('select 1 from position_services')).rowCount).toBe(0)
    })
  })

  it('browsers cannot call services_for_position', async () => {
    const g = await gig()
    await asUser(db, g.adminUserId, async (q) => {
      await refused(() => q('select * from services_for_position($1)', [g.chairId]), /42501|permission denied/)
    })
  })
})

// ---------------------------------------------------------------------------
// The two database steps that read a chair's services
// ---------------------------------------------------------------------------

/** The chair's last offer, ended, so cascade_offer may act on it. */
async function declined(g: Gig): Promise<string> {
  const id = randomUUID()
  await db.query("insert into contract_offers (id, project_position_id, musician_id, status) values ($1, $2, $3, 'declined')", [
    id,
    g.chairId,
    g.musicians[0],
  ])
  return id
}

/** `musician` holds an accepted offer on another gig of the same organization, at these times. */
async function bookedElsewhere(g: Gig, musician: string, startsAt: string, endsAt: string, scoped = false) {
  const projectId = randomUUID()
  const chairId = randomUUID()
  await db.query("insert into projects (id, organization_id, name, status) values ($1, $2, 'Other', 'active')", [projectId, g.orgId])
  const serviceId = randomUUID()
  const lateId = randomUUID()
  await db.query(
    `insert into services (id, project_id, name, service_type, start_time, end_time) values
       ($1, $3, 'Load-in', 'other', $4, $5),
       ($2, $3, 'Late show', 'performance', ($5::timestamptz + interval '10 hours'), ($5::timestamptz + interval '12 hours'))`,
    [serviceId, lateId, projectId, startsAt, endsAt]
  )
  await db.query('insert into project_positions (id, project_id, instrument_id, chair_number) values ($1, $2, $3, 1)', [chairId, projectId, g.instrumentId])
  // Their chair there works only the late show, when it is scoped.
  if (scoped) await scope(g, chairId, [lateId])
  await db.query("insert into contract_offers (project_position_id, musician_id, status) values ($1, $2, 'accepted')", [chairId, musician])
}

const cascadeTo = async (trigger: string, musician: string) =>
  (
    await db.query('select cascade_offer($1, $2, $3, null, null, null) as r', [trigger, musician, at(DAY)])
  ).rows[0].r.result as string

describe('cascade_offer: booked elsewhere means during a call the chair works', () => {
  it("chairs on the whole gig: a clash with any service is a clash, as before", async () => {
    const g = await gig({ autoCascade: true })
    const show = (await db.query('select start_time from services where id = $1', [g.services[1]])).rows[0].start_time.toISOString()
    await bookedElsewhere(g, g.musicians[1], show, new Date(new Date(show).getTime() + HOUR).toISOString())
    expect(await cascadeTo(await declined(g), g.musicians[1])).toBe('musician_has_conflict')
  })

  it('our chair works only the rehearsal: the evening booking is no clash', async () => {
    const g = await gig({ autoCascade: true, scoped: true })
    await scope(g, g.chairId, [g.services[0]])
    const show = (await db.query('select start_time from services where id = $1', [g.services[1]])).rows[0].start_time.toISOString()
    await bookedElsewhere(g, g.musicians[1], show, new Date(new Date(show).getTime() + HOUR).toISOString())
    expect(await cascadeTo(await declined(g), g.musicians[1])).toBe('created')
  })

  it("their chair elsewhere works only that gig's late show: its load-in at the same time is no clash", async () => {
    const g = await gig({ autoCascade: true, scoped: true })
    const show = (await db.query('select start_time from services where id = $1', [g.services[1]])).rows[0].start_time.toISOString()
    await bookedElsewhere(g, g.musicians[1], show, new Date(new Date(show).getTime() + HOUR).toISOString(), true)
    expect(await cascadeTo(await declined(g), g.musicians[1])).toBe('created')
  })

  it('our chair works no services: nothing can clash', async () => {
    const g = await gig({ autoCascade: true, scoped: true })
    await scope(g, g.chairId, [])
    const show = (await db.query('select start_time from services where id = $1', [g.services[1]])).rows[0].start_time.toISOString()
    await bookedElsewhere(g, g.musicians[1], show, new Date(new Date(show).getTime() + HOUR).toISOString())
    expect(await cascadeTo(await declined(g), g.musicians[1])).toBe('created')
  })
})

describe("worker_drop: 'has it started' means the chair's first call", () => {
  async function seated(g: Gig): Promise<string> {
    await db.query('update organizations set allow_worker_drop = true where id = $1', [g.orgId])
    const id = randomUUID()
    await db.query("insert into contract_offers (id, project_position_id, musician_id, status) values ($1, $2, $3, 'accepted')", [
      id,
      g.chairId,
      g.musicians[0],
    ])
    await db.query("update project_positions set musician_id = $1, status = 'confirmed' where id = $2", [g.musicians[0], g.chairId])
    return id
  }
  const drop = async (offer: string) => (await db.query('select worker_drop($1, null) as r', [offer])).rows[0].r as string

  it('whole gig: the rehearsal has started, so no drop (as before)', async () => {
    const g = await gig({ rehearsalAt: at(-HOUR) })
    expect(await drop(await seated(g))).toBe('gig_started')
  })

  it('a chair on the show only: the rehearsal having started does not stop it', async () => {
    const g = await gig({ scoped: true, rehearsalAt: at(-HOUR) })
    await scope(g, g.chairId, [g.services[1]])
    expect(await drop(await seated(g))).toBe('released')
  })

  it('a chair on the rehearsal only: it has started', async () => {
    const g = await gig({ scoped: true, rehearsalAt: at(-HOUR) })
    await scope(g, g.chairId, [g.services[0]])
    expect(await drop(await seated(g))).toBe('gig_started')
  })
})

describe('the paste script (scripts/sql/098-position-services.paste.sql)', () => {
  const script = readFileSync(join(process.cwd(), 'scripts', 'sql', '098-position-services.paste.sql'), 'utf8')

  it.each([1, 2])('run %i: every RESULTS row is PASS or INFO', async () => {
    // Other tests in this file leave scoped chairs behind; the script's
    // "nobody is scoped yet" checks are about a production database, so clear them.
    await db.query("update project_positions set scope_mode = 'all' where scope_mode = 'selected'")
    await db.query('update organizations set call_scoped_requirements = false where call_scoped_requirements')
    const results = (await db.query(script)) as unknown as { rows: { check_name: string; result: string }[] }[]
    const table = results[results.length - 1].rows
    expect(table.length).toBeGreaterThanOrEqual(12)
    for (const row of table) {
      expect(row.result, row.check_name).toMatch(/^(PASS|INFO)/)
    }
  })

  it('records 098 as applied', async () => {
    const { rowCount } = await db.query("select 1 from supabase_migrations.schema_migrations where version = '098'")
    expect(rowCount).toBe(1)
  })
})
