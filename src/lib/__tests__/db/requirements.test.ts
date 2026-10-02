import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { adminClient, asAnon, asUser } from './helpers'

/**
 * Migration 099 (requirements, and the call picker on one chair) against real
 * Postgres, using the production fixture of target architecture section 7.2
 * as far as it applies to this step:
 *
 *   Event "Acme Leadership Meeting": Load-in 07:00-11:00, Rehearsal
 *   15:00-17:00, Show 18:00-21:00, Strike 21:00-23:30. Requirements: TD
 *   (rehearsal + show), A1 (all four), A2 (show), L1 (all four), Playback
 *   (rehearsal + show), Stagehand x 8 (load-in), Stagehand x 4 (strike).
 *
 *   - create_requirement makes 17 chairs, numbered per role (Stagehand 1-8,
 *     then 9-12), each on exactly its calls; a retry makes nothing new;
 *   - it refuses an organization with the switch off, a non-admin, another
 *     organization, bad input, and a closed gig, writing nothing;
 *   - requirements.status follows its chairs (filled once enough are
 *     confirmed), and leaves 'cancelled' alone; a chair belongs only to a
 *     requirement of its own gig; deleting a requirement keeps its chairs;
 *   - members read requirements, nobody writes them from a browser, and the
 *     functions are the server's only;
 *   - set_position_scope sets one chair's calls, and refuses while someone
 *     holds or is considering the chair;
 *   - the auto-offer's "booked elsewhere" check does not flag the A2 (show
 *     only) for a morning booking, but does flag the A1 (every call); one
 *     chair's auto-offer leaves its neighbours alone;
 *   - the paste script is idempotent and its RESULTS are all PASS or INFO.
 *
 * Not here (later steps, or not yet true): one worker holding both a load-in
 * and a strike stagehand chair (today one person holds one chair per gig;
 * see the test that pins it), per-call pay rates, moving a call and
 * notifying, documents targeted at a call, crew vocabulary in emails.
 *
 * All data is synthetic.
 */

let db: Client

beforeAll(async () => {
  db = await adminClient()
  // Other files re-run earlier migrations' paste scripts; 099 is idempotent.
  await db.query(readFileSync(join(process.cwd(), 'supabase', 'migrations', '099_requirements.sql'), 'utf8'))
})

afterAll(async () => {
  await db?.end()
})

const DAY = 24 * 60 * 60 * 1000
const at = (ms: number) => new Date(Date.now() + ms).toISOString()

type Role = 'TD' | 'A1' | 'A2' | 'L1' | 'Playback' | 'Stagehand'
type Call = 'loadIn' | 'rehearsal' | 'show' | 'strike'

interface Crew {
  orgId: string
  adminUserId: string
  memberUserId: string
  projectId: string
  roles: Record<Role, string>
  calls: Record<Call, string>
  workers: string[]
}

/** A crew company (switch as given), an admin and a member, and the Acme event a week out. */
async function acme(opts: { scoped?: boolean; autoCascade?: boolean } = {}): Promise<Crew> {
  const c: Crew = {
    orgId: randomUUID(),
    adminUserId: randomUUID(),
    memberUserId: randomUUID(),
    projectId: randomUUID(),
    roles: { TD: randomUUID(), A1: randomUUID(), A2: randomUUID(), L1: randomUUID(), Playback: randomUUID(), Stagehand: randomUUID() },
    calls: { loadIn: randomUUID(), rehearsal: randomUUID(), show: randomUUID(), strike: randomUUID() },
    workers: [randomUUID(), randomUUID(), randomUUID()],
  }
  for (const u of [c.adminUserId, c.memberUserId]) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [u, `u-${u}@example.test`])
  }
  await db.query(
    'insert into organizations (id, name, slug, auto_cascade, call_scoped_requirements) values ($1, $2, $3, $4, $5)',
    [c.orgId, `Crew ${c.orgId}`, `crew-${c.orgId}`, opts.autoCascade ?? false, opts.scoped ?? true]
  )
  await db.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, 'admin'), ($1, $3, 'member')", [
    c.orgId,
    c.adminUserId,
    c.memberUserId,
  ])
  for (const [name, id] of Object.entries(c.roles)) {
    await db.query('insert into instruments (id, organization_id, name) values ($1, $2, $3)', [id, c.orgId, name])
  }
  for (const [i, id] of c.workers.entries()) {
    await db.query('insert into musicians (id, organization_id, first_name, last_name, email) values ($1, $2, $3, $4, $5)', [
      id,
      c.orgId,
      `Hand${i}`,
      'Crew',
      `hand${i}-${id}@example.test`,
    ])
  }
  await db.query("insert into projects (id, organization_id, name, status) values ($1, $2, 'Acme Leadership Meeting', 'active')", [
    c.projectId,
    c.orgId,
  ])
  const day = new Date(Date.now() + 7 * DAY)
  const t = (h: number, m = 0) => new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m)).toISOString()
  const rows: [string, string, string, string, string][] = [
    [c.calls.loadIn, 'Load-in', 'other', t(7), t(11)],
    [c.calls.rehearsal, 'Rehearsal', 'rehearsal', t(15), t(17)],
    [c.calls.show, 'Show', 'performance', t(18), t(21)],
    [c.calls.strike, 'Strike', 'other', t(21), t(23, 30)],
  ]
  for (const [id, name, type, start, end] of rows) {
    await db.query('insert into services (id, project_id, name, service_type, start_time, end_time) values ($1, $2, $3, $4, $5, $6)', [
      id,
      c.projectId,
      name,
      type,
      start,
      end,
    ])
  }
  return c
}

interface Made {
  result: string
  what?: string
  requirement?: { id: string; quantity: number; default_pay: number | null; status: string }
  position_ids?: string[]
}

/** create_requirement as the server calls it. */
async function requirement(
  c: Crew,
  role: Role,
  quantity: number,
  calls: Call[] | null,
  opts: { by?: string; pay?: number | null; key?: string | null; project?: string; instrument?: string; serviceIds?: string[] } = {}
): Promise<Made> {
  const { rows } = await db.query(
    'select create_requirement($1::uuid, $2::uuid, $3::int, $4::uuid, $5::uuid[], $6::numeric, $7::text, $8::uuid) as r',
    [
      opts.project ?? c.projectId,
      opts.instrument ?? c.roles[role],
      quantity,
      opts.by ?? c.adminUserId,
      opts.serviceIds ?? (calls ? calls.map((k) => c.calls[k]) : null),
      opts.pay ?? null,
      null,
      opts.key === undefined ? randomUUID() : opts.key,
    ]
  )
  return rows[0].r as Made
}

/** The production fixture's seven requirements. */
async function staffAcme(c: Crew) {
  return {
    td: await requirement(c, 'TD', 1, ['rehearsal', 'show']),
    a1: await requirement(c, 'A1', 1, null),
    a2: await requirement(c, 'A2', 1, ['show']),
    l1: await requirement(c, 'L1', 1, null),
    playback: await requirement(c, 'Playback', 1, ['rehearsal', 'show']),
    loadIn: await requirement(c, 'Stagehand', 8, ['loadIn'], { pay: 200 }),
    strike: await requirement(c, 'Stagehand', 4, ['strike'], { pay: 150 }),
  }
}

const callsOf = async (chair: string) =>
  (await db.query('select name from services_for_position($1) order by start_time', [chair])).rows.map((r) => r.name)

const count = async (sql: string, params: unknown[]) => Number((await db.query(sql, params)).rows[0].n)

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

describe('the production fixture: seven requirements make seventeen chairs', () => {
  it('17 chairs, numbered per role, each on exactly its calls', async () => {
    const c = await acme()
    const made = await staffAcme(c)
    for (const m of Object.values(made)) expect(m.result).toBe('created')

    expect(await count('select count(*) as n from project_positions where project_id = $1', [c.projectId])).toBe(17)
    expect(await count('select count(*) as n from project_positions where project_id = $1 and requirement_id is null', [c.projectId])).toBe(0)

    const hands = await db.query(
      'select chair_number, requirement_id from project_positions where project_id = $1 and instrument_id = $2 order by chair_number',
      [c.projectId, c.roles.Stagehand]
    )
    expect(hands.rows.map((r) => r.chair_number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(hands.rows.slice(0, 8).every((r) => r.requirement_id === made.loadIn.requirement!.id)).toBe(true)
    expect(hands.rows.slice(8).every((r) => r.requirement_id === made.strike.requirement!.id)).toBe(true)
    expect(made.loadIn.position_ids).toHaveLength(8)

    expect(await callsOf(made.td.position_ids![0])).toEqual(['Rehearsal', 'Show'])
    expect(await callsOf(made.a1.position_ids![0])).toEqual(['Load-in', 'Rehearsal', 'Show', 'Strike'])
    expect(await callsOf(made.a2.position_ids![0])).toEqual(['Show'])
    expect(await callsOf(made.l1.position_ids![0])).toEqual(['Load-in', 'Rehearsal', 'Show', 'Strike'])
    expect(await callsOf(made.playback.position_ids![0])).toEqual(['Rehearsal', 'Show'])
    for (const id of made.loadIn.position_ids!) expect(await callsOf(id)).toEqual(['Load-in'])
    for (const id of made.strike.position_ids!) expect(await callsOf(id)).toEqual(['Strike'])

    // "Every call" is the chair's own 'all' mode (so a call added later is
    // worked too), not a list of today's four.
    const a1 = await db.query('select scope_mode from project_positions where id = $1', [made.a1.position_ids![0]])
    expect(a1.rows[0].scope_mode).toBe('all')
    expect(await count('select count(*) as n from position_services ps join project_positions pp on pp.id = ps.project_position_id where pp.project_id = $1', [c.projectId])).toBe(2 + 1 + 2 + 8 + 4)

    // Every chair is vacant, every requirement open, the pay is one amount per chair.
    expect(await count("select count(*) as n from project_positions where project_id = $1 and status <> 'vacant'", [c.projectId])).toBe(0)
    expect(await count("select count(*) as n from requirements where project_id = $1 and status <> 'open'", [c.projectId])).toBe(0)
    expect(Number(made.loadIn.requirement!.default_pay)).toBe(200)

    // On record, by the admin.
    const events = await db.query(
      "select actor_type, actor_id, after from staffing_events where organization_id = $1 and action = 'requirement.created'",
      [c.orgId]
    )
    expect(events.rows).toHaveLength(7)
    expect(events.rows.every((e) => e.actor_type === 'admin' && e.actor_id === c.adminUserId)).toBe(true)
  })

  it('a retry with the same request key returns what the first made, and writes nothing', async () => {
    const c = await acme()
    const key = randomUUID()
    const first = await requirement(c, 'Stagehand', 8, ['loadIn'], { key })
    const again = await requirement(c, 'Stagehand', 8, ['loadIn'], { key })
    expect(first.result).toBe('created')
    expect(again.result).toBe('existing')
    expect(again.requirement!.id).toBe(first.requirement!.id)
    expect(again.position_ids).toEqual(first.position_ids)
    expect(await count('select count(*) as n from project_positions where project_id = $1', [c.projectId])).toBe(8)
    expect(await count('select count(*) as n from requirements where project_id = $1', [c.projectId])).toBe(1)

    // The same key on another gig is not a retry.
    const other = await acme()
    const reused = await requirement(other, 'Stagehand', 1, null, { key, instrument: other.roles.Stagehand })
    expect(reused.result).toBe('request_key_reused')
    expect(await count('select count(*) as n from project_positions where project_id = $1', [other.projectId])).toBe(0)
  })

  it("chair numbers continue after the role's existing chairs", async () => {
    const c = await acme()
    await db.query('insert into project_positions (project_id, instrument_id, chair_number) values ($1, $2, 3)', [c.projectId, c.roles.Stagehand])
    const made = await requirement(c, 'Stagehand', 2, ['strike'])
    const { rows } = await db.query('select chair_number from project_positions where requirement_id = $1 order by chair_number', [made.requirement!.id])
    expect(rows.map((r) => r.chair_number)).toEqual([4, 5])
  })
})

describe('create_requirement refuses, and writes nothing', () => {
  const nothingWritten = async (c: Crew) => {
    expect(await count('select count(*) as n from requirements where project_id = $1', [c.projectId])).toBe(0)
    expect(await count('select count(*) as n from project_positions where project_id = $1', [c.projectId])).toBe(0)
  }

  it('an organization with the switch off (every organization today)', async () => {
    const c = await acme({ scoped: false })
    expect((await requirement(c, 'Stagehand', 8, null)).result).toBe('not_enabled')
    expect((await requirement(c, 'Stagehand', 8, ['loadIn'])).result).toBe('not_enabled')
    await nothingWritten(c)
  })

  it('a member who is not an admin, and an admin of another organization', async () => {
    const c = await acme()
    const other = await acme()
    expect((await requirement(c, 'Stagehand', 1, null, { by: c.memberUserId })).result).toBe('forbidden')
    expect((await requirement(c, 'Stagehand', 1, null, { by: other.adminUserId })).result).toBe('forbidden')
    expect((await requirement(c, 'Stagehand', 1, null, { instrument: other.roles.Stagehand })).result).toBe('not_found')
    await nothingWritten(c)
  })

  it('bad input', async () => {
    const c = await acme()
    const other = await acme()
    expect((await requirement(c, 'Stagehand', 0, null)).result).toBe('invalid_quantity')
    expect((await requirement(c, 'Stagehand', 101, null)).result).toBe('invalid_quantity')
    expect((await requirement(c, 'Stagehand', 1, null, { pay: -5 })).result).toBe('invalid_pay')
    expect((await requirement(c, 'Stagehand', 1, [], { serviceIds: [] })).result).toBe('no_services')
    expect((await requirement(c, 'Stagehand', 1, null, { serviceIds: [other.calls.show] })).result).toBe('wrong_service')
    expect((await requirement(c, 'Stagehand', 1, null, { project: randomUUID() })).result).toBe('not_found')
    await nothingWritten(c)
  })

  it('a cancelled or completed gig', async () => {
    const c = await acme()
    await db.query("update projects set status = 'cancelled' where id = $1", [c.projectId])
    expect((await requirement(c, 'Stagehand', 1, null)).result).toBe('gig_closed')
    await nothingWritten(c)
  })
})

describe("a requirement's status follows its chairs", () => {
  const statusOf = async (id: string) => (await db.query('select status from requirements where id = $1', [id])).rows[0]?.status
  const confirm = (chair: string, worker: string) =>
    db.query("update project_positions set status = 'confirmed', musician_id = $2 where id = $1", [chair, worker])

  it('filled once as many chairs are confirmed as it asked for, open again when one empties', async () => {
    const c = await acme()
    const made = await requirement(c, 'Stagehand', 2, ['loadIn'])
    const [one, two] = made.position_ids!
    expect(await statusOf(made.requirement!.id)).toBe('open')
    await confirm(one, c.workers[0])
    expect(await statusOf(made.requirement!.id)).toBe('open')
    await confirm(two, c.workers[1])
    expect(await statusOf(made.requirement!.id)).toBe('filled')
    await db.query("update project_positions set status = 'vacant', musician_id = null where id = $1", [two])
    expect(await statusOf(made.requirement!.id)).toBe('open')
    // A removed chair does not count: one confirmed of two asked for.
    await db.query('delete from project_positions where id = $1', [two])
    expect(await statusOf(made.requirement!.id)).toBe('open')
  })

  it("leaves a cancelled requirement alone", async () => {
    const c = await acme()
    const made = await requirement(c, 'A2', 1, ['show'])
    await db.query("update requirements set status = 'cancelled' where id = $1", [made.requirement!.id])
    await confirm(made.position_ids![0], c.workers[0])
    expect(await statusOf(made.requirement!.id)).toBe('cancelled')
  })

  it('a chair belongs only to a requirement of its own gig', async () => {
    const c = await acme()
    const other = await acme()
    const theirs = await requirement(other, 'A2', 1, ['show'])
    const mine = await requirement(c, 'A2', 1, ['show'])
    await refused(
      () => db.query('update project_positions set requirement_id = $1 where id = $2', [theirs.requirement!.id, mine.position_ids![0]]),
      /requirement_wrong_project/
    )
  })

  it('deleting a requirement keeps its chairs; deleting the gig removes everything', async () => {
    const c = await acme()
    const made = await requirement(c, 'Stagehand', 2, ['strike'])
    await db.query('delete from requirements where id = $1', [made.requirement!.id])
    const { rows } = await db.query('select requirement_id from project_positions where id = any($1::uuid[])', [made.position_ids])
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.requirement_id === null)).toBe(true)

    const again = await requirement(c, 'Stagehand', 3, ['loadIn'])
    await confirm(again.position_ids![0], c.workers[0])
    await db.query('delete from projects where id = $1', [c.projectId])
    expect(await count('select count(*) as n from requirements where id = $1', [again.requirement!.id])).toBe(0)
  })

  it('a chair made any other way never touches a requirement', async () => {
    const c = await acme()
    const made = await requirement(c, 'A1', 1, null)
    const before = (await db.query('select updated_at from requirements where id = $1', [made.requirement!.id])).rows[0].updated_at
    const { rows } = await db.query('insert into project_positions (project_id, instrument_id, chair_number) values ($1, $2, 2) returning id', [
      c.projectId,
      c.roles.A1,
    ])
    await confirm(rows[0].id, c.workers[0])
    const after = (await db.query('select status, updated_at from requirements where id = $1', [made.requirement!.id])).rows[0]
    expect(after.status).toBe('open')
    expect(after.updated_at).toEqual(before)
  })
})

describe('who can see and change requirements', () => {
  it('members read their own organization\'s; nobody else does', async () => {
    const c = await acme()
    const other = await acme()
    const made = await requirement(c, 'A2', 1, ['show'])
    const mine = await asUser(db, c.memberUserId, (q) => q('select id from requirements where id = $1', [made.requirement!.id]))
    expect(mine.rows).toHaveLength(1)
    const theirs = await asUser(db, other.adminUserId, (q) => q('select id from requirements where id = $1', [made.requirement!.id]))
    expect(theirs.rows).toHaveLength(0)
    await asAnon(db, async (q) => {
      await refused(() => q('select id from requirements'), /42501|permission denied/)
    })
  })

  it('not even an admin writes one from a browser', async () => {
    const c = await acme()
    const made = await requirement(c, 'A2', 1, ['show'])
    for (const sql of [
      ['insert into requirements (project_id, instrument_id, quantity) values ($1, $2, 3)', [c.projectId, c.roles.A2]],
      ['update requirements set quantity = 9 where id = $1', [made.requirement!.id]],
      ['delete from requirements where id = $1', [made.requirement!.id]],
    ] as const) {
      await asUser(db, c.adminUserId, async (q) => {
        await refused(() => q(sql[0], [...sql[1]]), /42501|permission denied/)
      })
    }
  })

  it('the two functions are the server\'s only', async () => {
    const c = await acme()
    await asUser(db, c.adminUserId, async (q) => {
      await refused(
        () => q('select create_requirement($1::uuid, $2::uuid, 1, $3::uuid)', [c.projectId, c.roles.A2, c.adminUserId]),
        /42501|permission denied/
      )
    })
    await asUser(db, c.adminUserId, async (q) => {
      await refused(() => q('select set_position_scope($1::uuid, $2::uuid, null)', [randomUUID(), c.adminUserId]), /42501|permission denied/)
    })
  })
})

describe('set_position_scope: the call picker on one chair', () => {
  const setCalls = async (c: Crew, chair: string, calls: Call[] | null, by?: string) =>
    (
      await db.query('select set_position_scope($1::uuid, $2::uuid, $3::uuid[]) as r', [
        chair,
        by ?? c.adminUserId,
        calls ? calls.map((k) => c.calls[k]) : null,
      ])
    ).rows[0].r.result as string

  it('every call -> only some -> every call again, on record', async () => {
    const c = await acme()
    const made = await requirement(c, 'A1', 1, null)
    const chair = made.position_ids![0]
    expect(await setCalls(c, chair, ['rehearsal', 'show'])).toBe('updated')
    expect(await callsOf(chair)).toEqual(['Rehearsal', 'Show'])
    expect(await setCalls(c, chair, ['show', 'rehearsal'])).toBe('unchanged')
    expect(await setCalls(c, chair, null)).toBe('updated')
    expect(await callsOf(chair)).toEqual(['Load-in', 'Rehearsal', 'Show', 'Strike'])
    expect(await count('select count(*) as n from position_services where project_position_id = $1', [chair])).toBe(0)
    expect(await setCalls(c, chair, null)).toBe('unchanged')
    const events = await db.query("select before, after from staffing_events where entity_id = $1 and action = 'position.scope_changed' order by created_at", [chair])
    expect(events.rows).toHaveLength(2)
    expect(events.rows[0].before).toMatchObject({ scope_mode: 'all' })
    expect(events.rows[0].after).toMatchObject({ scope_mode: 'selected' })
  })

  it('refused while someone is considering the chair, or seated in it', async () => {
    const c = await acme()
    const made = await requirement(c, 'Stagehand', 2, ['loadIn'])
    const [offered, seated] = made.position_ids!
    await db.query("insert into contract_offers (project_position_id, musician_id, status) values ($1, $2, 'pending')", [offered, c.workers[0]])
    expect(await setCalls(c, offered, ['strike'])).toBe('chair_in_use')
    await db.query("update project_positions set status = 'confirmed', musician_id = $2 where id = $1", [seated, c.workers[1]])
    expect(await setCalls(c, seated, null)).toBe('chair_in_use')
    expect(await callsOf(offered)).toEqual(['Load-in'])
  })

  it('refuses bad input and the wrong people', async () => {
    const c = await acme()
    const other = await acme()
    const chair = (await requirement(c, 'A2', 1, ['show'])).position_ids![0]
    expect(await setCalls(c, chair, [])).toBe('no_services')
    expect(
      (await db.query('select set_position_scope($1::uuid, $2::uuid, $3::uuid[]) as r', [chair, c.adminUserId, [other.calls.show]])).rows[0].r.result
    ).toBe('wrong_service')
    expect(await setCalls(c, chair, ['strike'], c.memberUserId)).toBe('forbidden')
    expect(await setCalls(c, chair, ['strike'], other.adminUserId)).toBe('forbidden')
    expect(await setCalls(c, randomUUID(), null)).toBe('not_found')
    expect(await callsOf(chair)).toEqual(['Show'])
  })

  it('with the switch off, a chair cannot be limited (and "every call" changes nothing)', async () => {
    const c = await acme({ scoped: false })
    const { rows } = await db.query('insert into project_positions (project_id, instrument_id, chair_number) values ($1, $2, 1) returning id', [
      c.projectId,
      c.roles.A1,
    ])
    expect(await setCalls(c, rows[0].id, ['show'])).toBe('not_enabled')
    expect(await setCalls(c, rows[0].id, null)).toBe('unchanged')
  })
})

describe('the production fixture, staffed: auto-offer reads each chair\'s calls', () => {
  /** `worker` is booked on another event of the company the same morning (08:00-10:00). */
  async function bookedThatMorning(c: Crew, worker: string) {
    const projectId = randomUUID()
    const chairId = randomUUID()
    const morning = (await db.query('select start_time from services where id = $1', [c.calls.loadIn])).rows[0].start_time as Date
    await db.query("insert into projects (id, organization_id, name, status) values ($1, $2, 'Breakfast keynote', 'active')", [projectId, c.orgId])
    await db.query("insert into services (project_id, name, service_type, start_time, end_time) values ($1, 'Keynote', 'performance', $2, $3)", [
      projectId,
      new Date(morning.getTime() + 60 * 60 * 1000).toISOString(),
      new Date(morning.getTime() + 3 * 60 * 60 * 1000).toISOString(),
    ])
    await db.query('insert into project_positions (id, project_id, instrument_id, chair_number) values ($1, $2, $3, 1)', [chairId, projectId, c.roles.A2])
    await db.query("insert into contract_offers (project_position_id, musician_id, status) values ($1, $2, 'accepted')", [chairId, worker])
  }

  /** The chair's first offer, declined, so the auto-offer may act on it. */
  async function declined(chair: string, worker: string) {
    const id = randomUUID()
    await db.query("insert into contract_offers (id, project_position_id, musician_id, status) values ($1, $2, $3, 'declined')", [id, chair, worker])
    return id
  }
  const cascadeTo = async (trigger: string, worker: string) =>
    (await db.query('select cascade_offer($1, $2, $3, null, null, null) as r', [trigger, worker, at(DAY)])).rows[0].r.result as string

  it('the A2 (show only) is free for a morning booking elsewhere; the A1 (every call) is not', async () => {
    const c = await acme({ autoCascade: true })
    const made = await staffAcme(c)
    await bookedThatMorning(c, c.workers[1])
    expect(await cascadeTo(await declined(made.a1.position_ids![0], c.workers[0]), c.workers[1])).toBe('musician_has_conflict')
    expect(await cascadeTo(await declined(made.a2.position_ids![0], c.workers[0]), c.workers[1])).toBe('created')
  })

  it("one chair's auto-offer leaves the other chairs of its requirement alone", async () => {
    const c = await acme({ autoCascade: true })
    const made = await requirement(c, 'Stagehand', 8, ['loadIn'])
    const [first, ...rest] = made.position_ids!
    expect(await cascadeTo(await declined(first, c.workers[0]), c.workers[1])).toBe('created')
    const { rows } = await db.query('select status from project_positions where id = any($1::uuid[])', [rest])
    expect(rows.every((r) => r.status === 'vacant')).toBe(true)
  })

  it('today, one person holds one chair per gig, even a load-in and a strike chair (target architecture 7.2 expects otherwise; not changed here)', async () => {
    const c = await acme({ autoCascade: true })
    const made = await staffAcme(c)
    await db.query("insert into contract_offers (project_position_id, musician_id, status) values ($1, $2, 'accepted')", [
      made.loadIn.position_ids![0],
      c.workers[1],
    ])
    expect(await cascadeTo(await declined(made.strike.position_ids![0], c.workers[0]), c.workers[1])).toBe('musician_has_active_offer')
  })
})

describe('the paste script (scripts/sql/099-requirements.paste.sql)', () => {
  const script = readFileSync(join(process.cwd(), 'scripts', 'sql', '099-requirements.paste.sql'), 'utf8')

  it.each([1, 2])('run %i: every RESULTS row is PASS or INFO', async () => {
    const results = (await db.query(script)) as unknown as { rows: { check_name: string; result: string }[] }[]
    const table = results[results.length - 1].rows
    expect(table.length).toBeGreaterThanOrEqual(10)
    for (const row of table) {
      expect(row.result, row.check_name).toMatch(/^(PASS|INFO)/)
    }
  })

  it('records 099 as applied', async () => {
    const { rowCount } = await db.query("select 1 from supabase_migrations.schema_migrations where version = '099'")
    expect(rowCount).toBe(1)
  })
})
