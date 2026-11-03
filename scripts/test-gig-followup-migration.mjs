// Synthetic, in-memory PostgreSQL only. npm install --prefix <temp-dir> @electric-sql/pglite@0.5.14
// Run: node scripts/test-gig-followup-migration.mjs <absolute path to pglite dist/index.js>
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
let assertions = 0
function check(value, message) { assert.ok(value,message); assertions++ }
await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create table public.organizations(id uuid primary key,name text);
 create table public.projects(id uuid primary key,organization_id uuid references organizations(id),name text);
 create table public.organization_members(user_id uuid,organization_id uuid,role text);
 create table public.musicians(id uuid primary key,organization_id uuid,first_name text,last_name text,email text);
 create table public.project_positions(project_id uuid,musician_id uuid,status text);
 create table public.gig_detail_sends(id uuid primary key default gen_random_uuid(),project_id uuid,organization_id uuid,sent_at timestamptz default now(),sent_by uuid,musician_count int,notes text);
 create table public.gig_detail_confirmations(id uuid primary key default gen_random_uuid(),send_id uuid,musician_id uuid,token text default replace(gen_random_uuid()::text,'-',''),confirmed_at timestamptz,unique(send_id,musician_id));
 grant usage on schema public,auth to service_role,authenticated,anon;
 grant all on all tables in schema public,auth to service_role;
`)
await db.exec(readFileSync(new URL('../supabase/migrations/20261103045346_gig_followups_private_attachments.sql',import.meta.url),'utf8'))
const org = randomUUID(), actor = randomUUID(), project = randomUUID(), musician = randomUUID(), otherOrg=randomUUID(), oldSend=randomUUID()
await db.query('insert into auth.users values ($1)',[actor])
await db.query("insert into organizations values ($1,'Test org'),($2,'Other org')",[org,otherOrg])
await db.query("insert into projects values ($1,$2,'Synthetic gig')",[project,org])
await db.query("insert into organization_members values ($1,$2,'admin')",[actor,org])
await db.query("insert into musicians values ($1,$2,'Test','Player','player@example.test')",[musician,org])
await db.query("insert into project_positions values ($1,$2,'confirmed')",[project,musician])
await db.query("insert into gig_detail_sends(id,project_id,organization_id,sent_by,musician_count,notes) values ($1,$2,$3,$4,1,'Original notes')",[oldSend,project,org,actor])
await db.query('insert into gig_detail_confirmations(send_id,musician_id,confirmed_at) values ($1,$2,now())',[oldSend,musician])
const prepare=async (overrides={})=>{
 const p={id:randomUUID(),org,project,actor,mode:'followup',subject:'Parking',message:'North gate',hash:'a'.repeat(64),attachments:[{filename:'map.png',contentType:'image/png',content:'AAAA'}],ids:[musician],...overrides}
 return (await db.query('select public.prepare_gig_followup($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id',[p.id,p.org,p.project,p.actor,p.mode,p.subject,p.message,p.hash,JSON.stringify(p.attachments),p.ids])).rows[0].id
}
await db.exec('set role service_role')
const batch=await prepare()
check((await db.query('select count(*)::int n from gig_detail_sends')).rows[0].n===1,'ordinary followup preserves sends')
check((await db.query('select confirmed_at from gig_detail_confirmations')).rows[0].confirmed_at,'ordinary preserves confirmations')
check(await prepare()===batch,'new request ID same content deduplicated')
check(await prepare({id:batch})===batch,'same request retry returns same batch')
await assert.rejects(prepare({id:batch,hash:'b'.repeat(64)}),/identifier/); assertions++
await assert.rejects(prepare({org:otherOrg}),/Not authorized/); assertions++
await assert.rejects(prepare({project:randomUUID()}),/Project not found/); assertions++
await assert.rejects(prepare({hash:'b'.repeat(64)}),/still processing/); assertions++
await db.query("update gig_followups set status='complete' where id=$1",[batch])
await db.query("update gig_followup_recipients set status='sent' where followup_id=$1",[batch])
await assert.rejects(prepare({hash:'b'.repeat(64),ids:[randomUUID()]}),/roster changed/); assertions++
await db.query("update musicians set email=null where id=$1",[musician])
await assert.rejects(prepare({hash:'b'.repeat(64)}),/email address/); assertions++
await db.query("update musicians set email='player@example.test' where id=$1",[musician])
const update=await prepare({mode:'material_update',message:'New call time',hash:'b'.repeat(64)})
const row=(await db.query('select details_send_id from gig_followups where id=$1',[update])).rows[0]
check(row.details_send_id!==oldSend,'material update creates fresh send')
check((await db.query('select confirmed_at from gig_detail_confirmations where send_id=$1',[row.details_send_id])).rows[0].confirmed_at===null,'fresh confirmation starts pending')
check((await db.query('select confirmed_at from gig_detail_confirmations where send_id=$1',[oldSend])).rows[0].confirmed_at,'old confirmation preserved')
check((await db.query('select notes from gig_detail_sends where id=$1',[row.details_send_id])).rows[0].notes.includes('New call time'),'updated notes retained')
const claims=await Promise.all([db.query("update gig_followups set status='sending' where id=$1 and status='pending' returning id",[update]),db.query("update gig_followups set status='sending' where id=$1 and status='pending' returning id",[update])])
check(claims.reduce((n,r)=>n+r.rows.length,0)===1,'only one dispatcher can claim')
await db.exec('reset role')
for(const role of ['anon','authenticated']){
 await db.exec(`set role ${role}`)
 await assert.rejects(db.query('select attachments from gig_followups'),/permission denied/); assertions++
 await assert.rejects(db.query('select confirmation_token from gig_followup_recipients'),/permission denied/); assertions++
 await assert.rejects(prepare(),/permission denied/); assertions++
 await db.exec('reset role')
}
const flags=await db.query("select relname,relrowsecurity from pg_class where relname in ('gig_followups','gig_followup_recipients')")
check(flags.rows.every(r=>r.relrowsecurity),'RLS enabled')
await db.close()
console.log(`PASS: ${assertions} PostgreSQL migration, tenant, privacy, duplicate and confirmation assertions. No network or real records used.`)
