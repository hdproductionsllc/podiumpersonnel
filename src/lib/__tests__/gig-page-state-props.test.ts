import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { ReactElement } from 'react'
import { buildQuartet, QUARTET_RANKING as R, type QuartetFixture } from './helpers/quartet-fixture'
import type { Row } from './helpers/supabase-mock'

/**
 * The gig page's server half (src/app/gig/[token]/page.tsx) hands the client
 * what describeGigOffer needs: the offer's real status (no longer rewritten
 * to 'rescinded' for a closed gig), the gig's status, whether the musician is
 * active, whether someone else holds the chair, and the vertical's words.
 * gig-offer-state.test.ts covers the sentences; this covers the inputs.
 */

const state = vi.hoisted(() => ({ q: undefined as unknown as QuartetFixture }))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => state.q.db,
  createClient: async () => ({
    from: (table: string) => state.q.db.from(table),
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}))

vi.mock('@/lib/api-helpers', () => ({
  getOrgPlan: vi.fn(async () => null),
  getOrgVertical: vi.fn(async () => ({
    terms: {
      person: { singular: 'Musician', plural: 'Musicians' },
      work: { singular: 'Project', plural: 'Projects' },
      rank: { singular: 'Chair', plural: 'Chairs' },
    },
  })),
}))

// Opening the page never emails anyone; the modules are replaced so nothing could.
vi.mock('@/lib/email/send', () => ({}))
vi.mock('@/lib/email/log', () => ({ hasRecentFailure: async () => false, logEmail: vi.fn() }))
vi.mock('@/lib/email/client', () => ({ logEmailConfig: vi.fn() }))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/components/gig/gig-page-client', () => ({ GigPageClient: () => null }))

import GigPage from '@/app/gig/[token]/page'

const q = () => state.q

async function propsFor(row: Row): Promise<Record<string, unknown>> {
  q().hydrate()
  const el = (await GigPage({ params: Promise.resolve({ token: row.token as string }) })) as ReactElement<Record<string, unknown>>
  return el.props
}

beforeEach(() => {
  state.q = buildQuartet()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('gig page inputs to the state sentence', () => {
  it('passes the vertical\'s lowercase words for the gig and the chair', async () => {
    const props = await propsFor(q().sendOffer('v1', R.v1[0]))
    expect(props).toMatchObject({ workTerm: 'project', rankTerm: 'chair', projectStatus: 'active', musicianActive: true })
  })

  it('passes the real status of an offer on a cancelled gig, with the gig status', async () => {
    const row = q().sendOffer('v1', R.v1[0])
    q().db.row('projects', 'proj-wedding')!.status = 'cancelled'
    const props = await propsFor(row)
    expect(props.offerStatus).toBe('pending')
    expect(props.projectStatus).toBe('cancelled')
  })

  it('says the chair is held by someone else when another musician has it', async () => {
    const row = q().sendOffer('v1', R.v1[0])
    q().db.row('contract_offers', row.id as string)!.status = 'expired'
    Object.assign(q().db.row('project_positions', 'pos-v1')!, { musician_id: R.v1[1], status: 'confirmed' })
    const props = await propsFor(row)
    expect(props.chairHeldByOther).toBe(true)
  })

  it('not when the chair is empty, or held by this musician', async () => {
    const row = q().sendOffer('v1', R.v1[0])
    expect((await propsFor(row)).chairHeldByOther).toBe(false)

    q().db.row('contract_offers', row.id as string)!.status = 'accepted'
    Object.assign(q().db.row('project_positions', 'pos-v1')!, { musician_id: R.v1[0], status: 'confirmed' })
    expect((await propsFor(row)).chairHeldByOther).toBe(false)
  })

  it("not for a substitute's offer, made on a chair the person they replace still holds", async () => {
    const row = q().sendOffer('v1', R.v1[0])
    Object.assign(q().db.row('contract_offers', row.id as string)!, { is_substitution: true, status: 'expired' })
    Object.assign(q().db.row('project_positions', 'pos-v1')!, { musician_id: R.v1[1], status: 'confirmed' })
    expect((await propsFor(row)).chairHeldByOther).toBe(false)
  })

  it('passes a deactivated musician as inactive', async () => {
    const row = q().sendOffer('v1', R.v1[0])
    q().db.row('musicians', R.v1[0])!.is_active = false
    expect((await propsFor(row)).musicianActive).toBe(false)
  })
})
