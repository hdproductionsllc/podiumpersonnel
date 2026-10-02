import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { adminClient, asUser, createTenant, type Tenant } from './helpers'

/**
 * Migration 097 (email_logs channel and failed sends), against real Postgres.
 *
 *   - a row inserted the way today's live code does it (none of the new
 *     columns named) still works and reads channel 'email', no failure;
 *   - a failed send's row stores when and why; channel only takes email / sms;
 *   - the paste script is idempotent and its RESULTS table is all PASS.
 */
let db: Client
let t: Tenant

beforeAll(async () => {
  db = await adminClient()
  t = await createTenant(db, 'el')
})

afterAll(async () => {
  await db?.end()
})

/** Exactly the columns logEmail named before 097. */
async function legacyRow(status = 'sent'): Promise<string> {
  const { rows } = await db.query(
    `insert into email_logs (organization_id, recipient_email, recipient_name, subject, email_type,
       musician_id, project_id, offer_id, resend_email_id, status, metadata, body)
     values ($1, 'sam@example.com', 'Sam', 'Reminder: Gala', 'offer_reminder', $2, $3, null, 're_1', $4, '{}', 'Hi')
     returning id`,
    [t.orgId, t.musicianId, t.projectId, status]
  )
  return rows[0].id
}

describe("today's inserts are unaffected", () => {
  it('a row that names none of the new columns is an email that did not fail', async () => {
    const id = await legacyRow()
    const { rows } = await db.query('select channel, failed_at, failure_reason, status from email_logs where id = $1', [id])
    expect(rows[0]).toEqual({ channel: 'email', failed_at: null, failure_reason: null, status: 'sent' })
  })
})

describe('a failed send', () => {
  it('stores when and why', async () => {
    const { rows } = await db.query(
      `insert into email_logs (organization_id, recipient_email, subject, email_type, status, channel, failed_at, failure_reason)
       values ($1, 'sam@example.com', 'Reminder: Gala', 'offer_reminder', 'failed', 'email', '2026-10-02T12:00:00Z', 'rate limited')
       returning channel, failure_reason, failed_at is not null as has_failed_at`,
      [t.orgId]
    )
    expect(rows[0]).toEqual({ channel: 'email', failure_reason: 'rate limited', has_failed_at: true })
  })

  it('channel takes only email or sms', async () => {
    await expect(
      db.query(
        `insert into email_logs (organization_id, recipient_email, subject, email_type, channel)
         values ($1, 'a@example.com', 's', 't', 'fax')`,
        [t.orgId]
      )
    ).rejects.toMatchObject({ code: '23514' })
  })

  it("an org admin's own session can read the failure columns (the Emails page)", async () => {
    await legacyRow('failed')
    const res = await asUser(db, t.adminUserId, (q) =>
      q('select channel, failed_at, failure_reason from email_logs where organization_id = $1', [t.orgId])
    )
    expect(res.rows.length).toBeGreaterThan(0)
  })
})

describe('the paste script (scripts/sql/097-email-logs-channel.paste.sql)', () => {
  const script = readFileSync(join(process.cwd(), 'scripts', 'sql', '097-email-logs-channel.paste.sql'), 'utf8')

  it('carries the migration body verbatim', () => {
    const migration = readFileSync(join(process.cwd(), 'supabase', 'migrations', '097_email_logs_channel.sql'), 'utf8')
    expect(script.replace(/\r\n/g, '\n')).toContain(migration.replace(/\r\n/g, '\n').trim())
  })

  it.each([1, 2])('run %i: every RESULTS row is PASS or INFO', async () => {
    const results = (await db.query(script)) as unknown as { rows: { check_name: string; result: string }[] }[]
    const table = results[results.length - 1].rows
    expect(table.length).toBeGreaterThan(5)
    for (const row of table) {
      expect(row.result, row.check_name).toMatch(/^(PASS|INFO)/)
    }
  })
})
