import { randomUUID } from 'crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { adminClient, createTenant, type Tenant } from './helpers'

/**
 * Constraints the application relies on, checked where they live: in Postgres.
 * The admin connection bypasses RLS, so only the constraint under test can
 * reject the write. Each failing statement is a single statement outside a
 * transaction block, so it leaves nothing behind and the next test runs clean.
 */
let db: Client
let t: Tenant

beforeAll(async () => {
  db = await adminClient()
  t = await createTenant(db, 'c')
})

afterAll(async () => {
  await db?.end()
})

describe('payments', () => {
  it('allows only one standard payment per musician, service and fee type', async () => {
    await expect(
      db.query('insert into payments (organization_id, service_id, musician_id, amount) values ($1, $2, $3, 50)', [
        t.orgId,
        t.serviceId,
        t.musicianId,
      ])
    ).rejects.toMatchObject({ code: '23505', constraint: 'payments_standard_unique' })
  })

  it('still allows an adjustment alongside the standard payment', async () => {
    const res = await db.query(
      "insert into payments (organization_id, service_id, musician_id, amount, payment_type) values ($1, $2, $3, 25, 'adjustment')",
      [t.orgId, t.serviceId, t.musicianId]
    )
    expect(res.rowCount).toBe(1)
  })

  it('refuses to delete a service that has payments against it', async () => {
    await expect(db.query('delete from services where id = $1', [t.serviceId])).rejects.toMatchObject({
      code: '23503',
    })
  })
})

describe('organization_members', () => {
  it('holds an account to one organization', async () => {
    const other = randomUUID()
    await db.query('insert into organizations (id, name, slug) values ($1, $2, $3)', [
      other,
      'Org other',
      `org-other-${other}`,
    ])
    await expect(
      db.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, 'member')", [
        other,
        t.adminUserId,
      ])
    ).rejects.toMatchObject({ code: '23505' })
  })
})

describe('contract_offers', () => {
  it('accepts the rescinded and released statuses added after 001', async () => {
    for (const status of ['rescinded', 'released']) {
      const res = await db.query('update contract_offers set status = $2 where id = $1', [t.offerId, status])
      expect(res.rowCount).toBe(1)
    }
  })

  it('rejects a status that is not in the list', async () => {
    await expect(
      db.query("update contract_offers set status = 'maybe' where id = $1", [t.offerId])
    ).rejects.toMatchObject({ code: '23514' })
  })
})

describe('projects', () => {
  it('rejects a status that is not in the list', async () => {
    await expect(db.query("update projects set status = 'archived' where id = $1", [t.projectId])).rejects.toMatchObject({
      code: '23514',
    })
  })
})
