import { describe, it, expect } from 'vitest'
import { describeError } from '@/lib/cron'

/**
 * Four "[Podium cron] expire-offers failed" alerts arrived saying nothing but
 * "[object Object]".
 *
 * notifyOps rendered the failure with
 *   error instanceof Error ? error.message : String(error)
 * which is only useful for an Error. The failures these jobs actually hit come
 * from Supabase, and a PostgREST failure is a plain object —
 * { message, details, hint, code } — so String() produced "[object Object]" and
 * the alert named a job but never a cause. The job was reporting faithfully; the
 * report was unreadable.
 */

describe('cron alerts render the cause, not [object Object]', () => {
  it('names the fields of a PostgREST failure', () => {
    const supabaseError = {
      message: 'canceling statement due to statement timeout',
      details: null,
      hint: null,
      code: '57014',
    }

    const detail = describeError(supabaseError)

    expect(detail).not.toContain('[object Object]')
    expect(detail).toContain('canceling statement due to statement timeout')
    expect(detail).toContain('57014')
  })

  it('skips fields the error left empty', () => {
    const detail = describeError({ message: 'boom', details: null, hint: '', code: 'PGRST200' })

    expect(detail).toContain('message: boom')
    expect(detail).toContain('code: PGRST200')
    expect(detail).not.toContain('details:')
    expect(detail).not.toContain('hint:')
  })

  it('keeps message and stack for a real Error', () => {
    const detail = describeError(new Error('exploded'))

    expect(detail).toContain('exploded')
    expect(detail).toMatch(/cron-describe-error|at /)
  })

  it('falls back to JSON for an object with no PostgREST fields', () => {
    const detail = describeError({ status: 503, body: 'upstream gone' })

    expect(detail).not.toContain('[object Object]')
    expect(detail).toContain('503')
    expect(detail).toContain('upstream gone')
  })

  it('survives a circular object rather than throwing inside the alert', () => {
    const circular: Record<string, unknown> = { status: 500 }
    circular.self = circular

    // A throw here would lose the failure entirely — the alert must still send.
    expect(() => describeError(circular)).not.toThrow()
  })

  it('still handles primitives and null', () => {
    expect(describeError('plain string')).toBe('plain string')
    expect(describeError(null)).toBe('null')
    expect(describeError(undefined)).toBe('undefined')
  })
})
