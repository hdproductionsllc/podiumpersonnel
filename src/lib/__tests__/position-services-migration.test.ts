import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Migration 098 and its paste script, read as text (the database itself is
 * tested in db/position-services.test.ts). What a reviewer would check by eye:
 * the paste script is the migration verbatim; nothing turns the switch on or
 * scopes a chair; and the two 096 functions it re-creates differ from 096
 * ONLY in the lines that read a chair's services.
 */

const read = (rel: string) => readFileSync(resolve(__dirname, '../../..', rel), 'utf-8').replace(/\r\n/g, '\n')
const m096 = read('supabase/migrations/096_auto_cascade_settings.sql')
const m098 = read('supabase/migrations/098_position_services.sql')
const paste = read('scripts/sql/098-position-services.paste.sql')
const code = (sql: string) => sql.replace(/--.*$/gm, '')

/** A function's CREATE ... $$; statement, comments dropped and blank lines squeezed. */
function fn(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`)
  expect(start, `${name} is defined`).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf('\n$$;', start)
  return code(sql.slice(start, end + 4))
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '')
    .join('\n')
}

describe('migration 098 and its paste script', () => {
  it('the paste script carries the migration verbatim, inside one transaction, and records 098', () => {
    const begin = paste.indexOf('\nBEGIN;\n')
    const commit = paste.indexOf('\nCOMMIT;\n')
    expect(begin).toBeGreaterThan(0)
    expect(commit).toBeGreaterThan(begin)
    expect(paste.slice(begin, commit)).toContain(m098.trim())
    expect(paste.slice(begin, commit)).toContain("VALUES ('098', '098_position_services')")
    expect(paste.slice(paste.indexOf('\nCOMMIT;\n'))).toMatch(/RESULTS[\s\S]*'PASS'/)
  })

  it('the switch is off for everyone and nothing turns it on; every chair stays on the whole gig', () => {
    expect(code(m098)).toMatch(/ADD COLUMN IF NOT EXISTS call_scoped_requirements boolean NOT NULL DEFAULT false;/)
    expect(code(m098)).toMatch(/ADD COLUMN IF NOT EXISTS scope_mode text NOT NULL DEFAULT 'all';/)
    expect(code(m098)).not.toMatch(/SET\s+call_scoped_requirements\s*=\s*true/i)
    expect(code(m098)).not.toMatch(/SET\s+scope_mode\s*=\s*'selected'/i)
    expect(code(m098)).not.toMatch(/INSERT INTO position_services/i)
  })

  it('freezes the switch with 081\'s other columns, keeping every one 081 froze', () => {
    const frozen = (sql: string) => [...code(fn(sql, 'protect_privileged_org_columns')).matchAll(/array_append\(changed, '([a-z_]+)'\)/g)].map((m) => m[1])
    const m081 = read('supabase/migrations/081_protect_privileged_org_columns.sql')
    expect(frozen(m098)).toEqual([...frozen(m081), 'call_scoped_requirements'])
  })

  it('cascade_offer is 096\'s, except that both sides of "booked at the same time" are the chairs\' services', () => {
    const before = fn(m096, 'cascade_offer')
    const after = fn(m098, 'cascade_offer')
    expect(after).toBe(
      before
        .replace('      JOIN services theirs ON theirs.project_id = opp.project_id', '      CROSS JOIN LATERAL services_for_position(opp.id) AS theirs')
        .replace('      JOIN services ours ON ours.project_id = v_pos.project_id', '      CROSS JOIN LATERAL services_for_position(v_pos.id) AS ours')
    )
    expect(after).not.toBe(before)
  })

  it('worker_drop is 096\'s, except that "has it started" is the chair\'s first service', () => {
    const before = fn(m096, 'worker_drop')
    const after = fn(m098, 'worker_drop')
    expect(after).toBe(
      before.replace(
        'IF EXISTS (SELECT 1 FROM services WHERE project_id = v_pos.project_id AND start_time <= now()) THEN',
        'IF EXISTS (SELECT 1 FROM services_for_position(v_pos.id) s WHERE s.start_time <= now()) THEN'
      )
    )
    expect(after).not.toBe(before)
  })

  it("services_for_position is servicesFor in SQL: everything unless 'selected', then only the listed", () => {
    const sql = fn(m098, 'services_for_position')
    expect(sql).toContain("pp.scope_mode IS DISTINCT FROM 'selected'")
    expect(sql).toContain('ps.project_position_id = pp.id AND ps.service_id = s.id')
  })
})
