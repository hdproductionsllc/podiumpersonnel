import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Data-loss prevention audit.
 *
 * Guards against regressions that would let a routine delete destroy financial
 * records or confirmed staffing. Asserts both the DB backstop (ON DELETE
 * RESTRICT) and the in-app archive/usage checks stay in place.
 */

const root = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf-8')

describe('DB backstop: payments are protected from cascade deletion', () => {
  const migration = read('supabase/migrations/062_protect_payment_records.sql')

  it('payments.musician_id is ON DELETE RESTRICT', () => {
    expect(migration).toMatch(
      /payments_musician_id_fkey[\s\S]*musicians\(id\)\s+ON DELETE RESTRICT/i
    )
  })

  it('payments.service_id is ON DELETE RESTRICT', () => {
    expect(migration).toMatch(
      /payments_service_id_fkey[\s\S]*services\(id\)\s+ON DELETE RESTRICT/i
    )
  })

  it('original migration no longer leaves these as CASCADE (review intent)', () => {
    // The new migration must explicitly re-create both constraints.
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS payments_musician_id_fkey')
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS payments_service_id_fkey')
  })
})

describe('UI: musician delete archives when payment history exists', () => {
  const src = read('src/components/musicians/delete-musician-dialog.tsx')
  it('checks payment count before deleting', () => {
    expect(src).toContain("from('payments')")
    expect(src).toContain("eq('musician_id'")
  })
  it('deactivates (is_active=false) instead of deleting when payments exist', () => {
    expect(src).toContain('is_active: false')
    expect(src).toContain('hasPayments')
  })
})

describe('UI: project delete archives when payment history exists', () => {
  const src = read('src/components/projects/delete-project-dialog.tsx')
  it('checks payments across the project services', () => {
    expect(src).toContain("from('payments')")
    expect(src).toContain("in('service_id'")
  })
  it('archives (status=cancelled) instead of deleting when payments exist', () => {
    expect(src).toContain("status: 'cancelled'")
    expect(src).toContain('hasPayments')
  })
})

describe('UI: instrument delete blocks when in use', () => {
  const src = read('src/components/instruments/delete-instrument-dialog.tsx')
  it('checks project_positions and musician_instruments usage', () => {
    expect(src).toContain("from('project_positions')")
    expect(src).toContain("from('musician_instruments')")
    expect(src).toContain('inUse')
  })
  it('hides the destructive delete button while in use', () => {
    expect(src).toContain('{!inUse &&')
  })
})
