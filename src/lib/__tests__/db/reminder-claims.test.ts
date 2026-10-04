import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { adminClient, connectionUrl, createTenant, type Tenant } from './helpers'

/**
 * Migration 102 against real Postgres: the reminder claim (src/lib/reminders/
 * claim.ts) is one conditional UPDATE, so two requests at the same moment
 * cannot both claim the same person. This runs that UPDATE from two separate
 * connections at once.
 */
let db: Client
let t: Tenant
let confirmationId: string

const CLAIM = `
  update gig_detail_confirmations set last_reminded_at = now()
  where id = $1 and (last_reminded_at is null or last_reminded_at < now() - interval '10 minutes')
  returning id`

beforeAll(async () => {
  db = await adminClient()
  t = await createTenant(db, 'rc')
  const send = await db.query(
    `insert into gig_detail_sends (organization_id, project_id, sent_at, sent_by, musician_count) values ($1, $2, now(), $3, 1) returning id`,
    [t.orgId, t.projectId, t.adminUserId]
  )
  const conf = await db.query(
    `insert into gig_detail_confirmations (send_id, musician_id) values ($1, $2) returning id`,
    [send.rows[0].id, t.musicianId]
  )
  confirmationId = conf.rows[0].id
})

afterAll(async () => {
  await db?.end()
})

describe('two reminder requests at once', () => {
  it('exactly one claims the person', async () => {
    const a = new Client({ connectionString: connectionUrl() })
    const b = new Client({ connectionString: connectionUrl() })
    await Promise.all([a.connect(), b.connect()])
    try {
      const [ra, rb] = await Promise.all([a.query(CLAIM, [confirmationId]), b.query(CLAIM, [confirmationId])])
      expect(ra.rowCount! + rb.rowCount!).toBe(1)
    } finally {
      await Promise.all([a.end(), b.end()])
    }
  })

  it('a third press within ten minutes claims nothing', async () => {
    const r = await db.query(CLAIM, [confirmationId])
    expect(r.rowCount).toBe(0)
  })

  it('after ten minutes the person can be reminded again', async () => {
    await db.query(`update gig_detail_confirmations set last_reminded_at = now() - interval '11 minutes' where id = $1`, [confirmationId])
    const r = await db.query(CLAIM, [confirmationId])
    expect(r.rowCount).toBe(1)
  })
})

describe('the paste script (scripts/sql/102-reminder-claims.paste.sql)', () => {
  const script = readFileSync(join(process.cwd(), 'scripts', 'sql', '102-reminder-claims.paste.sql'), 'utf8')

  it('carries the migration body verbatim', () => {
    const migration = readFileSync(join(process.cwd(), 'supabase', 'migrations', '102_reminder_claims.sql'), 'utf8')
    expect(script.replace(/\r\n/g, '\n')).toContain(migration.replace(/\r\n/g, '\n').trim())
  })

  it.each([1, 2])('run %i: every RESULTS row is PASS', async () => {
    const results = (await db.query(script)) as unknown as { rows: { check_name: string; result: string }[] }[]
    const table = results[results.length - 1].rows
    expect(table).toHaveLength(3)
    for (const row of table) expect(row.result, row.check_name).toBe('PASS')
  })
})
