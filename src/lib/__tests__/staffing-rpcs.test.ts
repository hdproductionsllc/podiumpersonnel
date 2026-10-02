import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Migrations 094 (claim_chair, create_offer, the confirmed-chair CHECK) and
 * 095 (the one-offer-per-chair indexes), and their paste scripts, checked as
 * files. What the SQL actually does is tested against Postgres in
 * db/staffing-rpcs.test.ts (CI's database job); these catch a paste script
 * drifting from its migration, a function losing its lock-down, or a rule
 * landing in the wrong migration for the deploy order (094 before the code,
 * 095 after it).
 */

const read = (rel: string) => readFileSync(resolve(__dirname, '../../..', rel), 'utf-8').replace(/\r\n/g, '\n')
const migration = read('supabase/migrations/094_cascade_constraints.sql')
const paste = read('scripts/sql/094-cascade-constraints.paste.sql')
const repair = read('scripts/sql/094-repair-before-constraints.paste.sql')
const migration095 = read('supabase/migrations/095_one_offer_per_chair.sql')
const paste095 = read('scripts/sql/095-one-offer-per-chair.paste.sql')
const repair095 = read('scripts/sql/095-repair-before-unique-indexes.paste.sql')
const code = (sql: string) => sql.replace(/--.*$/gm, '')
const header = (sql: string) => sql.slice(0, sql.indexOf('\nBEGIN;\n'))

function carriesVerbatim(pasteSql: string, migrationSql: string, version: string, name: string) {
  const begin = pasteSql.indexOf('\nBEGIN;\n')
  const commit = pasteSql.indexOf('\nCOMMIT;\n')
  expect(begin).toBeGreaterThan(0)
  expect(commit).toBeGreaterThan(begin)
  expect(pasteSql.slice(begin, commit)).toContain(migrationSql.trim())
  expect(pasteSql.slice(begin, commit)).toContain(`VALUES ('${version}', '${name}')`)
  expect(pasteSql.slice(commit)).toMatch(/RESULTS[\s\S]*'PASS'/)
}

describe('migration 094 and its paste script', () => {
  it('the paste script carries the migration verbatim, inside one transaction, and ends with a RESULTS table', () => {
    carriesVerbatim(paste, migration, '094', '094_cascade_constraints')
  })

  it('tells David to run the repair script first, and 095 only after the deploy', () => {
    expect(header(paste)).toContain('094-repair-before-constraints.paste.sql')
    expect(header(paste)).toMatch(/095[\s\S]*AFTER the deploy/)
  })

  it('stops, changing nothing, if 092/093 are missing or a chair would break the CHECK', () => {
    expect(code(migration)).toMatch(/to_regprocedure\('public\.log_staffing_event\(uuid, text, uuid, text, uuid, text, jsonb, jsonb\)'\) IS NULL/)
    expect(code(migration)).toMatch(/RAISE EXCEPTION 'Migration 094 stopped, nothing was changed: migration 092/)
    expect(code(migration)).toMatch(/RAISE EXCEPTION 'Migration 094 stopped, nothing was changed: migration 093/)
    expect(code(migration)).toMatch(/RAISE EXCEPTION 'Migration 094 stopped, nothing was changed: % chair/)
  })

  it("holds nothing today's code breaks: no unique index on contract_offers (those are 095)", () => {
    expect(code(migration)).not.toMatch(/CREATE UNIQUE INDEX/i)
    expect(code(migration)).not.toMatch(/one_live_per_position|one_accepted_per_position/)
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
    for (const sql of [migration, migration095]) {
      expect(code(sql)).not.toMatch(/pay_basis/i)
      expect(code(sql)).not.toMatch(/\bDELETE\b|\bDROP COLUMN\b|\bDROP TABLE\b/i)
      expect(code(sql)).not.toMatch(/leader_fee|base_pay/)
    }
  })

  it('builds indexes with plain CREATE INDEX (CONCURRENTLY cannot run in a transaction)', () => {
    expect(code(migration)).not.toMatch(/CONCURRENTLY/i)
    expect(code(migration095)).not.toMatch(/CONCURRENTLY/i)
  })
})

describe('migration 095 and its paste script', () => {
  it('the paste script carries the migration verbatim, inside one transaction, and ends with a RESULTS table', () => {
    carriesVerbatim(paste095, migration095, '095', '095_one_offer_per_chair')
  })

  it('holds exactly the two one-offer-per-chair indexes', () => {
    expect(code(migration095).match(/CREATE UNIQUE INDEX IF NOT EXISTS (\w+)/g)).toEqual([
      'CREATE UNIQUE INDEX IF NOT EXISTS contract_offers_one_live_per_position',
      'CREATE UNIQUE INDEX IF NOT EXISTS contract_offers_one_accepted_per_position',
    ])
    expect(code(migration095)).not.toMatch(/FUNCTION|ALTER TABLE/i)
  })

  it('says to paste it only after the deploy, and to run its repair script first', () => {
    expect(header(paste095)).toMatch(/ONLY AFTER the code that uses migration 094 is deployed/)
    expect(header(paste095)).toContain('095-repair-before-unique-indexes.paste.sql')
  })

  it('stops, changing nothing, over offers the indexes would reject', () => {
    expect(code(migration095)).toMatch(/RAISE EXCEPTION 'Migration 095 stopped, nothing was changed: % chair/)
  })
})

describe.each([
  { name: '094 (chairs)', sql: repair, fixes: 3, reason: 'repair_094', migration: '094' },
  { name: '095 (offers)', sql: repair095, fixes: 2, reason: 'repair_095', migration: '095' },
])('the repair script before $name', ({ sql, fixes, reason, migration: num }) => {
  it('runs in one transaction, ends with a RESULTS table, and deletes nothing', () => {
    const begin = sql.indexOf('\nBEGIN;\n')
    const commit = sql.indexOf('\nCOMMIT;\n')
    expect(begin).toBeGreaterThan(0)
    expect(commit).toBeGreaterThan(begin)
    expect(sql.slice(commit)).toMatch(/RESULTS[\s\S]*'PASS'/)
    expect(code(sql)).not.toMatch(/\bDELETE\b|\bDROP\b|\bTRUNCATE\b/i)
    expect(sql.slice(commit)).toContain(`do not run ${num}`)
  })

  it(`records every fix in staffing_events with reason ${reason}`, () => {
    const found = code(sql).match(/\), fixed AS \(/g) ?? []
    const logs = code(sql).match(/INSERT INTO staffing_events/g) ?? []
    expect(found.length).toBe(fixes)
    expect(logs.length).toBe(fixes)
    expect(code(sql).match(new RegExp(`'reason', '${reason}'`, 'g'))?.length).toBe(fixes)
  })

  it('does not record itself as a migration', () => {
    expect(sql).not.toContain('schema_migrations')
  })
})
