import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'

// @/lib/cron re-exports notifyOps, which pulls in the Resend client — and that
// constructor throws on an empty key at module load. Seed a dummy key and
// import dynamically, matching cron-auth.test.ts.
let withCronRetry: typeof import('@/lib/cron')['withCronRetry']
let isTransientSupabaseFailure: typeof import('@/lib/cron')['isTransientSupabaseFailure']
let describeError: typeof import('@/lib/cron')['describeError']

beforeAll(async () => {
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test_dummy'
  ;({ withCronRetry, isTransientSupabaseFailure, describeError } = await import('@/lib/cron'))
})

/**
 * withCronRetry: Supabase's API gateway occasionally answers the opening call
 * of a cron job with an instant 5xx (never reaching PostgREST), or the fetch
 * itself never completes (status 0). Both are transient — retrying a moment
 * later succeeds. A real PostgREST error (bad column, RLS, PGRST116) comes
 * back with a 4xx status and must never be retried.
 */
describe('withCronRetry', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    warnSpy.mockRestore()
  })

  it('retries once on a 504 Gateway Timeout, then returns the success result', async () => {
    let calls = 0
    const make = vi.fn(async () => {
      calls++
      if (calls === 1) {
        return { data: null, error: { message: 'Gateway Timeout' }, status: 504 }
      }
      return { data: [{ id: 1 }], error: null, status: 200 }
    })

    const promise = withCronRetry('expire-offers: fetch', make)
    await vi.advanceTimersByTimeAsync(1000)
    const result = await promise

    expect(result).toEqual({ data: [{ id: 1 }], error: null, status: 200 })
    expect(make).toHaveBeenCalledTimes(2)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain(
      '[cron retry] expire-offers: fetch: attempt 1 failed (504 Gateway Timeout), retrying in 1000ms',
    )
  })

  it('retries a network failure (status 0), then returns the success result', async () => {
    let calls = 0
    const make = vi.fn(async () => {
      calls++
      if (calls === 1) {
        return { data: null, error: { message: 'TypeError: fetch failed' }, status: 0 }
      }
      return { data: [], error: null, status: 200 }
    })

    const promise = withCronRetry('keepalive: ping', make)
    await vi.advanceTimersByTimeAsync(1000)
    const result = await promise

    expect(result.error).toBeNull()
    expect(make).toHaveBeenCalledTimes(2)
  })

  it('does not retry a real PostgREST error (400, code PGRST116)', async () => {
    const failure = {
      data: null,
      error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
      status: 406,
    }
    const make = vi.fn(async () => failure)

    const result = await withCronRetry('song-planner-reminders: fetch', make)

    expect(result).toBe(failure)
    expect(make).toHaveBeenCalledTimes(1)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('gives up after 5 attempts and returns the last failed result without throwing', async () => {
    const make = vi.fn(async () => ({
      data: null,
      error: { message: 'Gateway Timeout' },
      status: 504,
    }))

    const promise = withCronRetry('staffing-alerts: fetch', make)
    // 1s, 2s, 4s, 8s between the five attempts.
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 8000)
    const result = await promise

    expect(make).toHaveBeenCalledTimes(5)
    expect(result.error).toEqual({ message: 'Gateway Timeout' })
    expect(warnSpy).toHaveBeenCalledTimes(4)
  })

  /**
   * The 2026-09-14 outage outlived a 22s retry window, so the sizing of the
   * backoff is a fact about production, not a style choice — pin it.
   */
  it('backs off 1s, 2s, 4s, 8s so a blip lasting ~30s is still survivable', async () => {
    const waits: number[] = []
    const make = vi.fn(async () => ({
      data: null,
      error: { message: 'Gateway Timeout' },
      status: 504,
    }))

    await withCronRetry('expire-offers: fetch', make, {
      sleep: async (ms) => {
        waits.push(ms)
      },
    })

    expect(waits).toEqual([1000, 2000, 4000, 8000])
  })

  it('stops early the moment an attempt succeeds', async () => {
    let calls = 0
    const make = vi.fn(async () => {
      calls++
      if (calls < 3) return { data: null, error: { message: 'Gateway Timeout' }, status: 504 }
      return { data: [{ id: 7 }], error: null, status: 200 }
    })

    const result = await withCronRetry('expire-offers: fetch', make, {
      sleep: async () => {},
    })

    expect(make).toHaveBeenCalledTimes(3)
    expect(result.data).toEqual([{ id: 7 }])
  })
})

describe('isTransientSupabaseFailure', () => {
  it('is true for a 5xx gateway error', () => {
    expect(isTransientSupabaseFailure({ error: { message: 'Gateway Timeout' }, status: 504 })).toBe(true)
    expect(isTransientSupabaseFailure({ error: { message: 'Bad Gateway' }, status: 502 })).toBe(true)
  })

  it('is true for a status-0 network failure', () => {
    expect(isTransientSupabaseFailure({ error: { message: 'TypeError: fetch failed' }, status: 0 })).toBe(true)
  })

  it('is false for a 4xx PostgREST error', () => {
    expect(isTransientSupabaseFailure({ error: { message: 'bad column', code: '42703' }, status: 400 })).toBe(false)
  })

  it('is false when there is no error', () => {
    expect(isTransientSupabaseFailure({ error: null, status: 200 })).toBe(false)
  })
})

describe('describeError', () => {
  it('renders a plain-object Supabase error without [object Object]', () => {
    const out = describeError({ message: 'Gateway Timeout' })
    expect(out).toContain('Gateway Timeout')
    expect(out).not.toContain('[object Object]')
  })

  it('includes code, details, and hint when present', () => {
    const out = describeError({
      message: 'permission denied for table musicians',
      code: '42501',
      details: 'RLS policy violation',
      hint: 'Check the service role key',
    })
    expect(out).toContain('code: 42501')
    expect(out).toContain('details: RLS policy violation')
    expect(out).toContain('hint: Check the service role key')
  })

  it('renders an Error instance as message + stack', () => {
    const err = new Error('boom')
    const out = describeError(err)
    expect(out).toContain('boom')
    expect(out).toContain(err.stack ?? '')
  })
})
