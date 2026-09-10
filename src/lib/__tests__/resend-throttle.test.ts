import { describe, it, expect, beforeEach, beforeAll, vi, afterEach } from 'vitest'

// client.ts constructs the Resend SDK at import time, which throws without a key.
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test_key'
type Client = typeof import('../email/client')
let awaitResendSlot: Client['awaitResendSlot']
let RESEND_MIN_INTERVAL_MS: Client['RESEND_MIN_INTERVAL_MS']
let _resetResendSlotForTests: Client['_resetResendSlotForTests']
beforeAll(async () => {
  ;({ awaitResendSlot, RESEND_MIN_INTERVAL_MS, _resetResendSlotForTests } = await import('../email/client'))
})

/**
 * Resend allows 2 requests/second. The pacing used to be a 600ms sleep copied
 * into every send loop (ten copies). It now lives in one place — every send in
 * send.ts calls awaitResendSlot() first — so these tests pin the behaviour
 * that the copies used to provide by hand.
 */
describe('awaitResendSlot', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _resetResendSlotForTests()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('never delays the first send', async () => {
    const now = () => 10_000
    let resolved = false
    awaitResendSlot(now).then(() => { resolved = true })
    await vi.advanceTimersByTimeAsync(0)
    expect(resolved).toBe(true)
  })

  it('spaces back-to-back sends by the minimum interval', async () => {
    let clock = 10_000
    const now = () => clock

    await awaitResendSlot(now) // first: immediate, reserves 10_000

    let resolved = false
    awaitResendSlot(now).then(() => { resolved = true })
    await vi.advanceTimersByTimeAsync(RESEND_MIN_INTERVAL_MS - 1)
    expect(resolved, 'must still be waiting just under the interval').toBe(false)
    clock += RESEND_MIN_INTERVAL_MS
    await vi.advanceTimersByTimeAsync(1)
    expect(resolved).toBe(true)
  })

  it('reserves distinct slots for concurrent callers, not one shared sleep', async () => {
    const clock = 10_000
    const now = () => clock
    const done: number[] = []
    const a = awaitResendSlot(now).then(() => done.push(1))
    const b = awaitResendSlot(now).then(() => done.push(2))
    const c = awaitResendSlot(now).then(() => done.push(3))

    await vi.advanceTimersByTimeAsync(0)
    expect(done).toEqual([1])
    await vi.advanceTimersByTimeAsync(RESEND_MIN_INTERVAL_MS)
    expect(done).toEqual([1, 2])
    await vi.advanceTimersByTimeAsync(RESEND_MIN_INTERVAL_MS)
    expect(done).toEqual([1, 2, 3])
    await Promise.all([a, b, c])
  })

  it('does not wait when enough real time has already passed', async () => {
    let clock = 10_000
    const now = () => clock
    await awaitResendSlot(now)
    clock += 5_000
    let resolved = false
    awaitResendSlot(now).then(() => { resolved = true })
    await vi.advanceTimersByTimeAsync(0)
    expect(resolved).toBe(true)
  })
})

describe('the throttle lives in exactly one place', () => {
  it('both send sites in send.ts reserve a slot, and no route sleeps on its own', async () => {
    const { readFileSync, readdirSync, statSync } = await import('fs')
    const { resolve, join } = await import('path')
    const root = resolve(__dirname, '../..')
    const send = readFileSync(resolve(root, 'lib/email/send.ts'), 'utf-8')
    expect(send.split('await awaitResendSlot()').length - 1).toBe(2)

    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(name) && !p.includes('__tests__') && !p.endsWith('client.ts')) {
          if (/setTimeout\([^)]*,\s*600\)/.test(readFileSync(p, 'utf-8'))) offenders.push(p)
        }
      }
    }
    walk(root)
    expect(offenders, 'per-loop Resend sleeps belong in awaitResendSlot, not here').toEqual([])
  })
})
