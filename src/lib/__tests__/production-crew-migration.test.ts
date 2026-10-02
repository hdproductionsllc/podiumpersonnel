import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { VERTICAL_KEYS } from '@/lib/verticals'
import { MUSIC_VERTICALS, defaultAllowWorkerDrop } from '@/lib/staffing/settings'

/**
 * Migration 100 and its paste script, read as text (the database itself is
 * tested in db/production-crew-vertical.test.ts). What a reviewer would check
 * by eye: the paste script is the migration verbatim; the database allows
 * exactly the verticals the app registers; nothing changes an existing row;
 * the only new default is for production_crew; and the frozen columns are
 * 098's plus `vertical`.
 */

const read = (rel: string) => readFileSync(resolve(__dirname, '../../..', rel), 'utf-8').replace(/\r\n/g, '\n')
const m098 = read('supabase/migrations/098_position_services.sql')
const m100 = read('supabase/migrations/100_production_crew_vertical.sql')
const paste = read('scripts/sql/100-production-crew-vertical.paste.sql')
const code = (sql: string) => sql.replace(/--.*$/gm, '')

function fnBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`)
  expect(start, `${name} is defined`).toBeGreaterThanOrEqual(0)
  return code(sql.slice(start, sql.indexOf('\n$$;', start) + 4))
}

describe('migration 100 and its paste script', () => {
  it('the paste script carries the migration verbatim, inside one transaction, and records 100', () => {
    const begin = paste.indexOf('\nBEGIN;\n')
    const commit = paste.indexOf('\nCOMMIT;\n')
    expect(begin).toBeGreaterThan(0)
    expect(commit).toBeGreaterThan(begin)
    expect(paste.slice(begin, commit)).toContain(m100.trim())
    expect(paste.slice(begin, commit)).toContain("VALUES ('100', '100_production_crew_vertical')")
    expect(paste.slice(commit)).toMatch(/RESULTS[\s\S]*'PASS'/)
  })

  it('the CHECK allows exactly the verticals the app registers', () => {
    const check = code(m100).match(/CHECK \(vertical IN \(([^)]*)\)\)/)
    expect(check).not.toBeNull()
    const allowed = [...check![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(allowed.sort()).toEqual([...VERTICAL_KEYS].sort())
  })

  it('changes no existing row: no UPDATE, no DELETE, no backfill', () => {
    expect(code(m100)).not.toMatch(/\bUPDATE\s+organizations\b/i)
    expect(code(m100)).not.toMatch(/\bDELETE\b/i)
    expect(code(m100)).not.toMatch(/ALTER COLUMN/i)
  })

  it('the only new default is "only some calls" on for a production_crew insert', () => {
    const body = fnBody(m100, 'set_call_scoped_requirements_default')
    expect(body).toMatch(/IF NEW\.vertical = 'production_crew' THEN\s+NEW\.call_scoped_requirements := true;\s+END IF;/)
    expect(body.match(/NEW\.\w+ :=/g)).toEqual(['NEW.call_scoped_requirements :='])
    expect(code(m100)).toMatch(/BEFORE INSERT ON organizations/)
    expect(code(m100)).not.toMatch(/auto_cascade/)
  })

  it('a crew organization already gets "I can\'t make it" from 096 (the code mirrors the same rule)', () => {
    expect(MUSIC_VERTICALS).not.toContain('production_crew')
    expect(defaultAllowWorkerDrop('production_crew')).toBe(true)
  })

  it('freezes `vertical` alongside every column 098 froze, and nothing else changes in the function', () => {
    const frozen = (sql: string) => [...fnBody(sql, 'protect_privileged_org_columns').matchAll(/array_append\(changed, '([a-z_]+)'\)/g)].map((m) => m[1])
    expect(frozen(m100)).toEqual([...frozen(m098), 'vertical'])
    const squeeze = (s: string) => s.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() !== '').join('\n')
    const before = squeeze(fnBody(m098, 'protect_privileged_org_columns'))
    const after = squeeze(fnBody(m100, 'protect_privileged_org_columns'))
    const vertLine = after.split('\n').find((l) => l.includes("'vertical'"))!
    expect(after.replace(vertLine + '\n', '')).toBe(before)
  })
})
