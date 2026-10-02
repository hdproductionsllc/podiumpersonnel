import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { adminClient, asUser, createTenant, type Tenant } from './helpers'

/**
 * Migration 093 (offer columns), against real Postgres.
 *
 *   - an offer inserted the way today's live code does it (none of the new
 *     columns named) still works and gets the defaults;
 *   - 'superseded' is a valid status; delivery_status takes only its four values;
 *   - an org admin's own session can write the new columns (createOffer inserts
 *     with the admin's client, under RLS);
 *   - the paste script backfills is_substitution from substitution_requests,
 *     is idempotent, and its RESULTS table is all PASS.
 */
let db: Client
let t: Tenant

beforeAll(async () => {
  db = await adminClient()
  t = await createTenant(db, 'oc')
})

afterAll(async () => {
  await db?.end()
})

async function newOffer(): Promise<string> {
  const id = randomUUID()
  // Exactly the columns the pre-093 browser insert named.
  await db.query(
    `insert into contract_offers (id, project_position_id, musician_id, status, sent_at, expires_at, custom_pay)
     values ($1, $2, $3, 'pending', now(), now() + interval '48 hours', 250)`,
    [id, t.positionId, t.musicianId]
  )
  return id
}

describe("today's inserts are unaffected", () => {
  it('an offer that names none of the new columns gets the defaults', async () => {
    const id = await newOffer()
    const { rows } = await db.query(
      'select created_by, terms_snapshot, delivery_status, is_substitution, custom_pay from contract_offers where id = $1',
      [id]
    )
    expect(rows[0]).toEqual({
      created_by: null,
      terms_snapshot: null,
      delivery_status: null,
      is_substitution: false,
      custom_pay: '250.00',
    })
  })
})

describe('status and delivery_status', () => {
  it("accepts 'superseded'", async () => {
    const id = await newOffer()
    const res = await db.query("update contract_offers set status = 'superseded' where id = $1", [id])
    expect(res.rowCount).toBe(1)
  })

  it.each(['queued', 'sent', 'failed', 'suppressed'])("accepts delivery_status '%s'", async (value) => {
    const id = await newOffer()
    const res = await db.query('update contract_offers set delivery_status = $2 where id = $1', [id, value])
    expect(res.rowCount).toBe(1)
  })

  it('rejects any other delivery_status', async () => {
    const id = await newOffer()
    await expect(
      db.query("update contract_offers set delivery_status = 'bounced' where id = $1", [id])
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('has no pay_basis column', async () => {
    const { rowCount } = await db.query(
      "select 1 from information_schema.columns where table_name = 'contract_offers' and column_name = 'pay_basis'"
    )
    expect(rowCount).toBe(0)
  })
})

describe('an org admin writing through their own session (RLS)', () => {
  it('can insert an offer with who sent it, what it offered and how the email went', async () => {
    const id = randomUUID()
    const snapshot = { pay: { custom_pay: 250 }, services: [{ id: t.serviceId }] }
    const res = await asUser(db, t.adminUserId, (q) =>
      q(
        `insert into contract_offers (id, project_position_id, musician_id, status, created_by, terms_snapshot, delivery_status)
         values ($1, $2, $3, 'pending', $4, $5, 'queued') returning terms_snapshot`,
        [id, t.positionId, t.musicianId, t.adminUserId, JSON.stringify(snapshot)]
      )
    )
    expect(res.rows[0].terms_snapshot).toEqual(snapshot)
  })
})

describe('the paste script (scripts/sql/093-offer-columns.paste.sql)', () => {
  const script = readFileSync(join(process.cwd(), 'scripts', 'sql', '093-offer-columns.paste.sql'), 'utf8')
  let subOffer: string
  let plainOffer: string

  beforeAll(async () => {
    // A substitute's offer from before 093: linked from a sub request, flag still false.
    subOffer = await newOffer()
    plainOffer = await newOffer()
    await db.query(
      `insert into substitution_requests (project_position_id, requesting_musician_id, status, offer_id)
       values ($1, $2, 'approved', $3)`,
      [t.positionId, t.musicianId, subOffer]
    )
  })

  it.each([1, 2])('run %i: every RESULTS row is PASS or INFO', async () => {
    const results = (await db.query(script)) as unknown as { rows: { check_name: string; result: string }[] }[]
    const table = results[results.length - 1].rows
    expect(table.length).toBeGreaterThan(5)
    for (const row of table) {
      expect(row.result, row.check_name).toMatch(/^(PASS|INFO)/)
    }
  })

  it("marks the substitute's offer, and only that one", async () => {
    const { rows } = await db.query('select id, is_substitution from contract_offers where id = any($1)', [[subOffer, plainOffer]])
    const flag = Object.fromEntries(rows.map((r) => [r.id, r.is_substitution]))
    expect(flag).toEqual({ [subOffer]: true, [plainOffer]: false })
  })
})
