import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Migration 094 (cascade constraints, claim_chair, create_offer) and its two
 * paste scripts, checked as files. What the SQL actually does is tested against
 * Postgres in db/staffing-rpcs.test.ts (CI's database job); these catch a paste
 * script drifting from the migration, or a function losing its lock-down.
 */

const read = (rel: string) => readFileSync(resolve(__dirname, '../../..', rel), 'utf-8').replace(/\r\n/g, '\n')
const migration = read('supabase/migrations/094_cascade_constraints.sql')
const paste = read('scripts/sql/094-cascade-constraints.paste.sql')
const repair = read('scripts/sql/094-repair-before-constraints.paste.sql')
const code = (sql: string) => sql.replace(/--.*$/gm, '')

describe('migration 094 and its paste script', () => {
  it('the paste script carries the migration verbatim, inside one transaction', () => {
    const begin = paste.indexOf('\nBEGIN;\n')
    const commit = paste.indexOf('\nCOMMIT;\n')
    expect(begin).toBeGreaterThan(0)
    expect(commit).toBeGreaterThan(begin)
    expect(paste.slice(begin, commit)).toContain(migration.trim())
    expect(paste.slice(begin, commit)).toContain("VALUES ('094', '094_cascade_constraints')")
  })

  it('ends with a RESULTS table', () => {
    expect(paste.slice(paste.indexOf('\nCOMMIT;\n'))).toMatch(/RESULTS[\s\S]*'PASS'/)
  })

  it('tells David to run the repair script first', () => {
    expect(paste.slice(0, paste.indexOf('\nBEGIN;\n'))).toContain('094-repair-before-constraints.paste.sql')
  })

  it('stops, changing nothing, if a row would break the new rules', () => {
    expect(code(migration)).toMatch(/RAISE EXCEPTION 'Migration 094 stopped, nothing was changed/)
  })

  it('both functions are SECURITY DEFINER, pinned to public, and callable by the service role only', () => {
    for (const fn of ['claim_chair', 'create_offer']) {
      const body = code(migration).slice(code(migration).indexOf(`CREATE OR REPLACE FUNCTION ${fn}(`))
      expect(body.slice(0, body.indexOf('AS $$'))).toMatch(/SECURITY DEFINER\s+SET search_path = public, pg_temp/)
      expect(code(migration)).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${fn}\\([^)]*\\)\\s+FROM PUBLIC, anon, authenticated;`))
      expect(code(migration)).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${fn}\\([^)]*\\)\\s+TO service_role;`))
    }
  })

  it('adds no pay_basis, computes no pay, deletes nothing', () => {
    expect(code(migration)).not.toMatch(/pay_basis/i)
    expect(code(migration)).not.toMatch(/\bDELETE\b|\bDROP COLUMN\b|\bDROP TABLE\b/i)
    expect(code(migration)).not.toMatch(/leader_fee|base_pay/)
  })

  it('builds indexes with plain CREATE INDEX (CONCURRENTLY cannot run in a transaction)', () => {
    expect(code(migration)).not.toMatch(/CONCURRENTLY/i)
  })
})

describe('the repair script (run before 094)', () => {
  it('runs in one transaction, ends with a RESULTS table, and deletes nothing', () => {
    const begin = repair.indexOf('\nBEGIN;\n')
    const commit = repair.indexOf('\nCOMMIT;\n')
    expect(begin).toBeGreaterThan(0)
    expect(commit).toBeGreaterThan(begin)
    expect(repair.slice(commit)).toMatch(/RESULTS[\s\S]*'PASS'/)
    expect(code(repair)).not.toMatch(/\bDELETE\b|\bDROP\b|\bTRUNCATE\b/i)
  })

  it('records every fix in staffing_events with reason repair_094', () => {
    const fixes = code(repair).match(/\), fixed AS \(/g) ?? []
    const logs = code(repair).match(/INSERT INTO staffing_events/g) ?? []
    expect(fixes.length).toBe(5)
    expect(logs.length).toBe(fixes.length)
    expect(code(repair).match(/'reason', 'repair_094'/g)?.length).toBe(fixes.length)
  })

  it('does not record itself as a migration', () => {
    expect(repair).not.toContain('schema_migrations')
  })
})
