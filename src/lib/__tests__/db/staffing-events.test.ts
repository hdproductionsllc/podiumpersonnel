import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { adminClient, asAnon, asUser, createTenant, type Tenant } from './helpers'

/**
 * staffing_events (migration 092), against real Postgres with the real policies.
 *
 *   - an org admin reads their own organization's history and nobody else's;
 *   - a plain member and an anonymous visitor read nothing;
 *   - no client role can add, change or delete a history row, directly or
 *     through log_staffing_event();
 *   - the service role (the Podium server) can write it both ways;
 *   - the paste script is idempotent and its RESULTS table is all PASS.
 *
 * Writes that should be refused are asserted as errors with their Postgres
 * code: the client roles have no write privilege at all (42501), which is a
 * stronger refusal than a policy hiding the row.
 */
let db: Client
let a: Tenant
let b: Tenant
let memberUserId: string
let eventA: string
let eventB: string

const LOG_FN = 'log_staffing_event($1, $2, $3, $4, $5, $6, $7, $8)'

/** Run `fn` as a Postgres role with no JWT (service_role is how the server connects). */
async function asRole<T>(client: Client, role: string, fn: () => Promise<T>): Promise<T> {
  await client.query('begin')
  try {
    await client.query(`set local role ${role}`)
    return await fn()
  } finally {
    await client.query('rollback')
  }
}

async function insertEvent(t: Tenant, action: string): Promise<string> {
  const id = randomUUID()
  await db.query(
    `insert into staffing_events (id, organization_id, actor_type, actor_id, entity_type, entity_id, action, before, after)
     values ($1, $2, 'admin', $3, 'offer', $4, $5, '{"status":"pending"}', '{"status":"rescinded"}')`,
    [id, t.orgId, t.adminUserId, t.offerId, action]
  )
  return id
}

beforeAll(async () => {
  db = await adminClient()
  a = await createTenant(db, 'ev-a')
  b = await createTenant(db, 'ev-b')

  memberUserId = randomUUID()
  await db.query('insert into auth.users (id, email) values ($1, $2)', [
    memberUserId,
    `member-${memberUserId}@example.test`,
  ])
  await db.query(
    "insert into organization_members (organization_id, user_id, role) values ($1, $2, 'member')",
    [a.orgId, memberUserId]
  )

  eventA = await insertEvent(a, 'offer.rescinded')
  eventB = await insertEvent(b, 'offer.rescinded')
})

afterAll(async () => {
  await db?.end()
})

describe('reading the history', () => {
  it("lets an admin read their own organization's events", async () => {
    const res = await asUser(db, a.adminUserId, (q) => q('select id from staffing_events where id = $1', [eventA]))
    expect(res.rowCount).toBe(1)
  })

  it("hides the other organization's events", async () => {
    const res = await asUser(db, a.adminUserId, (q) => q('select id from staffing_events'))
    const ids = res.rows.map((r) => r.id)
    expect(ids).toContain(eventA)
    expect(ids).not.toContain(eventB)
  })

  it('shows nothing to a member who is not an admin', async () => {
    const res = await asUser(db, memberUserId, (q) => q('select id from staffing_events'))
    expect(res.rowCount).toBe(0)
  })

  it('refuses a visitor who is not signed in', async () => {
    await expect(asAnon(db, (q) => q('select id from staffing_events'))).rejects.toMatchObject({ code: '42501' })
  })
})

describe('nobody edits the history from a session', () => {
  it('refuses an insert, even into the admin\'s own organization', async () => {
    await expect(
      asUser(db, a.adminUserId, (q) =>
        q(
          "insert into staffing_events (organization_id, actor_type, entity_type, entity_id, action) values ($1, 'admin', 'offer', $2, 'offer.sent')",
          [a.orgId, a.offerId]
        )
      )
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('refuses an update', async () => {
    await expect(
      asUser(db, a.adminUserId, (q) => q("update staffing_events set action = 'offer.accepted' where id = $1", [eventA]))
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('refuses a delete', async () => {
    await expect(
      asUser(db, a.adminUserId, (q) => q('delete from staffing_events where id = $1', [eventA]))
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('refuses log_staffing_event() to a signed-in user', async () => {
    await expect(
      asUser(db, a.adminUserId, (q) =>
        q(`select ${LOG_FN}`, [b.orgId, 'admin', a.adminUserId, 'offer', b.offerId, 'offer.sent', null, null])
      )
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('refuses log_staffing_event() to an anonymous visitor', async () => {
    await expect(
      asAnon(db, (q) => q(`select ${LOG_FN}`, [a.orgId, 'system', null, 'offer', a.offerId, 'offer.expired', null, null]))
    ).rejects.toMatchObject({ code: '42501' })
  })
})

describe('the server writes the history', () => {
  it('can insert as the service role', async () => {
    const res = await asRole(db, 'service_role', () =>
      db.query(
        "insert into staffing_events (organization_id, actor_type, entity_type, entity_id, action, after) values ($1, 'system', 'offer', $2, 'offer.expired', '{\"status\":\"expired\"}') returning id",
        [a.orgId, a.offerId]
      )
    )
    expect(res.rowCount).toBe(1)
  })

  it('can call log_staffing_event() as the service role, and the row lands', async () => {
    const id = await asRole(db, 'service_role', async () => {
      const res = await db.query(`select ${LOG_FN} as id`, [
        a.orgId,
        'musician',
        a.musicianId,
        'offer',
        a.offerId,
        'offer.accepted',
        JSON.stringify({ status: 'pending' }),
        JSON.stringify({ status: 'accepted' }),
      ])
      const row = await db.query('select action, actor_type, after from staffing_events where id = $1', [res.rows[0].id])
      return row.rows[0]
    })
    expect(id).toMatchObject({ action: 'offer.accepted', actor_type: 'musician', after: { status: 'accepted' } })
  })

  it('rejects an unknown actor type', async () => {
    await expect(
      db.query(
        "insert into staffing_events (organization_id, actor_type, entity_type, entity_id, action) values ($1, 'robot', 'offer', $2, 'offer.sent')",
        [a.orgId, a.offerId]
      )
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('keeps history when the offer it describes is deleted', async () => {
    const t = await createTenant(db, 'ev-del')
    const id = await insertEvent(t, 'offer.declined')
    await db.query('delete from contract_offers where id = $1', [t.offerId])
    const res = await db.query('select id from staffing_events where id = $1', [id])
    expect(res.rowCount).toBe(1)
  })
})

describe('the paste script (scripts/sql/092-staffing-events.paste.sql)', () => {
  const script = readFileSync(join(process.cwd(), 'scripts', 'sql', '092-staffing-events.paste.sql'), 'utf8')

  it.each([1, 2])('run %i: every RESULTS row is PASS or INFO', async () => {
    const results = (await db.query(script)) as unknown as { rows: { check_name: string; result: string }[] }[]
    const table = results[results.length - 1].rows
    expect(table.length).toBeGreaterThan(5)
    for (const row of table) {
      expect(row.result, row.check_name).toMatch(/^(PASS|INFO)/)
    }
  })
})
