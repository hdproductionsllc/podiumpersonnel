import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { adminClient, createTenant, type Tenant } from './helpers'

/**
 * Migration 101 (the gig report's client questions), against real Postgres:
 * a "how it went" answer needs a "yes, I dealt with the client" first, only the
 * three answers are accepted, and the paste script is idempotent and all PASS.
 */
let db: Client
let t: Tenant

beforeAll(async () => {
  db = await adminClient()
  t = await createTenant(db, 'grc')
})

afterAll(async () => {
  await db?.end()
})

let seq = 0
async function report(interacted: boolean | null, experience: string | null) {
  seq += 1
  const musician = await db.query(
    `insert into musicians (organization_id, first_name, last_name, email) values ($1, 'Lead', $2, $3) returning id`,
    [t.orgId, `L${seq}`, `lead${seq}@example.com`]
  )
  return db.query(
    `insert into gig_reports (organization_id, project_id, musician_id, token, client_interacted, client_experience)
     values ($1, $2, $3, $4, $5, $6) returning client_interacted, client_experience`,
    [t.orgId, t.projectId, musician.rows[0].id, `tok-${seq}-${'a'.repeat(40)}`, interacted, experience]
  )
}

describe('the client answers', () => {
  it('a report from before the questions has neither', async () => {
    const { rows } = await report(null, null)
    expect(rows[0]).toEqual({ client_interacted: null, client_experience: null })
  })

  it('yes, with how it went', async () => {
    const { rows } = await report(true, 'positive')
    expect(rows[0]).toEqual({ client_interacted: true, client_experience: 'positive' })
  })

  it('refuses how it went without a yes', async () => {
    await expect(report(false, 'negative')).rejects.toMatchObject({ code: '23514' })
    await expect(report(null, 'neutral')).rejects.toMatchObject({ code: '23514' })
  })

  it('refuses an answer that is not one of the three', async () => {
    await expect(report(true, 'amazing')).rejects.toMatchObject({ code: '23514' })
  })
})

describe('the paste script (scripts/sql/101-gig-report-client.paste.sql)', () => {
  const script = readFileSync(join(process.cwd(), 'scripts', 'sql', '101-gig-report-client.paste.sql'), 'utf8')

  it('carries the migration body verbatim', () => {
    const migration = readFileSync(join(process.cwd(), 'supabase', 'migrations', '101_gig_report_client.sql'), 'utf8')
    expect(script.replace(/\r\n/g, '\n')).toContain(migration.replace(/\r\n/g, '\n').trim())
  })

  it.each([1, 2])('run %i: every RESULTS row is PASS or INFO', async () => {
    const results = (await db.query(script)) as unknown as { rows: { check_name: string; result: string }[] }[]
    const table = results[results.length - 1].rows
    expect(table.length).toBeGreaterThan(3)
    for (const row of table) {
      expect(row.result, row.check_name).toMatch(/^(PASS|INFO)/)
    }
  })
})
