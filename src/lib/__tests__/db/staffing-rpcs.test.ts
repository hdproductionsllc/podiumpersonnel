import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { adminClient, asAnon, asUser, createTenant, type Tenant } from './helpers'

/**
 * Migration 094 against real Postgres: the cascade constraints and the two
 * functions that decide who sits in a chair, claim_chair and create_offer.
 *
 *   - the indexes and the CHECK refuse the states they exist to prevent;
 *   - claim_chair: claims, refuses on a cancelled gig or an inactive musician,
 *     moves a chair from the original musician to a substitute releasing the
 *     original FIRST, retires the loser of a race instead of reopening it;
 *   - create_offer: checks in the server's order, retires then inserts, logs;
 *   - concurrency with two connections: two accepts on one chair, two
 *     create_offer calls for one chair or one musician; exactly one wins;
 *   - only the service role may call either function;
 *   - the repair script fixes bad rows and logs each fix, 094 refuses to run
 *     over bad rows, and both paste scripts report all PASS twice.
 *
 * Synthetic data only. Every case uses its own chairs, so cases do not see
 * each other's offers.
 */
let db: Client
let other: Client
let t: Tenant
let instrumentId: string

beforeAll(async () => {
  db = await adminClient()
  other = await adminClient()
  t = await createTenant(db, 'rpc')
  instrumentId = (await db.query('select instrument_id from project_positions where id = $1', [t.positionId])).rows[0]
    .instrument_id as string
})

afterAll(async () => {
  await other?.end()
  await db?.end()
})

// -- fixtures ---------------------------------------------------------------

let chairNo = 10

async function chair(projectId = t.projectId, holder: string | null = null): Promise<string> {
  const id = randomUUID()
  await db.query(
    'insert into project_positions (id, project_id, instrument_id, chair_number, musician_id, status) values ($1, $2, $3, $4, $5, $6)',
    [id, projectId, instrumentId, chairNo++, holder, holder ? 'confirmed' : 'vacant']
  )
  return id
}

async function musician(orgId = t.orgId, active = true): Promise<string> {
  const id = randomUUID()
  await db.query(
    'insert into musicians (id, organization_id, first_name, last_name, email, is_active) values ($1, $2, $3, $4, $5, $6)',
    [id, orgId, 'Test', `M ${id.slice(0, 8)}`, `m-${id}@example.test`, active]
  )
  return id
}

async function project(status = 'active'): Promise<string> {
  const id = randomUUID()
  await db.query('insert into projects (id, organization_id, name, status) values ($1, $2, $3, $4)', [
    id,
    t.orgId,
    `Gig ${id.slice(0, 8)}`,
    status,
  ])
  return id
}

async function offer(positionId: string, musicianId: string, status = 'pending', extra: { sub?: boolean; expires?: string } = {}) {
  const id = randomUUID()
  await db.query(
    `insert into contract_offers (id, project_position_id, musician_id, status, sent_at, expires_at, is_substitution)
     values ($1, $2, $3, $4, now(), coalesce($5::timestamptz, now() + interval '2 days'), $6)`,
    [id, positionId, musicianId, status, extra.expires ?? null, extra.sub ?? false]
  )
  return id
}

/** A seated musician (accepted offer, confirmed chair) and an approved sub request with its offer. */
async function seatedWithSub() {
  const original = await musician()
  const pos = await chair(t.projectId, original)
  const originalOffer = await offer(pos, original, 'accepted')
  const sub = await musician()
  const subOffer = await offer(pos, sub, 'pending', { sub: true })
  const requestId = randomUUID()
  await db.query(
    `insert into substitution_requests (id, project_position_id, requesting_musician_id, status, offer_id)
     values ($1, $2, $3, 'approved', $4)`,
    [requestId, pos, original, subOffer]
  )
  return { pos, original, originalOffer, sub, subOffer, requestId }
}

const claim = async (offerId: string, client: Client = db) =>
  (await client.query('select claim_chair($1) as r', [offerId])).rows[0].r as string

const createOffer = async (
  positionId: string,
  musicianId: string,
  opts: { by?: string; supersede?: boolean; client?: Client } = {}
) =>
  (
    await (opts.client ?? db).query(
      `select create_offer(p_position_id => $1, p_musician_id => $2, p_created_by => $3,
         p_expires_at => now() + interval '2 days', p_custom_pay => 300, p_personal_message => 'See you there',
         p_terms_snapshot => '{"pay":{"custom_pay":300}}'::jsonb, p_delivery_status => 'queued',
         p_supersede => $4) as r`,
      [positionId, musicianId, opts.by ?? t.adminUserId, opts.supersede ?? true]
    )
  ).rows[0].r as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const offerStatus = async (id: string) =>
  (await db.query('select status from contract_offers where id = $1', [id])).rows[0]?.status
const seat = async (id: string) =>
  (await db.query('select status, musician_id from project_positions where id = $1', [id])).rows[0]
const events = async (entityId: string) =>
  (await db.query('select action, actor_type, actor_id, after from staffing_events where entity_id = $1 order by created_at, action', [entityId])).rows

/** Resolve once `client`'s backend is waiting on a lock (so the race is real). */
async function waitingOnLock(client: Client) {
  const pid = (client as unknown as { processID: number }).processID
  for (let i = 0; i < 100; i++) {
    const { rows } = await db.query("select wait_event_type from pg_stat_activity where pid = $1", [pid])
    if (rows[0]?.wait_event_type === 'Lock') return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('the second connection never waited on a lock')
}

// ---------------------------------------------------------------------------

describe('the constraints', () => {
  it('a chair can hold one open offer: a second pending/viewed one is refused', async () => {
    const pos = await chair()
    await offer(pos, await musician())
    await expect(offer(pos, await musician(), 'viewed')).rejects.toMatchObject({
      code: '23505',
      constraint: 'contract_offers_one_live_per_position',
    })
  })

  it("a substitute's open offer on a held chair is not counted", async () => {
    const { pos } = await seatedWithSub() // already one open substitute's offer on the chair
    expect(await offer(pos, await musician(), 'pending', { sub: true })).toBeTruthy()
  })

  it('a chair can hold one accepted offer', async () => {
    const pos = await chair()
    await offer(pos, await musician(), 'accepted')
    await expect(offer(pos, await musician(), 'accepted')).rejects.toMatchObject({
      code: '23505',
      constraint: 'contract_offers_one_accepted_per_position',
    })
  })

  it('a confirmed chair must have a musician, and a seated musician must be confirmed', async () => {
    const pos = await chair()
    await expect(db.query("update project_positions set status = 'confirmed' where id = $1", [pos])).rejects.toMatchObject({
      code: '23514',
      constraint: 'project_positions_confirmed_has_musician',
    })
    await expect(
      db.query("update project_positions set musician_id = $2, status = 'offered' where id = $1", [pos, t.musicianId])
    ).rejects.toMatchObject({ code: '23514' })
  })

  it("a sub request saved without a status is 'pending_approval' (the old default was refused by its own CHECK)", async () => {
    const { rows } = await db.query(
      'insert into substitution_requests (project_position_id, requesting_musician_id) values ($1, $2) returning status',
      [await chair(), t.musicianId]
    )
    expect(rows[0].status).toBe('pending_approval')
  })
})

// ---------------------------------------------------------------------------

describe('claim_chair', () => {
  it('claims an empty chair: offer accepted, chair confirmed, history written', async () => {
    const pos = await chair()
    const m = await musician()
    const o = await offer(pos, m, 'viewed')

    expect(await claim(o)).toBe('claimed')

    expect(await offerStatus(o)).toBe('accepted')
    expect(await seat(pos)).toEqual({ status: 'confirmed', musician_id: m })
    expect(await events(o)).toEqual([
      expect.objectContaining({ action: 'offer.accepted', actor_type: 'musician', actor_id: m }),
    ])
  })

  it('a second accept of the same offer is already_responded', async () => {
    const o = await offer(await chair(), await musician())
    expect(await claim(o)).toBe('claimed')
    expect(await claim(o)).toBe('already_responded')
  })

  it('an offer past its deadline is not claimed', async () => {
    const pos = await chair()
    const o = await offer(pos, await musician(), 'pending', { expires: new Date(Date.now() - 3600_000).toISOString() })
    expect(await claim(o)).toBe('already_responded')
    expect(await seat(pos)).toEqual({ status: 'vacant', musician_id: null })
  })

  it('on a cancelled gig returns project_inactive and changes nothing', async () => {
    const gig = await project('cancelled')
    const pos = await chair(gig)
    const o = await offer(pos, await musician())

    expect(await claim(o)).toBe('project_inactive')
    expect(await offerStatus(o)).toBe('pending')
    expect(await seat(pos)).toEqual({ status: 'vacant', musician_id: null })
    expect(await events(o)).toEqual([])
  })

  it('for a deactivated musician returns musician_inactive and changes nothing', async () => {
    const pos = await chair()
    const o = await offer(pos, await musician(t.orgId, false))
    expect(await claim(o)).toBe('musician_inactive')
    expect(await offerStatus(o)).toBe('pending')
  })

  it('a chair someone else holds: position_filled, and the offer is retired, not reopened (R-11)', async () => {
    const holder = await musician()
    const pos = await chair(t.projectId, holder)
    const o = await offer(pos, await musician())

    expect(await claim(o)).toBe('position_filled')
    expect(await offerStatus(o)).toBe('superseded')
    expect(await seat(pos)).toEqual({ status: 'confirmed', musician_id: holder })
  })

  it('a substitute: the original is released FIRST, then the chair moves, and the request is filled', async () => {
    const s = await seatedWithSub()

    // With the one-accepted index live, accepting before releasing would fail.
    expect(await claim(s.subOffer)).toBe('claimed')

    expect(await offerStatus(s.originalOffer)).toBe('released')
    expect(await offerStatus(s.subOffer)).toBe('accepted')
    expect(await seat(s.pos)).toEqual({ status: 'confirmed', musician_id: s.sub })
    const request = (await db.query('select status from substitution_requests where id = $1', [s.requestId])).rows[0]
    expect(request.status).toBe('filled')
    expect((await events(s.originalOffer)).map((e) => e.action)).toEqual(['offer.released'])
    expect((await events(s.requestId)).map((e) => e.action)).toEqual(['substitution.filled'])
  })

  it('a substitute whose original no longer holds the chair: position_filled, offer and request closed (S11)', async () => {
    const s = await seatedWithSub()
    await db.query("update contract_offers set status = 'released' where id = $1", [s.originalOffer])
    const third = await musician()
    await db.query('update project_positions set musician_id = $2 where id = $1', [s.pos, third])

    expect(await claim(s.subOffer)).toBe('position_filled')

    expect(await offerStatus(s.subOffer)).toBe('superseded')
    expect(await seat(s.pos)).toEqual({ status: 'confirmed', musician_id: third })
    const request = (await db.query('select status from substitution_requests where id = $1', [s.requestId])).rows[0]
    expect(request.status).toBe('cancelled')
  })
})

// ---------------------------------------------------------------------------

describe('create_offer', () => {
  it('creates the offer, marks the chair offered, and records it', async () => {
    const pos = await chair()
    const m = await musician()

    const r = await createOffer(pos, m)

    expect(r).toMatchObject({ result: 'created', superseded: [] })
    const row = (await db.query('select * from contract_offers where id = $1', [r.offer.id])).rows[0]
    expect(row).toMatchObject({
      project_position_id: pos,
      musician_id: m,
      status: 'pending',
      custom_pay: '300.00',
      personal_message: 'See you there',
      created_by: t.adminUserId,
      delivery_status: 'queued',
      is_substitution: false,
    })
    expect(r.offer.token).toBe(row.token)
    expect((await seat(pos)).status).toBe('offered')
    expect((await events(r.offer.id)).map((e) => e.action)).toEqual(['offer.created'])
  })

  it('retires the open offer it replaces and returns it with its previous status', async () => {
    const pos = await chair()
    const first = await offer(pos, await musician(), 'viewed')

    const r = await createOffer(pos, await musician())

    expect(r.superseded).toEqual([expect.objectContaining({ id: first, previous_status: 'viewed' })])
    expect(await offerStatus(first)).toBe('superseded')
    expect(await events(first)).toEqual([
      expect.objectContaining({ action: 'offer.superseded', after: expect.objectContaining({ replaced_by: r.offer.id }) }),
    ])
  })

  it.each([
    ['forbidden', async () => ({ pos: await chair(), m: await musician(), by: randomUUID() })],
    ['chair_filled', async () => ({ pos: await chair(t.projectId, await musician()), m: await musician() })],
    ['gig_closed', async () => ({ pos: await chair(await project('completed')), m: await musician() })],
    ['musician_inactive', async () => ({ pos: await chair(), m: await musician(t.orgId, false) })],
  ])('refuses: %s, changing nothing', async (reason, build) => {
    const { pos, m, by } = (await build()) as { pos: string; m: string; by?: string }
    const r = await createOffer(pos, m, { by })
    expect(r).toEqual({ result: reason })
    expect((await db.query('select count(*)::int as n from contract_offers where project_position_id = $1', [pos])).rows[0].n).toBe(0)
  })

  it('refuses a musician from another organization', async () => {
    const elsewhere = await createTenant(db, 'rpc-other')
    expect(await createOffer(await chair(), elsewhere.musicianId)).toEqual({ result: 'wrong_organization' })
  })

  it('refuses a musician who already has an open or accepted offer on the gig', async () => {
    const m = await musician()
    await offer(await chair(), m)
    expect(await createOffer(await chair(), m)).toEqual({ result: 'musician_has_active_offer' })
  })
})

// ---------------------------------------------------------------------------

describe('concurrency, two connections', () => {
  it('two accepts of one offer: exactly one claims', async () => {
    const pos = await chair()
    const o = await offer(pos, await musician())

    await db.query('begin')
    expect(await claim(o, db)).toBe('claimed')
    const second = claim(o, other)
    await waitingOnLock(other)
    await db.query('commit')

    expect(await second).toBe('already_responded')
    expect((await db.query("select count(*)::int as n from contract_offers where project_position_id = $1 and status = 'accepted'", [pos])).rows[0].n).toBe(1)
  })

  it('two substitutes accepting one chair at once: one wins, the other is retired (S11, R-11)', async () => {
    const s = await seatedWithSub()
    const sub2 = await musician()
    const sub2Offer = await offer(s.pos, sub2, 'pending', { sub: true })
    const request2 = randomUUID()
    await db.query(
      `insert into substitution_requests (id, project_position_id, requesting_musician_id, status, offer_id)
       values ($1, $2, $3, 'approved', $4)`,
      [request2, s.pos, s.original, sub2Offer]
    )

    await db.query('begin')
    expect(await claim(s.subOffer, db)).toBe('claimed')
    const second = claim(sub2Offer, other)
    await waitingOnLock(other)
    await db.query('commit')

    // The winner's claim already retired the other substitute's offer.
    expect(await second).toBe('already_responded')
    expect(await seat(s.pos)).toEqual({ status: 'confirmed', musician_id: s.sub })
    expect(await offerStatus(sub2Offer)).toBe('superseded')
    const r2 = (await db.query('select status from substitution_requests where id = $1', [request2])).rows[0]
    expect(r2.status).toBe('cancelled')
    expect((await db.query("select count(*)::int as n from contract_offers where project_position_id = $1 and status = 'accepted'", [s.pos])).rows[0].n).toBe(1)
  })

  it('two create_offer for one chair without superseding: one is created, the other refused', async () => {
    const pos = await chair()
    const [m1, m2] = [await musician(), await musician()]

    await db.query('begin')
    const first = await createOffer(pos, m1, { supersede: false, client: db })
    const second = createOffer(pos, m2, { supersede: false, client: other })
    await waitingOnLock(other)
    await db.query('commit')

    expect(first.result).toBe('created')
    expect(await second).toEqual({ result: 'chair_has_live_offer' })
  })

  it('two create_offer for one chair (replacing): they queue, and the chair ends with exactly one live offer', async () => {
    const pos = await chair()
    const [m1, m2] = [await musician(), await musician()]

    await db.query('begin')
    const first = await createOffer(pos, m1, { client: db })
    const second = createOffer(pos, m2, { client: other })
    await waitingOnLock(other)
    await db.query('commit')

    const r2 = await second
    expect(r2.superseded).toEqual([expect.objectContaining({ id: first.offer.id })])
    const live = await db.query(
      "select id from contract_offers where project_position_id = $1 and status in ('pending', 'viewed')",
      [pos]
    )
    expect(live.rows.map((r) => r.id)).toEqual([r2.offer.id])
  })

  it('two create_offer for one musician on two chairs of one gig: one is created, the other refused', async () => {
    const m = await musician()
    const [a, b] = [await chair(), await chair()]

    await db.query('begin')
    const first = await createOffer(a, m, { client: db })
    const second = createOffer(b, m, { client: other })
    await waitingOnLock(other)
    await db.query('commit')

    expect(first.result).toBe('created')
    expect(await second).toEqual({ result: 'musician_has_active_offer' })
  })
})

// ---------------------------------------------------------------------------

describe('who may call the functions', () => {
  it.each(['claim_chair($1)', 'create_offer($1, $1, $1)'])('%s: no signed-in user and no visitor', async (call) => {
    const arg = randomUUID()
    await expect(asUser(db, t.adminUserId, (q) => q(`select ${call}`, [arg]))).rejects.toMatchObject({ code: '42501' })
    await expect(asAnon(db, (q) => q(`select ${call}`, [arg]))).rejects.toMatchObject({ code: '42501' })
  })

  it('the service role (the server) can', async () => {
    const o = await offer(await chair(), await musician())
    await db.query('begin')
    try {
      await db.query('set local role service_role')
      expect((await db.query('select claim_chair($1) as r', [o])).rows[0].r).toBe('claimed')
    } finally {
      await db.query('rollback')
    }
  })
})

// ---------------------------------------------------------------------------
// Last: drops and re-creates 094's rules around bad rows, then leaves the
// database exactly as the migrations left it.

describe('the repair script and the 094 paste script', () => {
  const repair = readFileSync(join(process.cwd(), 'scripts', 'sql', '094-repair-before-constraints.paste.sql'), 'utf8')
  const paste = readFileSync(join(process.cwd(), 'scripts', 'sql', '094-cascade-constraints.paste.sql'), 'utf8')
  const results = async (script: string) => {
    const out = (await db.query(script)) as unknown as { rows: { check_name: string; result: string }[] }[]
    return out[out.length - 1].rows
  }

  let twoLive: { pos: string; older: string; newer: string }
  let emptyConfirmed: string
  let seatedOffered: { pos: string; m: string }

  beforeAll(async () => {
    await db.query(`
      drop index contract_offers_one_live_per_position;
      drop index contract_offers_one_accepted_per_position;
      alter table project_positions drop constraint project_positions_confirmed_has_musician;
    `)
    const pos = await chair()
    const older = await offer(pos, await musician())
    await db.query("update contract_offers set sent_at = now() - interval '1 day' where id = $1", [older])
    const newer = await offer(pos, await musician())
    twoLive = { pos, older, newer }

    emptyConfirmed = await chair()
    await db.query("update project_positions set status = 'confirmed' where id = $1", [emptyConfirmed])

    const m = await musician()
    const p2 = await chair()
    await db.query("update project_positions set musician_id = $2, status = 'offered' where id = $1", [p2, m])
    seatedOffered = { pos: p2, m }
  })

  it('094 refuses to run over bad rows, and changes nothing', async () => {
    await expect(db.query(paste)).rejects.toThrow(/Migration 094 stopped, nothing was changed/)
    await db.query('rollback')
    const idx = await db.query("select 1 from pg_indexes where indexname = 'contract_offers_one_live_per_position'")
    expect(idx.rowCount).toBe(0)
  })

  it('the repair fixes every bad row, logs each fix, and reports all PASS', async () => {
    for (const row of await results(repair)) expect(row.result, row.check_name).toMatch(/^(PASS|INFO)/)

    expect(await offerStatus(twoLive.older)).toBe('superseded')
    expect(await offerStatus(twoLive.newer)).toBe('pending')
    expect(await seat(emptyConfirmed)).toEqual({ status: 'vacant', musician_id: null })
    expect(await seat(seatedOffered.pos)).toEqual({ status: 'confirmed', musician_id: seatedOffered.m })
    expect(await events(twoLive.older)).toEqual([
      expect.objectContaining({ action: 'offer.superseded', actor_type: 'system', after: expect.objectContaining({ reason: 'repair_094', replaced_by: twoLive.newer }) }),
    ])
    expect((await events(emptyConfirmed)).map((e) => e.after.reason)).toEqual(['repair_094'])
  })

  it.each([1, 2])('repair run again (%i) changes nothing', async () => {
    const before = (await db.query("select count(*)::int as n from staffing_events where after->>'reason' = 'repair_094'")).rows[0].n
    for (const row of await results(repair)) expect(row.result, row.check_name).toMatch(/^(PASS|INFO)/)
    const after = (await db.query("select count(*)::int as n from staffing_events where after->>'reason' = 'repair_094'")).rows[0].n
    expect(after).toBe(before)
  })

  it.each([1, 2])('094 paste run %i: every RESULTS row is PASS', async () => {
    const table = await results(paste)
    expect(table.length).toBeGreaterThan(6)
    for (const row of table) expect(row.result, row.check_name).toBe('PASS')
  })
})
