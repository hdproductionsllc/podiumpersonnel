import { randomUUID } from 'crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { adminClient, asUser } from './helpers'

/**
 * Migration 096's cascade functions against real Postgres:
 *
 *   cascade_offer           offers an ended offer's chair to the next musician
 *   mark_cascade_exhausted  claims the one "nobody left" email for an ended offer
 *   cascade_refusal         every reason both of them stop
 *
 * The in-memory copies in helpers/staffing-rpcs.ts follow these; this file is
 * what says the SQL itself is right, including under real concurrency (two
 * connections racing for the same ended offer). All data is synthetic.
 */

let db: Client
let other: Client

beforeAll(async () => {
  db = await adminClient()
  other = await adminClient()
})

afterAll(async () => {
  await db?.end()
  await other?.end()
})

interface Gig {
  orgId: string
  adminUserId: string
  projectId: string
  chairId: string
  otherChairId: string
  musicians: string[]
}

const FUTURE = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
const SOON = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

/** An organization with auto-offer on, an active gig a week out, two chairs and three musicians. */
async function gig(opts: { autoCascade?: boolean; projectStatus?: string } = {}): Promise<Gig> {
  const g: Gig = {
    orgId: randomUUID(),
    adminUserId: randomUUID(),
    projectId: randomUUID(),
    chairId: randomUUID(),
    otherChairId: randomUUID(),
    musicians: [randomUUID(), randomUUID(), randomUUID()],
  }
  const instrumentId = randomUUID()
  await db.query('insert into auth.users (id, email) values ($1, $2)', [g.adminUserId, `admin-${g.adminUserId}@example.test`])
  await db.query('insert into organizations (id, name, slug, auto_cascade) values ($1, $2, $3, $4)', [
    g.orgId,
    `Org ${g.orgId}`,
    `org-${g.orgId}`,
    opts.autoCascade ?? true,
  ])
  await db.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, 'admin')", [g.orgId, g.adminUserId])
  await db.query('insert into instruments (id, organization_id, name) values ($1, $2, $3)', [instrumentId, g.orgId, 'Violin'])
  for (const [i, id] of g.musicians.entries()) {
    await db.query('insert into musicians (id, organization_id, first_name, last_name, email) values ($1, $2, $3, $4, $5)', [
      id,
      g.orgId,
      `M${i}`,
      'Player',
      `m${i}-${id}@example.test`,
    ])
  }
  await db.query('insert into projects (id, organization_id, name, status) values ($1, $2, $3, $4)', [
    g.projectId,
    g.orgId,
    'Gig',
    opts.projectStatus ?? 'active',
  ])
  await db.query("insert into services (project_id, name, service_type, start_time) values ($1, 'Ceremony', 'performance', $2)", [
    g.projectId,
    FUTURE(),
  ])
  await db.query('insert into project_positions (id, project_id, instrument_id, chair_number) values ($1, $2, $3, 1), ($4, $2, $3, 2)', [
    g.chairId,
    g.projectId,
    instrumentId,
    g.otherChairId,
  ])
  return g
}

/** An offer on the gig's chair, already ended (declined unless said otherwise). */
async function endedOffer(g: Gig, status = 'declined', musician = g.musicians[0], chair = g.chairId): Promise<string> {
  const id = randomUUID()
  await db.query('insert into contract_offers (id, project_position_id, musician_id, status) values ($1, $2, $3, $4)', [
    id,
    chair,
    musician,
    status,
  ])
  return id
}

type CascadeResult = { result: string; offer?: { id: string; expires_at: string } }

async function cascade(client: Client, trigger: string, musician: string, expiresAt: string | null = SOON()): Promise<CascadeResult> {
  const { rows } = await client.query(
    'select cascade_offer($1, $2, $3, $4, $5, $6) as r',
    [trigger, musician, expiresAt, 300, JSON.stringify({ pay: { custom_pay: 300 } }), 'queued']
  )
  return rows[0].r
}

async function markExhausted(client: Client, trigger: string): Promise<string> {
  const { rows } = await client.query('select mark_cascade_exhausted($1) as r', [trigger])
  return rows[0].r
}

const cascadedFrom = async (trigger: string) =>
  (await db.query('select * from contract_offers where cascaded_from_offer_id = $1', [trigger])).rows

describe('cascade_offer', () => {
  it('offers the chair to the musician on the given terms, as the system, and remembers the cause', async () => {
    const g = await gig()
    const trigger = await endedOffer(g)
    const out = await cascade(db, trigger, g.musicians[1])
    expect(out.result).toBe('created')

    const [row] = await cascadedFrom(trigger)
    expect(row).toMatchObject({
      id: out.offer!.id,
      musician_id: g.musicians[1],
      project_position_id: g.chairId,
      status: 'pending',
      created_by: null,
      delivery_status: 'queued',
      is_substitution: false,
    })
    expect(Number(row.custom_pay)).toBe(300)
    expect(row.terms_snapshot).toEqual({ pay: { custom_pay: 300 } })

    const chair = await db.query('select status from project_positions where id = $1', [g.chairId])
    expect(chair.rows[0].status).toBe('offered')

    const history = await db.query(
      "select action, actor_type, actor_id, after from staffing_events where entity_id = $1 order by created_at, action",
      [out.offer!.id]
    )
    expect(history.rows.map((r) => [r.action, r.actor_type, r.actor_id])).toEqual(
      expect.arrayContaining([
        ['offer.created', 'system', null],
        ['cascade.offered', 'system', null],
      ])
    )
    expect(history.rows.find((r) => r.action === 'cascade.offered')!.after.trigger_offer_id).toBe(trigger)
  })

  it('a second call for the same ended offer makes nothing', async () => {
    const g = await gig()
    const trigger = await endedOffer(g)
    expect((await cascade(db, trigger, g.musicians[1])).result).toBe('created')
    // The first one is answered, so the chair is free again: the cause is what stops it.
    await db.query("update contract_offers set status = 'declined' where cascaded_from_offer_id = $1", [trigger])
    expect((await cascade(db, trigger, g.musicians[2])).result).toBe('already_cascaded')
    expect(await cascadedFrom(trigger)).toHaveLength(1)
  })

  it('two connections racing for the same ended offer: exactly one offer', async () => {
    const g = await gig()
    const trigger = await endedOffer(g)
    const results = await Promise.all([cascade(db, trigger, g.musicians[1]), cascade(other, trigger, g.musicians[2])])
    expect(results.map((r) => r.result).sort()).toEqual(['already_cascaded', 'created'])
    expect(await cascadedFrom(trigger)).toHaveLength(1)
  })

  it('two ended offers on one chair racing (decline vs cron): one live offer', async () => {
    const g = await gig()
    const declined = await endedOffer(g, 'declined', g.musicians[0])
    const expired = await endedOffer(g, 'expired', g.musicians[1])
    const results = await Promise.all([cascade(db, declined, g.musicians[2]), cascade(other, expired, g.musicians[2])])
    expect(results.map((r) => r.result).sort()).toEqual(['chair_has_live_offer', 'created'])
    const live = await db.query("select id from contract_offers where project_position_id = $1 and status in ('pending', 'viewed')", [g.chairId])
    expect(live.rowCount).toBe(1)
  })

  describe('does nothing when', () => {
    it.each([
      ['the organization has auto-offer off', { autoCascade: false }, async () => {}, 'auto_off'],
      ['the gig is cancelled', { projectStatus: 'cancelled' }, async () => {}, 'gig_closed'],
      ['the gig is completed', { projectStatus: 'completed' }, async () => {}, 'gig_closed'],
      ['the gig is a draft', { projectStatus: 'draft' }, async () => {}, 'gig_not_active'],
      ['the chair is switched out', {}, async (g: Gig) => {
        await db.query('update project_positions set auto_cascade_disabled = true where id = $1', [g.chairId])
      }, 'chair_opted_out'],
      ['the chair is filled', {}, async (g: Gig) => {
        await db.query("update project_positions set musician_id = $2, status = 'confirmed' where id = $1", [g.chairId, g.musicians[2]])
      }, 'chair_filled'],
      ['someone is already being asked', {}, async (g: Gig) => {
        await endedOffer(g, 'pending', g.musicians[2])
      }, 'chair_has_live_offer'],
    ] as const)('%s', async (_label, setup, arrange, reason) => {
      const g = await gig(setup)
      const trigger = await endedOffer(g)
      await arrange(g)
      expect((await cascade(db, trigger, g.musicians[1])).result).toBe(reason)
      expect(await cascadedFrom(trigger)).toHaveLength(0)
    })

    it('the offer has not ended', async () => {
      const g = await gig()
      const trigger = await endedOffer(g, 'accepted')
      expect((await cascade(db, trigger, g.musicians[1])).result).toBe('trigger_not_ended')
      const rescinded = await endedOffer(g, 'rescinded', g.musicians[2], g.otherChairId)
      expect((await cascade(db, rescinded, g.musicians[1])).result).toBe('trigger_not_ended')
    })

    it('there is no time left to answer', async () => {
      const g = await gig()
      const trigger = await endedOffer(g)
      expect((await cascade(db, trigger, g.musicians[1], null)).result).toBe('no_time_left')
      expect((await cascade(db, trigger, g.musicians[1], new Date(Date.now() - 1000).toISOString())).result).toBe('no_time_left')
    })

    it('the musician is unavailable, inactive or from another organization', async () => {
      const g = await gig()
      const trigger = await endedOffer(g)
      await endedOffer(g, 'pending', g.musicians[1], g.otherChairId)
      expect((await cascade(db, trigger, g.musicians[1])).result).toBe('musician_has_active_offer')

      await db.query('update musicians set is_active = false where id = $1', [g.musicians[2]])
      expect((await cascade(db, trigger, g.musicians[2])).result).toBe('musician_inactive')

      const stranger = await gig()
      expect((await cascade(db, trigger, stranger.musicians[0])).result).toBe('wrong_organization')
      expect((await cascade(db, trigger, randomUUID())).result).toBe('musician_not_found')
      expect(await cascadedFrom(trigger)).toHaveLength(0)
    })
  })
})

describe('mark_cascade_exhausted', () => {
  it('marks once, records it, and refuses a second time', async () => {
    const g = await gig()
    const trigger = await endedOffer(g, 'expired')
    expect(await markExhausted(db, trigger)).toBe('marked')
    expect(await markExhausted(db, trigger)).toBe('already_exhausted')

    const row = await db.query('select cascade_exhausted_at from contract_offers where id = $1', [trigger])
    expect(row.rows[0].cascade_exhausted_at).not.toBeNull()
    const history = await db.query("select actor_type from staffing_events where entity_id = $1 and action = 'cascade.exhausted'", [trigger])
    expect(history.rows).toEqual([{ actor_type: 'system' }])
    // ...and an exhausted offer cascades no more.
    expect((await cascade(db, trigger, g.musicians[1])).result).toBe('already_exhausted')
  })

  it('two connections at once: one email claim', async () => {
    const g = await gig()
    const trigger = await endedOffer(g)
    const results = await Promise.all([markExhausted(db, trigger), markExhausted(other, trigger)])
    expect(results.sort()).toEqual(['already_exhausted', 'marked'])
  })

  it('is refused once an automatic offer exists, or the switch is off', async () => {
    const g = await gig()
    const trigger = await endedOffer(g)
    await cascade(db, trigger, g.musicians[1])
    expect(await markExhausted(db, trigger)).toBe('already_cascaded')

    const off = await gig({ autoCascade: false })
    expect(await markExhausted(db, await endedOffer(off))).toBe('auto_off')
  })
})

describe('only the server can call them', () => {
  it.each([
    ['cascade_offer', `select cascade_offer('${randomUUID()}', '${randomUUID()}', now() + interval '1 day')`],
    ['mark_cascade_exhausted', `select mark_cascade_exhausted('${randomUUID()}')`],
    ['cascade_refusal', `select cascade_refusal('${randomUUID()}')`],
  ])('%s is refused to a signed-in user', async (_fn, sql) => {
    const g = await gig()
    await expect(asUser(db, g.adminUserId, (q) => q(sql))).rejects.toMatchObject({ code: '42501' })
  })
})
