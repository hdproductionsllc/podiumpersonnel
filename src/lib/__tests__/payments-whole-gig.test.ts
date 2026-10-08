import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { MockSupabaseDb, type Row } from './helpers/supabase-mock'
import { computeGigPay } from '@/lib/payments/compute'

/**
 * The Pay amount on an offer is the fee for the WHOLE gig (David, 2026-10-01).
 *
 * It used to be applied to every service: a $300 offer on a gig with a
 * rehearsal and a performance generated two $300 payments while the musician
 * had been shown "$300". Service rates (base_pay, leader_fee) are still set per
 * service and still owed per service when the offer carries no amount.
 */

const state = vi.hoisted(() => ({ db: undefined as unknown as MockSupabaseDb }))

vi.mock('@/lib/api-helpers', () => ({
  requireOrgAdmin: async () => ({
    supabase: state.db,
    membership: { organization_id: 'org-1' },
    error: null,
  }),
  apiSuccess: (data: unknown, status = 200) => NextResponse.json(data, { status }),
  apiError: (message: string, status = 400) => NextResponse.json({ error: message }, { status }),
}))

import { POST as generatePOST } from '@/app/api/payments/generate/route'

const REHEARSAL = { id: 'svc-reh', name: 'Rehearsal', start_time: '2026-11-06T23:00:00Z', base_pay: 100, leader_fee: 50 }
const SHOW = { id: 'svc-show', name: 'Performance', start_time: '2026-11-07T23:00:00Z', base_pay: 250, leader_fee: 50 }

describe('computeGigPay', () => {
  it('an offer amount is owed once, on the first service, whatever the input order', () => {
    const lines = computeGigPay([SHOW, REHEARSAL], false, 300)
    expect(lines).toEqual([
      { serviceId: 'svc-reh', basePay: 300, leaderFee: 0, total: 300, isLeader: false, wholeGig: true },
    ])
  })

  it('an offer amount already includes any leader fee', () => {
    const [line] = computeGigPay([REHEARSAL, SHOW], true, 400)
    expect(line.total).toBe(400)
    expect(line.leaderFee).toBe(0)
  })

  it('without an offer amount each service pays its own rate', () => {
    const lines = computeGigPay([REHEARSAL, SHOW], false, null)
    expect(lines.map((l) => [l.serviceId, l.total])).toEqual([['svc-reh', 100], ['svc-show', 250]])
    expect(lines.every((l) => !l.wholeGig)).toBe(true)
  })

  it('a leader on service rates gets each service leader fee', () => {
    const lines = computeGigPay([REHEARSAL, SHOW], true, null)
    expect(lines.map((l) => l.total)).toEqual([150, 300])
  })

  it('a gig with no services owes nothing', () => {
    expect(computeGigPay([], false, 300)).toEqual([])
    expect(computeGigPay(null, false, 300)).toEqual([])
  })
})

function confirmedChair(over: Partial<Row> = {}): Row {
  return {
    id: 'pos-1',
    project_id: 'proj-1',
    musician_id: 'mus-1',
    status: 'confirmed',
    projects: { id: 'proj-1', name: 'Jones Wedding', organization_id: 'org-1', services: [SHOW, REHEARSAL] },
    musician: { id: 'mus-1', is_leader: false },
    // Offers always say who they went to; the pay rule reads the chair holder's.
    contract_offers: [{ musician_id: 'mus-1', custom_pay: 300, status: 'accepted' }],
    ...over,
  }
}

async function generate() {
  const res = await generatePOST(
    new Request('http://localhost/api/payments/generate', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'proj-1' }),
    })
  )
  return res.json()
}

describe('Generate Payments', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('writes ONE payment for an offer amount on a two-service gig', async () => {
    state.db = new MockSupabaseDb({ project_positions: [confirmedChair()], payments: [] })

    const body = await generate()

    expect(body.created).toBe(1)
    const payments = state.db.tables.payments
    expect(payments).toHaveLength(1)
    expect(payments[0]).toMatchObject({ service_id: 'svc-reh', musician_id: 'mus-1', amount: 300 })
    // The bookkeeping flag never reaches the database.
    expect(payments[0]).not.toHaveProperty('wholeGig')
  })

  it('never pays a whole-gig amount twice, even after an earlier service is added', async () => {
    state.db = new MockSupabaseDb({ project_positions: [confirmedChair()], payments: [] })
    await generate()

    // A soundcheck is added before the rehearsal: "first service" moves.
    const soundcheck = { id: 'svc-sound', name: 'Soundcheck', start_time: '2026-11-06T20:00:00Z', base_pay: 0, leader_fee: null }
    state.db.tables.project_positions[0].projects.services.push(soundcheck)

    const body = await generate()

    expect(body.created).toBe(0)
    expect(state.db.tables.payments).toHaveLength(1)
  })

  it('still writes one payment per service when the offer has no amount', async () => {
    state.db = new MockSupabaseDb({
      project_positions: [confirmedChair({ contract_offers: [{ musician_id: 'mus-1', custom_pay: null, status: 'accepted' }] })],
      payments: [],
    })

    await generate()

    const amounts = state.db.tables.payments.map((p: Row) => [p.service_id, p.amount])
    expect(amounts.sort()).toEqual([['svc-reh', 100], ['svc-show', 250]])
  })

  it('refuses to generate when it cannot see the existing payments', async () => {
    state.db = new MockSupabaseDb({ project_positions: [confirmedChair()], payments: [] })
    const realFrom = state.db.from.bind(state.db)
    ;(state.db as unknown as { from: (table: string) => unknown }).from = (table: string) => {
      if (table === 'payments') {
        return { select: () => ({ eq: async () => ({ data: null, error: { message: 'timeout' } }) }) }
      }
      return realFrom(table)
    }

    const res = await generatePOST(
      new Request('http://localhost/api/payments/generate', { method: 'POST', body: JSON.stringify({ projectId: 'proj-1' }) })
    )

    expect(res.status).toBe(500)
  })
})

/**
 * The "Leader Fee" label on a payment (David, 2026-10-02). It used to follow
 * musicians.is_leader, which only says someone CAN lead, so a violist's and a
 * second violinist's pay were exported as "Leader Fee".
 */
describe('Generate Payments: the Leader Fee label', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  const JONES = (gigLead: string | null = null) => ({
    id: 'proj-1', name: 'Jones Wedding', organization_id: 'org-1', gig_lead_musician_id: gigLead, services: [SHOW, REHEARSAL],
  })

  function seat(id: string, instrument: string, chair: number, musicianId: string, over: Partial<Row> = {}): Row {
    return confirmedChair({
      id,
      musician_id: musicianId,
      chair_number: chair,
      instrument: { name: instrument },
      projects: JONES(),
      musician: { id: musicianId, first_name: musicianId, last_name: 'X', email: null, is_leader: false },
      contract_offers: [{ musician_id: musicianId, custom_pay: 300, status: 'accepted' }],
      ...over,
    })
  }

  const labelOf = (musicianId: string) =>
    state.db.tables.payments.find((p: Row) => p.musician_id === musicianId)?.is_leader_fee

  it('an older offer: only the gig lead (Violin 1, chair 1) is labelled, not whoever is flagged able to lead', async () => {
    state.db = new MockSupabaseDb({
      project_positions: [
        seat('pos-v1', 'Violin 1', 1, 'mus-v1'),
        seat('pos-va', 'Viola', 1, 'mus-va', { musician: { id: 'mus-va', first_name: 'V', last_name: 'A', email: null, is_leader: true } }),
      ],
      payments: [],
    })

    await generate()

    expect(labelOf('mus-v1')).toBe(true)
    expect(labelOf('mus-va')).toBe(false)
  })

  it('an older offer: the lead the admin picked for the gig is the one labelled', async () => {
    state.db = new MockSupabaseDb({
      project_positions: [
        seat('pos-v1', 'Violin 1', 1, 'mus-v1', { projects: JONES('mus-vc') }),
        seat('pos-vc', 'Cello', 1, 'mus-vc', { projects: JONES('mus-vc') }),
      ],
      payments: [],
    })

    await generate()

    expect(labelOf('mus-vc')).toBe(true)
    expect(labelOf('mus-v1')).toBe(false)
  })

  it('a new offer: the leader-fee checkbox the admin used is the answer', async () => {
    const withChoice = (musicianId: string, include: boolean) => [{ musician_id: musicianId, custom_pay: 300, status: 'accepted', terms_snapshot: { pay: { include_leader_fee: include } } }]
    state.db = new MockSupabaseDb({
      project_positions: [
        seat('pos-v1', 'Violin 1', 1, 'mus-v1', { contract_offers: withChoice('mus-v1', false) }),
        seat('pos-v2', 'Violin 2', 1, 'mus-v2', { contract_offers: withChoice('mus-v2', true) }),
      ],
      payments: [],
    })

    await generate()

    expect(labelOf('mus-v1')).toBe(false)
    expect(labelOf('mus-v2')).toBe(true)
  })

  it('the amounts do not change, only the label', async () => {
    state.db = new MockSupabaseDb({
      project_positions: [seat('pos-va', 'Viola', 1, 'mus-va', { musician: { id: 'mus-va', first_name: 'V', last_name: 'A', email: null, is_leader: true } })],
      payments: [],
    })

    await generate()

    expect(state.db.tables.payments).toHaveLength(1)
    expect(state.db.tables.payments[0]).toMatchObject({ amount: 300, is_leader_fee: false })
  })
})
