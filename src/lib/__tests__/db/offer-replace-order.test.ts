import { randomUUID } from 'crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { adminClient, createTenant, type Tenant } from './helpers'

/**
 * Replacing a chair's offer under 095's index, in real Postgres.
 *
 * contract_offers_one_live_per_position (migration 095): at most one
 * pending/viewed non-substitute offer per chair. create_offer replaces a
 * chair's offer as: retire the open offers ('superseded'), then insert the new
 * one; createOffer (src/lib/staffing/offers.ts) undoes that after a failed
 * send by deleting the new offer and putting the retired ones back. These are
 * those statements, run against the real index. The old order (insert, then
 * retire) is shown failing, which is why it was changed.
 *
 * Each case runs in a transaction that is rolled back, so it never touches the
 * other tests' rows. (create_offer itself, under concurrency, is in
 * staffing-rpcs.test.ts.)
 */
let db: Client
let t: Tenant
let annaOfferId: string
let beaId: string

beforeAll(async () => {
  db = await adminClient()
  t = await createTenant(db, 'ro')
  annaOfferId = t.offerId // createTenant leaves one pending offer on the chair
  beaId = randomUUID()
  await db.query(
    'insert into musicians (id, organization_id, first_name, last_name, email) values ($1, $2, $3, $4, $5)',
    [beaId, t.orgId, 'Bea', 'Second', `bea-${beaId}@example.test`]
  )
})

afterAll(async () => {
  await db?.end()
})

/** Run `fn` in a transaction that is always rolled back. */
async function rolledBack(fn: () => Promise<void>) {
  await db.query('begin')
  try {
    await fn()
  } finally {
    await db.query('rollback')
  }
}

/** A statement expected to fail, without aborting the surrounding transaction. */
async function refused(sql: string, params: unknown[]) {
  await db.query('savepoint s')
  try {
    await db.query(sql, params)
  } catch (err) {
    await db.query('rollback to savepoint s')
    return err
  }
  await db.query('release savepoint s')
  return null
}

// The statements createOffer issues, as PostgREST would run them.
const retire = (positionId: string) =>
  db.query(
    `update contract_offers set status = 'superseded', responded_at = now()
     where project_position_id = $1 and status in ('pending', 'viewed') returning id`,
    [positionId]
  )
const insertSql = `insert into contract_offers (id, project_position_id, musician_id, status, sent_at, expires_at)
                   values ($1, $2, $3, 'pending', now(), now() + interval '48 hours')`
const restore = (ids: string[], status: string) =>
  db.query(
    `update contract_offers set status = $3, responded_at = null
     where project_position_id = $1 and id = any($2) and status = 'superseded' returning id`,
    [t.positionId, ids, status]
  )
const liveOnChair = async () =>
  (
    await db.query(
      "select id from contract_offers where project_position_id = $1 and status in ('pending', 'viewed') order by sent_at",
      [t.positionId]
    )
  ).rows.map((r) => r.id)

describe('replacing a chair offer under the one-live-offer index', () => {
  it('the old order (insert, then retire) is refused at the insert', async () => {
    await rolledBack(async () => {
      const err = await refused(insertSql, [randomUUID(), t.positionId, beaId])
      expect(err).toMatchObject({ code: '23505', constraint: 'contract_offers_one_live_per_position' })
    })
  })

  it("createOffer's order (retire, then insert) succeeds and leaves one live offer", async () => {
    await rolledBack(async () => {
      const retired = await retire(t.positionId)
      expect(retired.rows.map((r) => r.id)).toEqual([annaOfferId])
      const newId = randomUUID()
      await db.query(insertSql, [newId, t.positionId, beaId])
      expect(await liveOnChair()).toEqual([newId])
    })
  })

  it('the undo after a failed send (delete the new offer, put the old back) succeeds', async () => {
    await rolledBack(async () => {
      await db.query("update contract_offers set status = 'viewed' where id = $1", [annaOfferId])
      const retired = await retire(t.positionId)
      const newId = randomUUID()
      await db.query(insertSql, [newId, t.positionId, beaId])

      await db.query('delete from contract_offers where id = $1', [newId])
      const back = await restore(retired.rows.map((r) => r.id as string), 'viewed')

      expect(back.rowCount).toBe(1)
      expect(await liveOnChair()).toEqual([annaOfferId])
      const { rows } = await db.query('select status, responded_at from contract_offers where id = $1', [annaOfferId])
      expect(rows[0]).toEqual({ status: 'viewed', responded_at: null })
    })
  })

  it('a put-back that would make a second live offer is refused, so the newer offer stands', async () => {
    await rolledBack(async () => {
      const retired = await retire(t.positionId)
      const rivalId = randomUUID() // another admin's offer, landed in between
      await db.query(insertSql, [rivalId, t.positionId, beaId])

      const err = await refused(
        `update contract_offers set status = 'pending', responded_at = null
         where project_position_id = $1 and id = any($2) and status = 'superseded'`,
        [t.positionId, retired.rows.map((r) => r.id)]
      )

      expect(err).toMatchObject({ code: '23505' })
      expect(await liveOnChair()).toEqual([rivalId])
    })
  })
})
