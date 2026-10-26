import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Client } from 'pg'
import { adminClient, createTenant, type Tenant } from './helpers'
let db: Client
let tenant: Tenant
beforeAll(async () => { db = await adminClient(); tenant = await createTenant(db, 'played') })
afterAll(async () => { await db?.end() })
it('does not infer attendance for existing projects and stores explicit empty/reviewed rosters', async () => {
  expect((await db.query('select gig_report_musician_ids from projects where id=$1', [tenant.projectId])).rows[0].gig_report_musician_ids).toBeNull()
  await db.query('update projects set gig_report_musician_ids=$2 where id=$1', [tenant.projectId, []])
  expect((await db.query('select gig_report_musician_ids from projects where id=$1', [tenant.projectId])).rows[0].gig_report_musician_ids).toEqual([])
})
