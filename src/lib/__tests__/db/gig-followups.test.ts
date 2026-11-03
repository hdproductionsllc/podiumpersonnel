import { randomUUID } from 'crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { adminClient, asAnon, asUser, createTenant, type Tenant } from './helpers'
let db:Client
let tenant:Tenant
let other:Tenant
let previousSend:string
beforeAll(async()=>{
 db=await adminClient();tenant=await createTenant(db,'followup');other=await createTenant(db,'other-followup')
 await db.query("update project_positions set musician_id=$1,status='confirmed' where id=$2",[tenant.musicianId,tenant.positionId])
 previousSend=(await db.query('insert into gig_detail_sends(project_id,organization_id,sent_by,musician_count,notes) values($1,$2,$3,1,$4) returning id',[tenant.projectId,tenant.orgId,tenant.adminUserId,'Original notes'])).rows[0].id
 await db.query('insert into gig_detail_confirmations(send_id,musician_id,confirmed_at) values($1,$2,now())',[previousSend,tenant.musicianId])
})
afterAll(async()=>{await db?.end()})
async function prepare(mode='followup',id=randomUUID(),hash='a'.repeat(64),org=tenant.orgId,actor=tenant.adminUserId){
 return (await db.query('select prepare_gig_followup($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id',[id,org,tenant.projectId,actor,mode,'Venue map','Use north entrance',hash,'[]',[tenant.musicianId]])).rows[0].id as string
}
describe('gig follow-up migration in the full app schema',()=>{
 it('keeps ordinary confirmations and deduplicates repeated requests',async()=>{
  const first=await prepare();expect(await prepare()).toBe(first)
  expect((await db.query('select count(*)::int n from gig_detail_sends where project_id=$1',[tenant.projectId])).rows[0].n).toBe(1)
  expect((await db.query('select confirmed_at from gig_detail_confirmations where send_id=$1',[previousSend])).rows[0].confirmed_at).toBeTruthy()
  await db.query("update gig_followup_recipients set status='sent' where followup_id=$1",[first])
  await db.query("update gig_followups set status='complete' where id=$1",[first])
 })
 it('creates a fresh confirmation only for an explicit material update',async()=>{
  const id=await prepare('material_update',randomUUID(),'b'.repeat(64))
  const send=(await db.query('select details_send_id from gig_followups where id=$1',[id])).rows[0].details_send_id
  expect(send).not.toBe(previousSend)
  expect((await db.query('select confirmed_at from gig_detail_confirmations where send_id=$1',[send])).rows[0].confirmed_at).toBeNull()
  expect((await db.query('select confirmed_at from gig_detail_confirmations where send_id=$1',[previousSend])).rows[0].confirmed_at).toBeTruthy()
 })
 it('rejects an admin from another organization',async()=>{
  await expect(prepare('followup',randomUUID(),'c'.repeat(64),tenant.orgId,other.adminUserId)).rejects.toMatchObject({code:'42501'})
  await expect(prepare('followup',randomUUID(),'c'.repeat(64),other.orgId,other.adminUserId)).rejects.toMatchObject({code:'42501'})
 })
 it('keeps attachment bytes and confirmation tokens inaccessible to Data API roles',async()=>{
  await expect(asAnon(db,q=>q('select attachments from gig_followups'))).rejects.toMatchObject({code:'42501'})
  await expect(asUser(db,tenant.adminUserId,q=>q('select confirmation_token from gig_followup_recipients'))).rejects.toMatchObject({code:'42501'})
 })
})
