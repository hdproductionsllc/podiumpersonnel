import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { adminClient } from './helpers'

/**
 * scripts/sql/audit-live-migrations.sql is the read-only check David pastes to
 * see which database updates are really live in production (2026-10-05: 081's
 * protection turned out to be missing). Here every migration has been replayed,
 * so every row must say PASS: proof the check itself is right and cannot raise
 * a false alarm.
 */
let db: Client

beforeAll(async () => {
  db = await adminClient()
})

afterAll(async () => {
  await db?.end()
})

describe('the live-migrations audit', () => {
  const script = readFileSync(join(process.cwd(), 'scripts', 'sql', 'audit-live-migrations.sql'), 'utf8')

  it('changes nothing (only SELECTs)', () => {
    const statements = script.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)
    expect(statements).toHaveLength(1)
    expect(statements[0]).toMatch(/^WITH expected/)
  })

  it('reports PASS for every migration on a fully migrated database', async () => {
    const { rows } = await db.query<{ check_name: string; result: string }>(script)
    expect(rows.length).toBeGreaterThan(10)
    for (const row of rows) expect(row.result, row.check_name).toBe('PASS')
  })
})
