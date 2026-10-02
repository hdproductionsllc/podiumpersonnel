import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { adminClient, asUser, createTenant, type Tenant } from './helpers'
import { VERTICAL_KEYS } from '@/lib/verticals'

/**
 * Migration 100 (the production_crew vertical), against real Postgres:
 *
 *   - 'production_crew' is an allowed vertical, and nothing else new is;
 *   - a new crew organization starts with call_scoped_requirements and
 *     allow_worker_drop on and auto_cascade off; every other vertical keeps
 *     call_scoped_requirements off (its default), however it is created;
 *   - sign-up (create_organization_with_owner) makes such an organization, and
 *     its admin can add "8 stagehands for the load-in" with nobody at Podium
 *     flipping anything;
 *   - only Podium can change an organization's vertical; an admin still edits
 *     everything else they could;
 *   - the paste script is idempotent and its RESULTS are all PASS or INFO.
 */
let db: Client
let t: Tenant

const paste = readFileSync(join(process.cwd(), 'scripts', 'sql', '100-production-crew-vertical.paste.sql'), 'utf8')

beforeAll(async () => {
  db = await adminClient()
  // Other files re-run earlier paste scripts (098 re-creates the frozen-columns
  // function without `vertical`); 100 is idempotent, so put it back first.
  await db.query(paste)
  t = await createTenant(db, 'crew')
})

afterAll(async () => {
  await db?.end()
})

async function newOrg(vertical: string | null, extra: Record<string, unknown> = {}) {
  const id = randomUUID()
  const cols = ['id', 'name', 'slug', ...(vertical ? ['vertical'] : []), ...Object.keys(extra)]
  const vals = [id, `Org ${id}`, `org-${id}`, ...(vertical ? [vertical] : []), ...Object.values(extra)]
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ')
  const { rows } = await db.query(
    `insert into organizations (${cols.join(', ')}) values (${placeholders})
     returning id, vertical, call_scoped_requirements, allow_worker_drop, auto_cascade`,
    vals
  )
  return rows[0]
}

describe('the vertical is allowed', () => {
  it('every key the app registers is accepted by the database', async () => {
    for (const key of VERTICAL_KEYS) {
      expect((await newOrg(key)).vertical).toBe(key)
    }
  })

  it('anything else is still refused', async () => {
    await expect(newOrg('photo_video')).rejects.toMatchObject({ code: '23514' })
  })
})

describe('a new organization\'s switches', () => {
  it('a production company starts with "only some calls" and "I can\'t make it" on, auto-offer off', async () => {
    expect(await newOrg('production_crew')).toMatchObject({
      call_scoped_requirements: true,
      allow_worker_drop: true,
      auto_cascade: false,
    })
  })

  it.each(VERTICAL_KEYS.filter((k) => k !== 'production_crew'))('a new %s organization keeps "only some calls" off', async (vertical) => {
    expect((await newOrg(vertical)).call_scoped_requirements).toBe(false)
  })

  it('an organization inserted with no vertical is a music contractor with every switch off', async () => {
    expect(await newOrg(null)).toMatchObject({
      vertical: 'music_contractor',
      call_scoped_requirements: false,
      allow_worker_drop: false,
      auto_cascade: false,
    })
  })

  it('an existing organization is untouched by the migration (the tenant made before it re-ran)', async () => {
    const { rows } = await db.query(
      'select vertical, call_scoped_requirements, allow_worker_drop, auto_cascade from organizations where id = $1',
      [t.orgId]
    )
    expect(rows[0]).toEqual({ vertical: 'music_contractor', call_scoped_requirements: false, allow_worker_drop: false, auto_cascade: false })
  })
})

describe('sign-up makes a working crew company', () => {
  it('its admin can add eight stagehands for the load-in, with nobody at Podium flipping a switch', async () => {
    const owner = randomUUID()
    await db.query('insert into auth.users (id, email) values ($1, $2)', [owner, `owner-${owner}@example.test`])
    const org = await newOrg('production_crew')
    await db.query("insert into organization_members (organization_id, user_id, role) values ($1, $2, 'owner')", [org.id, owner])
    const role = randomUUID()
    const project = randomUUID()
    const loadIn = randomUUID()
    await db.query("insert into instruments (id, organization_id, name, section) values ($1, $2, 'Stagehand', 'labor')", [role, org.id])
    await db.query("insert into projects (id, organization_id, name, status) values ($1, $2, 'Acme', 'active')", [project, org.id])
    await db.query(
      "insert into services (id, project_id, name, service_type, start_time, leader_fee) values ($1, $2, 'Acme Load-in', 'load_in', now() + interval '7 days', 0)",
      [loadIn, project]
    )
    const { rows } = await db.query(
      'select create_requirement($1::uuid, $2::uuid, 8, $3::uuid, $4::uuid[], 200, null, $5::uuid) as r',
      [project, role, owner, [loadIn], randomUUID()]
    )
    const made = rows[0].r as { result: string; position_ids: string[] }
    expect(made.result).toBe('created')
    expect(made.position_ids).toHaveLength(8)
  })

  it('the same sign-up for a music contractor leaves "only some calls" off', async () => {
    const owner = randomUUID()
    await db.query('insert into auth.users (id, email) values ($1, $2)', [owner, `owner-${owner}@example.test`])
    const on = await asUser(db, owner, async (q) => {
      await q("select create_organization_with_owner('A Quartet', $1, 'America/Chicago')", [`quartet-${owner}`])
      const { rows } = await q('select call_scoped_requirements, allow_worker_drop from organizations where slug like $1', [`quartet-${owner}%`])
      return rows[0]
    })
    expect(on).toEqual({ call_scoped_requirements: false, allow_worker_drop: false })
  })

  it('a crew company made at sign-up has its switches when read back in the same session', async () => {
    const owner = randomUUID()
    await db.query('insert into auth.users (id, email) values ($1, $2)', [owner, `owner-${owner}@example.test`])
    const on = await asUser(db, owner, async (q) => {
      await q("select create_organization_with_owner('A Crew', $1, 'America/Chicago', 'production_crew')", [`crew-${owner}`])
      const { rows } = await q('select call_scoped_requirements, allow_worker_drop, auto_cascade from organizations where slug like $1', [`crew-${owner}%`])
      return rows[0]
    })
    expect(on).toEqual({ call_scoped_requirements: true, allow_worker_drop: true, auto_cascade: false })
  })
})

describe('only Podium changes an organization\'s vertical', () => {
  it('the admin\'s own session cannot', async () => {
    await expect(
      asUser(db, t.adminUserId, (q) => q("update organizations set vertical = 'production_crew' where id = $1", [t.orgId]))
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('the admin can still rename their organization', async () => {
    const res = await asUser(db, t.adminUserId, (q) =>
      q("update organizations set name = 'Renamed' where id = $1 returning name", [t.orgId])
    )
    expect(res.rows).toEqual([{ name: 'Renamed' }])
  })

  it('the service role can', async () => {
    const org = await newOrg('event_agency')
    const { rows } = await db.query("update organizations set vertical = 'production_crew' where id = $1 returning vertical", [org.id])
    expect(rows).toEqual([{ vertical: 'production_crew' }])
  })
})

describe('the paste script (scripts/sql/100-production-crew-vertical.paste.sql)', () => {
  it.each([1, 2])('run %i: every RESULTS row is PASS or INFO', async () => {
    // Other tests leave switches on in non-crew organizations; the script's
    // "off for everyone else" checks are about a production database, so clear them.
    await db.query("update project_positions set scope_mode = 'all' where scope_mode = 'selected'")
    await db.query("update organizations set call_scoped_requirements = false where call_scoped_requirements and vertical <> 'production_crew'")
    await db.query('update organizations set auto_cascade = false where auto_cascade')
    const results = (await db.query(paste)) as unknown as { rows: { check_name: string; result: string }[] }[]
    const table = results[results.length - 1].rows
    expect(table.length).toBeGreaterThan(5)
    for (const row of table) {
      expect(row.result, row.check_name).toMatch(/^(PASS|INFO)/)
    }
  })

  it('records 100 as applied', async () => {
    const { rows } = await db.query("select name from supabase_migrations.schema_migrations where version = '100'")
    expect(rows).toEqual([{ name: '100_production_crew_vertical' }])
  })
})
