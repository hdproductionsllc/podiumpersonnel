/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

/**
 * The shared offer-response logic behind the musician's answer path:
 * /api/gig/[token]/{accept,decline} — driven by a tokenized email link, no login.
 *
 * This lived in two near-duplicate route pairs (emailed link and musician
 * portal) that had drifted: the portal logged the substitution emails, the token
 * path sent them without logging, so a "you've been released" notice usually
 * never reached the contractor's email log. The portal has since been removed;
 * the extraction stays because the seat claim below is the most correctness-
 * critical logic in the app and deserves direct tests.
 *
 * The seat claim is the part worth guarding hardest — it is the only thing
 * stopping two musicians from winning the same chair.
 */

const sendMusicianReleasedEmail = vi.fn()
const sendSubDeclinedFindAnotherEmail = vi.fn()
const logEmail = vi.fn()

vi.mock('@/lib/email/send', () => ({
  sendMusicianReleasedEmail: (...a: any[]) => sendMusicianReleasedEmail(...a),
  sendSubDeclinedFindAnotherEmail: (...a: any[]) => sendSubDeclinedFindAnotherEmail(...a),
}))

vi.mock('@/lib/email/log', () => ({
  logEmail: (...a: any[]) => logEmail(...a),
}))

let respond: typeof import('@/lib/offers/respond')

beforeAll(async () => {
  respond = await import('@/lib/offers/respond')
})

/**
 * Minimal PostgREST-shaped fake. Each `from(table)` call returns a chainable
 * builder; the terminal `.select()` resolves to whatever the scenario queued
 * for that table, and every filter is recorded so tests can assert on the
 * conditions that make the claim atomic.
 */
function makeSupabase(responses: Record<string, any[]>) {
  const calls: any[] = []
  const queued: Record<string, any[]> = {}
  for (const [table, list] of Object.entries(responses)) queued[table] = [...list]

  const client: any = {
    calls,
    from(table: string) {
      const record: any = { table, op: null, filters: [], values: null }
      calls.push(record)

      const builder: any = {
        update(values: any) {
          record.op = 'update'
          record.values = values
          return builder
        },
        eq(col: string, val: any) {
          record.filters.push(['eq', col, val])
          return builder
        },
        is(col: string, val: any) {
          record.filters.push(['is', col, val])
          return builder
        },
        in(col: string, val: any) {
          record.filters.push(['in', col, val])
          return builder
        },
        maybeSingle() {
          const next = queued[table]?.shift() ?? { data: null, error: null }
          return Promise.resolve(next)
        },
        select(_cols?: string, _opts?: any) {
          record.op = record.op ?? 'select'
          record.result = queued[table]?.shift() ?? { data: [], error: null }
          return builder
        },
        // The builder itself is thenable, so a chain resolves wherever it ends:
        // update paths finish on .select('id'), count queries finish on .eq().
        then(onFulfilled: any, onRejected: any) {
          return Promise.resolve(record.result ?? { data: [], error: null }).then(
            onFulfilled,
            onRejected
          )
        },
      }
      return builder
    },
  }
  return client
}

const OFFER = {
  id: 'offer-1',
  project_position_id: 'pos-1',
  musician_id: 'mus-new',
}

/** A client whose rpc() resolves to the given result, recording each call. */
function rpcClient(result: { data: unknown; error: unknown }) {
  const calls: { name: string; args: unknown }[] = []
  return { calls, rpc: async (name: string, args: unknown) => (calls.push({ name, args }), result) } as any
}

describe('claimChairForAccept (the claim_chair database function, migration 094)', () => {
  // What the function itself does (locks, release-before-claim, the losing
  // offer retired, concurrency) is tested against Postgres in
  // db/staffing-rpcs.test.ts; here, only how the server calls it and reads it.

  it('calls claim_chair with the offer id and nothing else', async () => {
    const supabase = rpcClient({ data: 'claimed', error: null })

    const result = await respond.claimChairForAccept(supabase, OFFER)

    expect(result).toEqual({ outcome: 'claimed' })
    expect(supabase.calls).toEqual([{ name: 'claim_chair', args: { p_offer_id: 'offer-1' } }])
  })

  it.each(['already_responded', 'position_filled', 'project_inactive', 'musician_inactive'])(
    'passes the outcome %s through',
    async (outcome) => {
      const result = await respond.claimChairForAccept(rpcClient({ data: outcome, error: null }), OFFER)
      expect(result).toEqual({ outcome })
    }
  )

  it('treats an outcome it does not know as an error, never as a claim', async () => {
    const result = await respond.claimChairForAccept(rpcClient({ data: 'maybe', error: null }), OFFER)
    expect(result.outcome).toBe('error')
  })

  it('surfaces a database error rather than reporting success', async () => {
    const result = await respond.claimChairForAccept(rpcClient({ data: null, error: { message: 'boom' } }), OFFER)
    expect(result.outcome).toBe('error')
  })

  it('refuses (fails closed) and says why when migration 094 is not applied', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await respond.claimChairForAccept(
      rpcClient({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.claim_chair' } }),
      OFFER
    )
    expect(result.outcome).toBe('error')
    expect(String(error.mock.calls[0][0])).toMatch(/migration 094/)
    error.mockRestore()
  })
})

describe('markOfferDeclined', () => {
  it('declines under the same optimistic lock as accept', async () => {
    const supabase = makeSupabase({
      contract_offers: [{ data: [{ id: 'offer-1' }], error: null }],
    })

    const result = await respond.markOfferDeclined(supabase, OFFER)

    expect(result).toBe('declined')
    const update = supabase.calls.find((c: any) => c.table === 'contract_offers')
    expect(update.filters).toContainEqual(['in', 'status', ['pending', 'viewed']])
  })

  it('reports already_responded so a stale decline cannot undo an accept', async () => {
    const supabase = makeSupabase({ contract_offers: [{ data: [], error: null }] })

    expect(await respond.markOfferDeclined(supabase, OFFER)).toBe('already_responded')
  })

  it('records the decline reason when the UI collected one', async () => {
    const supabase = makeSupabase({
      contract_offers: [{ data: [{ id: 'offer-1' }], error: null }],
    })

    await respond.markOfferDeclined(supabase, OFFER, 'Double booked that night')

    const update = supabase.calls.find((c: any) => c.table === 'contract_offers')
    expect(update.values.response_notes).toBe('Double booked that night')
  })

  it('leaves existing notes alone when no reason was collected', async () => {
    // The emailed link has no notes field. Passing undefined must not blank a
    // reason the musician gave earlier.
    const supabase = makeSupabase({
      contract_offers: [{ data: [{ id: 'offer-1' }], error: null }],
    })

    await respond.markOfferDeclined(supabase, OFFER)

    const update = supabase.calls.find((c: any) => c.table === 'contract_offers')
    expect('response_notes' in update.values).toBe(false)
  })
})

describe('substitution notifications are logged, not just sent', () => {
  const ctx = {
    offer: { id: 'offer-1', project_position_id: 'pos-1' },
    subRequest: {
      requesting_musician_id: 'mus-original',
      suggested_sub_name: 'Alex Sub',
      requesting_musician: {
        id: 'mus-original',
        first_name: 'Sarah',
        last_name: 'Cellist',
        email: 'sarah@example.com',
      },
      service: { name: 'Dress Rehearsal' },
    },
    musician: { first_name: 'Alex', last_name: 'Sub' },
    position: { chair_number: 2 },
    project: { id: 'proj-1', name: 'Spring Gala', organization_id: 'org-1' },
    organization: { id: 'org-1', name: 'Podium Strings' },
    instrument: { id: 'inst-1', name: 'Cello' },
    performanceDate: 'Saturday, May 3',
  }

  beforeEach(() => {
    sendMusicianReleasedEmail.mockReset()
    sendSubDeclinedFindAnotherEmail.mockReset()
    logEmail.mockReset()
  })

  it('logs musician_released after sending it', async () => {
    // The exact gap on the token path: sent, never recorded.
    sendMusicianReleasedEmail.mockResolvedValue({
      id: 'resend-1',
      subject: "You've been released",
      emailHtml: '<p>hi</p>',
    })
    const supabase = makeSupabase({ project_positions: [{ count: 4 }] })

    await respond.notifyMusicianReleased(supabase, ctx as any)

    expect(sendMusicianReleasedEmail).toHaveBeenCalledOnce()
    expect(logEmail).toHaveBeenCalledOnce()
    expect(logEmail.mock.calls[0][0]).toMatchObject({
      organizationId: 'org-1',
      recipientEmail: 'sarah@example.com',
      emailType: 'musician_released',
      offerId: 'offer-1',
    })
  })

  it('logs sub_declined after sending it', async () => {
    sendSubDeclinedFindAnotherEmail.mockResolvedValue({
      id: 'resend-2',
      subject: 'Your sub declined',
      emailHtml: '<p>hi</p>',
    })
    const supabase = makeSupabase({
      project_positions: [{ count: 4 }],
      contract_offers: [{ data: { token: 'tok-original' }, error: null }],
    })

    await respond.notifySubDeclined(supabase, ctx as any)

    expect(sendSubDeclinedFindAnotherEmail).toHaveBeenCalledOnce()
    expect(logEmail.mock.calls[0][0]).toMatchObject({ emailType: 'sub_declined' })
  })

  it('does not log when the send failed', async () => {
    // A failed send must not leave a record claiming the musician was told.
    sendMusicianReleasedEmail.mockRejectedValue(new Error('resend down'))
    const supabase = makeSupabase({ project_positions: [{ count: 4 }] })

    await respond.notifyMusicianReleased(supabase, ctx as any)

    expect(logEmail).not.toHaveBeenCalled()
  })

  it('never throws when email delivery fails', async () => {
    // The seat is already claimed by this point; an email outage must not turn
    // a successful accept into an error for the musician.
    sendMusicianReleasedEmail.mockRejectedValue(new Error('resend down'))
    const supabase = makeSupabase({ project_positions: [{ count: 4 }] })

    await expect(respond.notifyMusicianReleased(supabase, ctx as any)).resolves.toBeUndefined()
  })

  it('skips silently when the original musician has no email', async () => {
    const supabase = makeSupabase({ project_positions: [{ count: 4 }] })
    const noEmail = {
      ...ctx,
      subRequest: { ...ctx.subRequest, requesting_musician: { id: 'x', first_name: 'A', last_name: 'B' } },
    }

    await respond.notifyMusicianReleased(supabase, noEmail as any)

    expect(sendMusicianReleasedEmail).not.toHaveBeenCalled()
    expect(logEmail).not.toHaveBeenCalled()
  })
})

describe('countChairs', () => {
  it('returns the chair count for the instrument', async () => {
    const supabase = makeSupabase({ project_positions: [{ count: 4 }] })

    expect(await respond.countChairs(supabase, 'proj-1', 'inst-1')).toBe(4)
  })

  it('falls back to 1 when ids are missing', async () => {
    const supabase = makeSupabase({})

    expect(await respond.countChairs(supabase, undefined, 'inst-1')).toBe(1)
    expect(await respond.countChairs(supabase, 'proj-1', undefined)).toBe(1)
  })
})

describe('the answer path uses the shared logic', () => {
  const { readFileSync } = require('fs')
  const { resolve } = require('path')
  const root = resolve(__dirname, '../../..')

  const acceptRoutes = [
    'src/app/api/gig/[token]/accept/route.ts',
  ]
  const declineRoutes = [
    'src/app/api/gig/[token]/decline/route.ts',
  ]

  it.each(acceptRoutes)('%s claims the chair via the shared helper', (route) => {
    const src = readFileSync(resolve(root, route), 'utf-8')
    expect(src).toContain('claimChairForAccept')
    // A hand-rolled copy of the seat claim is what drifted before.
    expect(src).not.toContain(".is('musician_id', null)")
  })

  it.each(acceptRoutes)('%s notifies the released musician via the shared helper', (route) => {
    const src = readFileSync(resolve(root, route), 'utf-8')
    expect(src).toContain('notifyMusicianReleased')
    expect(src).not.toContain('sendMusicianReleasedEmail')
  })

  it.each(declineRoutes)('%s declines via the shared helper', (route) => {
    const src = readFileSync(resolve(root, route), 'utf-8')
    expect(src).toContain('markOfferDeclined')
  })

  it.each(declineRoutes)('%s notifies the sub-declined musician via the shared helper', (route) => {
    const src = readFileSync(resolve(root, route), 'utf-8')
    expect(src).toContain('notifySubDeclined')
    expect(src).not.toContain('sendSubDeclinedFindAnotherEmail')
  })
})
