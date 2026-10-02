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
 *   worker_drop             an accepted worker gives the gig back ("I can't make it")
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
  instrumentId: string
  /** The first service's start. */
  startsAt: string
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
    instrumentId: randomUUID(),
    startsAt: FUTURE(),
    musicians: [randomUUID(), randomUUID(), randomUUID()],
  }
  const instrumentId = g.instrumentId
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
    g.startsAt,
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

/** Another active gig in the same organization, one chair, its one service starting at `startsAt`. */
async function sameOrgGig(g: Gig, startsAt: string, endsAt: string | null = null): Promise<{ projectId: string; chairId: string }> {
  const projectId = randomUUID()
  const chairId = randomUUID()
  await db.query("insert into projects (id, organization_id, name, status) values ($1, $2, 'Other gig', 'active')", [projectId, g.orgId])
  await db.query(
    "insert into services (project_id, name, service_type, start_time, end_time) values ($1, 'Show', 'performance', $2, $3)",
    [projectId, startsAt, endsAt]
  )
  await db.query('insert into project_positions (id, project_id, instrument_id, chair_number) values ($1, $2, $3, 1)', [
    chairId,
    projectId,
    g.instrumentId,
  ])
  return { projectId, chairId }
}

const HOURS = (iso: string, h: number) => new Date(new Date(iso).getTime() + h * 60 * 60 * 1000).toISOString()

type CascadeResult = { result: string; offer?: { id: string; expires_at: string } }

async function cascade(client: Client, trigger: string, musician: string, expiresAt: string | null = SOON()): Promise<CascadeResult> {
  const { rows } = await client.query(
    'select cascade_offer($1, $2, $3, $4, $5, $6) as r',
    [trigger, musician, expiresAt, 300, JSON.stringify({ pay: { custom_pay: 300 } }), 'queued']
  )
  return rows[0].r
}

async function markExhausted(client: Client, trigger: string, details?: Record<string, unknown>): Promise<string> {
  const { rows } = details
    ? await client.query('select mark_cascade_exhausted($1, $2) as r', [trigger, JSON.stringify(details)])
    : await client.query('select mark_cascade_exhausted($1) as r', [trigger])
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

    it('the musician already had their turn at this chair', async () => {
      const g = await gig()
      const trigger = await endedOffer(g, 'declined', g.musicians[0])
      // Whoever just declined, and anyone who earlier let it lapse, had it withdrawn or dropped it.
      expect((await cascade(db, trigger, g.musicians[0])).result).toBe('musician_had_turn')
      for (const status of ['expired', 'superseded', 'rescinded', 'released']) {
        const m = randomUUID()
        await db.query('insert into musicians (id, organization_id, first_name, last_name, email) values ($1, $2, $3, $4, $5)', [
          m,
          g.orgId,
          status,
          'Player',
          `${status}-${m}@example.test`,
        ])
        await endedOffer(g, status, m)
        expect((await cascade(db, trigger, m)).result).toBe('musician_had_turn')
      }
      // A turn at the OTHER chair does not count here.
      await endedOffer(g, 'declined', g.musicians[1], g.otherChairId)
      expect((await cascade(db, trigger, g.musicians[1])).result).toBe('created')
    })
  })

  describe('booked on another gig at the same time', () => {
    it('an accepted or still-open offer elsewhere that overlaps is refused; one that does not overlap, or has lapsed, is not', async () => {
      const g = await gig()
      const trigger = await endedOffer(g)
      const m = g.musicians[1]

      // Same evening, an hour after our service starts (ours has no end time: 3 hours assumed).
      const clash = await sameOrgGig(g, HOURS(g.startsAt, 1))
      const accepted = await endedOffer(g, 'accepted', m, clash.chairId)
      expect((await cascade(db, trigger, m)).result).toBe('musician_has_conflict')

      // Still waiting on an answer, inside its deadline: holds them too.
      await db.query("update contract_offers set status = 'pending', expires_at = $2 where id = $1", [accepted, SOON()])
      expect((await cascade(db, trigger, m)).result).toBe('musician_has_conflict')

      // Lapsed but not yet collected by the expire cron: holds nobody.
      await db.query('update contract_offers set expires_at = $2 where id = $1', [accepted, new Date(Date.now() - 60_000).toISOString()])
      expect((await cascade(db, trigger, m)).result).toBe('created')
    })

    it('touching end to start, or on another day, is not a conflict', async () => {
      const g = await gig()
      const trigger = await endedOffer(g)
      const m = g.musicians[1]
      const after = await sameOrgGig(g, HOURS(g.startsAt, 3)) // starts exactly when ours (3 hours assumed) ends
      await endedOffer(g, 'accepted', m, after.chairId)
      const nextDay = await sameOrgGig(g, HOURS(g.startsAt, 24), HOURS(g.startsAt, 26))
      await endedOffer(g, 'accepted', m, nextDay.chairId)
      expect((await cascade(db, trigger, m)).result).toBe('created')
    })

    it('two automatic offers on two gigs that night, racing for the same musician: one gets them', async () => {
      const g = await gig()
      const m = g.musicians[1]
      const tonight = await sameOrgGig(g, HOURS(g.startsAt, 1))
      const here = await endedOffer(g, 'declined', g.musicians[0])
      const there = await endedOffer(g, 'declined', g.musicians[2], tonight.chairId)

      const results = await Promise.all([cascade(db, here, m), cascade(other, there, m)])
      expect(results.map((r) => r.result).sort()).toEqual(['created', 'musician_has_conflict'])
      const live = await db.query("select id from contract_offers where musician_id = $1 and status = 'pending'", [m])
      expect(live.rowCount).toBe(1)
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

  it('records what the caller saw (who was passed over) on the cascade.exhausted event', async () => {
    const g = await gig()
    const trigger = await endedOffer(g, 'declined')
    const details = { trigger: 'declined', skipped_conflicts: 2, skipped_no_email: [g.musicians[2]] }
    expect(await markExhausted(db, trigger, details)).toBe('marked')
    const history = await db.query("select after from staffing_events where entity_id = $1 and action = 'cascade.exhausted'", [trigger])
    expect(history.rows).toEqual([{ after: { ...details, position_id: g.chairId } }])
  })

  it('exists once (the earlier one-argument draft is gone)', async () => {
    const { rows } = await db.query("select count(*)::int as n from pg_proc where proname = 'mark_cascade_exhausted'")
    expect(rows[0].n).toBe(1)
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

// ---------------------------------------------------------------------------

/** An accepted offer on the gig's chair, with the musician seated, as claim_chair leaves it. */
async function acceptedOffer(g: Gig, musician = g.musicians[0], chair = g.chairId): Promise<string> {
  const id = randomUUID()
  await db.query("insert into contract_offers (id, project_position_id, musician_id, status) values ($1, $2, $3, 'accepted')", [
    id,
    chair,
    musician,
  ])
  await db.query("update project_positions set musician_id = $1, status = 'confirmed' where id = $2", [musician, chair])
  return id
}

async function allowDrop(g: Gig, allow = true) {
  await db.query('update organizations set allow_worker_drop = $1 where id = $2', [allow, g.orgId])
}

async function workerDrop(client: Client, offerId: string, reason: string | null = null): Promise<string> {
  const { rows } = await client.query('select worker_drop($1, $2) as r', [offerId, reason])
  return rows[0].r
}

const offerStatus = async (offerId: string) =>
  (await db.query('select status from contract_offers where id = $1', [offerId])).rows[0].status

describe('worker_drop', () => {
  it('releases the offer and empties the chair in one go, recorded with the worker as the actor', async () => {
    const g = await gig()
    await allowDrop(g)
    const offer = await acceptedOffer(g)
    expect(await workerDrop(db, offer, '  Sick, sorry  ')).toBe('released')

    expect(await offerStatus(offer)).toBe('released')
    const chair = await db.query('select musician_id, status from project_positions where id = $1', [g.chairId])
    expect(chair.rows[0]).toEqual({ musician_id: null, status: 'vacant' })

    const history = await db.query(
      "select actor_type, actor_id, before, after from staffing_events where entity_id = $1 and action = 'offer.released'",
      [offer]
    )
    expect(history.rows).toEqual([
      {
        actor_type: 'musician',
        actor_id: g.musicians[0],
        before: { status: 'accepted' },
        after: {
          status: 'released',
          reason: 'dropped',
          position_id: g.chairId,
          musician_id: g.musicians[0],
          seat_released: true,
          note: 'Sick, sorry',
        },
      },
    ])
  })

  it('the dropped offer can start the auto-offer, and its worker is not asked again', async () => {
    const g = await gig()
    await allowDrop(g)
    const offer = await acceptedOffer(g)
    await workerDrop(db, offer)
    expect((await cascade(db, offer, g.musicians[0])).result).toBe('musician_had_turn')
    expect((await cascade(db, offer, g.musicians[1])).result).toBe('created')
  })

  it('a second call changes nothing', async () => {
    const g = await gig()
    await allowDrop(g)
    const offer = await acceptedOffer(g)
    expect(await workerDrop(db, offer)).toBe('released')
    expect(await workerDrop(db, offer)).toBe('already_released')
    const events = await db.query(
      "select count(*)::int as n from staffing_events where entity_id = $1 and action = 'offer.released'",
      [offer]
    )
    expect(events.rows[0].n).toBe(1)
  })

  it('two connections at once: one drop', async () => {
    const g = await gig()
    await allowDrop(g)
    const offer = await acceptedOffer(g)
    const results = await Promise.all([workerDrop(db, offer), workerDrop(other, offer)])
    expect(results.sort()).toEqual(['already_released', 'released'])
  })

  describe('does nothing when', () => {
    const unchanged = async (g: Gig, offer: string) => {
      expect(await offerStatus(offer)).toBe('accepted')
      const chair = await db.query('select musician_id, status from project_positions where id = $1', [g.chairId])
      expect(chair.rows[0]).toEqual({ musician_id: g.musicians[0], status: 'confirmed' })
    }

    it('the organization does not allow it (the music default)', async () => {
      const g = await gig()
      await allowDrop(g, false)
      const offer = await acceptedOffer(g)
      expect(await workerDrop(db, offer)).toBe('not_allowed')
      await unchanged(g, offer)
    })

    it('the gig has started', async () => {
      const g = await gig()
      await allowDrop(g)
      await db.query("update services set start_time = now() - interval '1 minute' where project_id = $1", [g.projectId])
      const offer = await acceptedOffer(g)
      expect(await workerDrop(db, offer)).toBe('gig_started')
      await unchanged(g, offer)
    })

    it('the gig is cancelled', async () => {
      const g = await gig()
      await allowDrop(g)
      const offer = await acceptedOffer(g)
      await db.query("update projects set status = 'cancelled' where id = $1", [g.projectId])
      expect(await workerDrop(db, offer)).toBe('project_inactive')
      await unchanged(g, offer)
    })

    it('a substitute is being arranged', async () => {
      const g = await gig()
      await allowDrop(g)
      const offer = await acceptedOffer(g)
      await db.query(
        "insert into substitution_requests (project_position_id, requesting_musician_id, status) values ($1, $2, 'pending_approval')",
        [g.chairId, g.musicians[0]]
      )
      expect(await workerDrop(db, offer)).toBe('substitution_in_progress')
      await unchanged(g, offer)
    })

    it('the offer was never accepted, or does not exist', async () => {
      const g = await gig()
      await allowDrop(g)
      expect(await workerDrop(db, await endedOffer(g, 'pending'))).toBe('not_accepted')
      expect(await workerDrop(db, randomUUID())).toBe('not_found')
    })

    it('someone else holds the chair', async () => {
      const g = await gig()
      await allowDrop(g)
      const offer = await acceptedOffer(g)
      await db.query('update project_positions set musician_id = $1 where id = $2', [g.musicians[1], g.chairId])
      expect(await workerDrop(db, offer)).toBe('not_seated')
      expect(await offerStatus(offer)).toBe('accepted')
    })
  })
})

const requestSub = (client: Client, g: Gig, musician = g.musicians[0]) =>
  client.query(
    "insert into substitution_requests (project_position_id, requesting_musician_id, status) values ($1, $2, 'pending_approval') returning id",
    [g.chairId, musician]
  )

describe('a substitute request and a drop on the same chair (trg_guard_substitution_request_chair)', () => {
  it('a request from someone still booked goes through', async () => {
    const g = await gig()
    await allowDrop(g)
    await acceptedOffer(g)
    expect((await requestSub(db, g)).rows).toHaveLength(1)
  })

  it('a request after the drop is refused', async () => {
    const g = await gig()
    await allowDrop(g)
    const offer = await acceptedOffer(g)
    expect(await workerDrop(db, offer)).toBe('released')
    await expect(requestSub(db, g)).rejects.toThrow(/substitution_request_offer_not_accepted/)
  })

  it('a request racing a drop in flight waits for it, then is refused', async () => {
    const g = await gig()
    await allowDrop(g)
    const offer = await acceptedOffer(g)
    await other.query('begin')
    try {
      expect(await workerDrop(other, offer)).toBe('released')
      // Blocks on the chair's lock until the drop commits.
      const pending = requestSub(db, g).then(
        () => 'inserted',
        (err: Error) => err.message
      )
      await new Promise((r) => setTimeout(r, 200))
      await other.query('commit')
      expect(await pending).toMatch(/substitution_request_offer_not_accepted/)
    } finally {
      await other.query('rollback').catch(() => {})
    }
    const n = await db.query('select count(*)::int as n from substitution_requests where project_position_id = $1', [g.chairId])
    expect(n.rows[0].n).toBe(0)
  })

  it('a drop racing a request in flight waits for it, then is refused', async () => {
    const g = await gig()
    await allowDrop(g)
    const offer = await acceptedOffer(g)
    await other.query('begin')
    try {
      await requestSub(other, g)
      const pending = workerDrop(db, offer)
      await new Promise((r) => setTimeout(r, 200))
      await other.query('commit')
      expect(await pending).toBe('substitution_in_progress')
    } finally {
      await other.query('rollback').catch(() => {})
    }
    expect(await offerStatus(offer)).toBe('accepted')
  })

  it('organizations without drop-out (the music default) are not checked, as today', async () => {
    const g = await gig()
    await allowDrop(g, false)
    // No accepted offer at all: today's database accepts it, and still does.
    expect((await requestSub(db, g)).rows).toHaveLength(1)
  })
})

describe('only the server can call them', () => {
  it.each([
    ['worker_drop', `select worker_drop('${randomUUID()}')`],
    ['cascade_offer', `select cascade_offer('${randomUUID()}', '${randomUUID()}', now() + interval '1 day')`],
    ['mark_cascade_exhausted', `select mark_cascade_exhausted('${randomUUID()}')`],
    ['cascade_refusal', `select cascade_refusal('${randomUUID()}')`],
  ])('%s is refused to a signed-in user', async (_fn, sql) => {
    const g = await gig()
    await expect(asUser(db, g.adminUserId, (q) => q(sql))).rejects.toMatchObject({ code: '42501' })
  })
})
