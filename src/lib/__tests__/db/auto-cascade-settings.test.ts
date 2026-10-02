import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { adminClient, asUser, createTenant, type Tenant } from './helpers'

/**
 * Migration 096 (auto-offer and worker-drop switches, the cascade's
 * idempotency key), against real Postgres:
 *
 *   - auto_cascade and auto_cascade_disabled are off by default;
 *   - allow_worker_drop follows the vertical for new rows (trigger) and the
 *     paste script backfills old rows the same way without overwriting a choice;
 *   - one triggering offer can cause at most one cascaded offer (unique index),
 *     and deleting the trigger leaves the cascaded offer with a NULL pointer;
 *   - an org admin's own session can flip the switches (081 does not freeze them);
 *   - the paste script is idempotent and its RESULTS are all PASS or INFO.
 */
let db: Client
let t: Tenant

beforeAll(async () => {
  db = await adminClient()
  t = await createTenant(db, 'ac')
})

afterAll(async () => {
  await db?.end()
})

async function newOrg(vertical: string | null, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const id = randomUUID()
  const cols = ['id', 'name', 'slug', ...(vertical ? ['vertical'] : []), ...Object.keys(extra)]
  const vals = [id, `Org ${id}`, `org-${id}`, ...(vertical ? [vertical] : []), ...Object.values(extra)]
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ')
  const { rows } = await db.query(
    `insert into organizations (${cols.join(', ')}) values (${placeholders}) returning id, vertical, auto_cascade, allow_worker_drop`,
    vals
  )
  return rows[0]
}

/** A fresh chair on the tenant's gig. */
async function newChair(): Promise<string> {
  const id = randomUUID()
  await db.query(
    `insert into project_positions (id, project_id, instrument_id, chair_number)
     select $1, project_id, instrument_id, (select max(chair_number) + 1 from project_positions where project_id = $3)
       from project_positions where id = $2`,
    [id, t.positionId, t.projectId]
  )
  return id
}

async function newOffer(chair: string, status: string, cascadedFrom: string | null = null): Promise<string> {
  const id = randomUUID()
  await db.query(
    `insert into contract_offers (id, project_position_id, musician_id, status, cascaded_from_offer_id)
     values ($1, $2, $3, $4, $5)`,
    [id, chair, t.musicianId, status, cascadedFrom]
  )
  return id
}

describe('defaults', () => {
  it('a new organization has auto-offer off', async () => {
    expect((await newOrg('theatre')).auto_cascade).toBe(false)
  })

  it.each([
    ['music_contractor', false],
    ['orchestra_band', false],
    ['choir', true],
    ['theatre', true],
    ['dance', true],
    ['church_worship', true],
    ['event_agency', true],
  ])('a new %s organization gets allow_worker_drop = %s', async (vertical, expected) => {
    expect((await newOrg(vertical)).allow_worker_drop).toBe(expected)
  })

  it('an organization inserted with no vertical is a music contractor, drop off', async () => {
    expect(await newOrg(null)).toMatchObject({ vertical: 'music_contractor', allow_worker_drop: false })
  })

  it('an explicit value on insert is kept', async () => {
    expect((await newOrg('music_contractor', { allow_worker_drop: true })).allow_worker_drop).toBe(true)
    expect((await newOrg('theatre', { allow_worker_drop: false })).allow_worker_drop).toBe(false)
  })

  it('a new chair is in auto-offer, and a new offer was caused by nothing', async () => {
    const chair = await newChair()
    const offer = await newOffer(chair, 'declined')
    const { rows } = await db.query(
      `select p.auto_cascade_disabled, o.cascaded_from_offer_id
         from project_positions p join contract_offers o on o.project_position_id = p.id where o.id = $1`,
      [offer]
    )
    expect(rows[0]).toEqual({ auto_cascade_disabled: false, cascaded_from_offer_id: null })
  })
})

describe('one cascaded offer per triggering offer', () => {
  it('a second offer naming the same cause is refused by the database', async () => {
    const chair = await newChair()
    const declined = await newOffer(chair, 'declined')
    await newOffer(chair, 'expired', declined)
    await expect(newOffer(chair, 'declined', declined)).rejects.toMatchObject({ code: '23505' })
  })

  it('different causes are fine', async () => {
    const chair = await newChair()
    const a = await newOffer(chair, 'declined')
    const b = await newOffer(chair, 'expired')
    await newOffer(chair, 'declined', a)
    await expect(newOffer(chair, 'rescinded', b)).resolves.toBeTruthy()
  })

  it('deleting the cause keeps the cascaded offer, with no pointer', async () => {
    const chair = await newChair()
    const cause = await newOffer(chair, 'declined')
    const cascaded = await newOffer(chair, 'expired', cause)
    await db.query('delete from contract_offers where id = $1', [cause])
    const { rows } = await db.query('select cascaded_from_offer_id from contract_offers where id = $1', [cascaded])
    expect(rows).toEqual([{ cascaded_from_offer_id: null }])
  })
})

describe('the org admin sets the switches through their own session', () => {
  it('can turn auto-offer on and worker drop on (081 does not freeze them)', async () => {
    const res = await asUser(db, t.adminUserId, (q) =>
      q('update organizations set auto_cascade = true, allow_worker_drop = true where id = $1 returning auto_cascade, allow_worker_drop', [t.orgId])
    )
    expect(res.rows).toEqual([{ auto_cascade: true, allow_worker_drop: true }])
  })

  it('can switch one of their chairs out of auto-offer', async () => {
    const res = await asUser(db, t.adminUserId, (q) =>
      q('update project_positions set auto_cascade_disabled = true where id = $1 returning id', [t.positionId])
    )
    expect(res.rowCount).toBe(1)
  })

  it('cannot touch another organization\'s switches', async () => {
    const other = await createTenant(db, 'ac-other')
    const res = await asUser(db, t.adminUserId, (q) =>
      q('update organizations set auto_cascade = true where id = $1', [other.orgId])
    )
    expect(res.rowCount).toBe(0)
    const chair = await asUser(db, t.adminUserId, (q) =>
      q('update project_positions set auto_cascade_disabled = true where id = $1', [other.positionId])
    )
    expect(chair.rowCount).toBe(0)
  })
})

describe('the paste script (scripts/sql/096-auto-cascade-settings.paste.sql)', () => {
  const script = readFileSync(join(process.cwd(), 'scripts', 'sql', '096-auto-cascade-settings.paste.sql'), 'utf8')
  let musicOrg: string
  let theatreOrg: string
  let chosenOrg: string

  beforeAll(async () => {
    // Rows as they were before 096: no value yet. (Dropping NOT NULL stands in
    // for the column not existing; the script puts it back.)
    musicOrg = (await newOrg('music_contractor')).id as string
    theatreOrg = (await newOrg('theatre')).id as string
    chosenOrg = (await newOrg('theatre', { allow_worker_drop: false })).id as string
    await db.query('alter table organizations alter column allow_worker_drop drop not null')
    await db.query('update organizations set allow_worker_drop = null where id = any($1)', [[musicOrg, theatreOrg]])
  })

  it.each([1, 2])('run %i: every RESULTS row is PASS or INFO', async () => {
    const results = (await db.query(script)) as unknown as { rows: { check_name: string; result: string }[] }[]
    const table = results[results.length - 1].rows
    expect(table.length).toBeGreaterThanOrEqual(8)
    for (const row of table) {
      expect(row.result, row.check_name).toMatch(/^(PASS|INFO)/)
    }
  })

  it('backfills by vertical, keeps a choice already made, and restores NOT NULL', async () => {
    const { rows } = await db.query('select id, allow_worker_drop from organizations where id = any($1)', [
      [musicOrg, theatreOrg, chosenOrg],
    ])
    const value = Object.fromEntries(rows.map((r) => [r.id, r.allow_worker_drop]))
    expect(value).toEqual({ [musicOrg]: false, [theatreOrg]: true, [chosenOrg]: false })
    const { rows: col } = await db.query(
      "select is_nullable from information_schema.columns where table_name = 'organizations' and column_name = 'allow_worker_drop'"
    )
    expect(col[0].is_nullable).toBe('NO')
  })

  it('records 096 as applied', async () => {
    const { rowCount } = await db.query("select 1 from supabase_migrations.schema_migrations where version = '096'")
    expect(rowCount).toBe(1)
  })
})
