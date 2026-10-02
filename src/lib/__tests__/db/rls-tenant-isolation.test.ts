import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { adminClient, asAnon, asUser, createTenant, type Tenant } from './helpers'

/**
 * Tenant isolation, against real Postgres with the real policies.
 *
 * Two organizations, an admin in each. For the four tables that carry the
 * business (musicians, projects, contract_offers, payments) an admin must:
 *   - see their own org's rows,
 *   - see none of the other org's rows,
 *   - be unable to update, delete or insert into the other org's data.
 *
 * Postgres reports a blocked UPDATE/DELETE as "0 rows affected" (the policy
 * hides the row) and a blocked INSERT as a 42501 error, so both are asserted.
 *
 * The own-org reads matter as much as the cross-org ones: if the test role
 * lacked table privileges everything would be "blocked" and a cross-org
 * assertion alone would pass for the wrong reason.
 */
let db: Client
let a: Tenant
let b: Tenant

beforeAll(async () => {
  db = await adminClient()
  a = await createTenant(db, 'a')
  b = await createTenant(db, 'b')
})

afterAll(async () => {
  await db?.end()
})

const TABLES = [
  { table: 'musicians', own: (t: Tenant) => t.musicianId },
  { table: 'projects', own: (t: Tenant) => t.projectId },
  { table: 'contract_offers', own: (t: Tenant) => t.offerId },
  { table: 'payments', own: (t: Tenant) => t.paymentId },
]

describe.each(TABLES)('RLS on $table', ({ table, own }) => {
  it("lets an admin read their own organization's row", async () => {
    const res = await asUser(db, a.adminUserId, (q) => q(`select id from ${table} where id = $1`, [own(a)]))
    expect(res.rowCount).toBe(1)
  })

  it("hides the other organization's row", async () => {
    const res = await asUser(db, a.adminUserId, (q) => q(`select id from ${table} where id = $1`, [own(b)]))
    expect(res.rowCount).toBe(0)
  })

  it("lists only its own organization's rows", async () => {
    const res = await asUser(db, a.adminUserId, (q) => q(`select id from ${table}`))
    const ids = res.rows.map((r) => r.id)
    expect(ids).toContain(own(a))
    expect(ids).not.toContain(own(b))
  })

  it("cannot update the other organization's row", async () => {
    const res = await asUser(db, a.adminUserId, (q) =>
      q(`update ${table} set updated_at = now() where id = $1`, [own(b)])
    )
    expect(res.rowCount).toBe(0)
  })

  it("cannot delete the other organization's row", async () => {
    const res = await asUser(db, a.adminUserId, (q) => q(`delete from ${table} where id = $1`, [own(b)]))
    expect(res.rowCount).toBe(0)
  })

  it('shows nothing to a visitor who is not signed in', async () => {
    const res = await asAnon(db, (q) => q(`select id from ${table}`))
    expect(res.rowCount).toBe(0)
  })
})

describe('RLS inserts across organizations', () => {
  it('lets an admin add a musician to their own organization', async () => {
    const res = await asUser(db, a.adminUserId, (q) =>
      q('insert into musicians (organization_id, first_name, last_name) values ($1, $2, $3)', [
        a.orgId,
        'Own',
        'Insert',
      ])
    )
    expect(res.rowCount).toBe(1)
  })

  it('rejects adding a musician to another organization', async () => {
    await expect(
      asUser(db, a.adminUserId, (q) =>
        q('insert into musicians (organization_id, first_name, last_name) values ($1, $2, $3)', [
          b.orgId,
          'Cross',
          'Insert',
        ])
      )
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('rejects adding a project to another organization', async () => {
    await expect(
      asUser(db, a.adminUserId, (q) =>
        q('insert into projects (organization_id, name) values ($1, $2)', [b.orgId, 'Cross project'])
      )
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('rejects adding a payment to another organization', async () => {
    await expect(
      asUser(db, a.adminUserId, (q) =>
        q(
          'insert into payments (organization_id, service_id, musician_id, amount, payment_type) values ($1, $2, $3, 1, $4)',
          [b.orgId, b.serviceId, b.musicianId, 'bonus']
        )
      )
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('rejects joining another organization as a member', async () => {
    await expect(
      asUser(db, a.adminUserId, (q) =>
        q("insert into organization_members (organization_id, user_id, role) values ($1, $2, 'admin')", [
          b.orgId,
          a.adminUserId,
        ])
      )
    ).rejects.toThrow()
  })
})
