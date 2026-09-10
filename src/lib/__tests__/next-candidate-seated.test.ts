import { describe, it, expect, vi } from 'vitest'

/**
 * BEHAVIORAL tests for getNextCandidates() (src/lib/next-candidate.ts).
 *
 * The waterfall suggested Rebecca for a second violin chair on the Kurtz gig
 * while she was already confirmed on violin 1.
 *
 * The exclusion list was built purely from contract_offers, but a chair can be
 * filled without any offer ever existing — a direct assignment, or an import
 * from a saved book, writes project_positions.musician_id and nothing else. So
 * a musician seated that way stayed "available" and got suggested for a chair
 * on a gig they were already playing.
 *
 * The chair is the authority on who is on the gig, so these tests pin the
 * exclusion to project_positions.musician_id, and keep the offer-based
 * exclusions that were already right.
 *
 * Seam: getNextCandidates takes its supabase client as an argument, so the
 * client is a fake here rather than a module mock. Service-area and conflict
 * lookups are mocked out; neither is under test.
 */

vi.mock('@/lib/zip-distance', () => ({
  isWithinServiceArea: async () => true,
}))

vi.mock('@/lib/schedule-conflict', () => ({
  findConflicts: async () => new Map(),
  describeConflicts: () => null,
}))

import { getNextCandidates } from '@/lib/next-candidate'

const VIOLIN = 'inst-violin'
const PROJECT = 'proj-kurtz'
const CHAIR_1 = 'pos-violin-1'
const CHAIR_2 = 'pos-violin-2'

type Fixture = {
  /** project_positions rows: the chair and who, if anyone, holds it. */
  positions: { id: string; musician_id: string | null }[]
  /** contract_offers across the project. */
  offers?: { musician_id: string; status: string; expires_at: string | null }[]
  /** musicians who play the instrument, in call order. */
  players: { id: string; first_name: string; last_name: string; call_order: number }[]
}

/** A thenable query builder: some reads end in .single(), others are awaited raw. */
function chain(result: any) {
  const c: any = {
    select: () => c,
    eq: () => c,
    in: () => c,
    order: () => c,
    single: async () => result,
    maybeSingle: async () => result,
    then: (res: any, rej: any) => Promise.resolve(result).then(res, rej),
  }
  return c
}

function fakeClient(f: Fixture) {
  const offers = f.offers ?? []

  return {
    from(table: string) {
      return {
        select(cols: string) {
          if (table === 'project_positions') {
            // The position under offer, with its project joined.
            if (cols.includes('project:projects!inner')) {
              return chain({
                data: {
                  id: CHAIR_2,
                  instrument_id: VIOLIN,
                  chair_number: 2,
                  project: { id: PROJECT, organization_id: 'org-1', services: [] },
                },
                error: null,
              })
            }
            // Every chair on the project, and who holds it.
            return chain({ data: f.positions, error: null })
          }

          if (table === 'contract_offers') {
            if (cols.includes('status')) {
              return chain({
                data: offers.filter((o) =>
                  ['pending', 'viewed', 'accepted'].includes(o.status)
                ),
                error: null,
              })
            }
            return chain({
              data: offers.filter((o) => o.status === 'declined'),
              error: null,
            })
          }

          if (table === 'musicians') {
            return chain({
              data: f.players.map((p) => ({
                ...p,
                email: `${p.first_name.toLowerCase()}@example.com`,
                zip_code: '10001',
                service_radius_miles: 50,
                is_leader: false,
                competing_schedules: [],
              })),
              error: null,
            })
          }

          if (table === 'services') return chain({ data: [], error: null })

          throw new Error(`unexpected table: ${table}`)
        },
      }
    },
  } as any
}

const REBECCA = { id: 'm-rebecca', first_name: 'Rebecca', last_name: 'V', call_order: 1 }
const ANNA = { id: 'm-anna', first_name: 'Anna', last_name: 'W', call_order: 2 }
const BEN = { id: 'm-ben', first_name: 'Ben', last_name: 'X', call_order: 3 }

const names = (c: { first_name: string }[]) => c.map((x) => x.first_name)

describe('next-in-line never suggests someone already on the gig', () => {
  it('excludes a musician holding another chair with no offer behind it', async () => {
    // The Kurtz case: Rebecca sits on violin 1 by direct assignment, so there is
    // no contract_offer of any kind to exclude her by.
    const { candidates } = await getNextCandidates(
      fakeClient({
        positions: [
          { id: CHAIR_1, musician_id: REBECCA.id },
          { id: CHAIR_2, musician_id: null },
        ],
        offers: [],
        players: [REBECCA, ANNA, BEN],
      }),
      CHAIR_2
    )

    expect(names(candidates)).not.toContain('Rebecca')
    expect(names(candidates)).toEqual(['Anna', 'Ben'])
  })

  it('excludes a musician seated by an accepted offer, as before', async () => {
    const { candidates } = await getNextCandidates(
      fakeClient({
        positions: [
          { id: CHAIR_1, musician_id: REBECCA.id },
          { id: CHAIR_2, musician_id: null },
        ],
        offers: [{ musician_id: REBECCA.id, status: 'accepted', expires_at: null }],
        players: [REBECCA, ANNA, BEN],
      }),
      CHAIR_2
    )

    expect(names(candidates)).toEqual(['Anna', 'Ben'])
  })

  it('still excludes a live offer on a chair nobody holds yet', async () => {
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
    const { candidates } = await getNextCandidates(
      fakeClient({
        positions: [
          { id: CHAIR_1, musician_id: null },
          { id: CHAIR_2, musician_id: null },
        ],
        offers: [{ musician_id: ANNA.id, status: 'pending', expires_at: future }],
        players: [ANNA, BEN],
      }),
      CHAIR_2
    )

    expect(names(candidates)).toEqual(['Ben'])
  })

  it('still excludes whoever declined this very chair', async () => {
    const { candidates } = await getNextCandidates(
      fakeClient({
        positions: [{ id: CHAIR_2, musician_id: null }],
        offers: [{ musician_id: ANNA.id, status: 'declined', expires_at: null }],
        players: [ANNA, BEN],
      }),
      CHAIR_2
    )

    expect(names(candidates)).toEqual(['Ben'])
  })

  it('suggests everyone when every chair is vacant', async () => {
    // A vacant chair carries a null musician_id, which must not exclude anyone.
    const { candidates, totalAvailable } = await getNextCandidates(
      fakeClient({
        positions: [
          { id: CHAIR_1, musician_id: null },
          { id: CHAIR_2, musician_id: null },
        ],
        players: [REBECCA, ANNA, BEN],
      }),
      CHAIR_2
    )

    expect(names(candidates)).toEqual(['Rebecca', 'Anna', 'Ben'])
    expect(totalAvailable).toBe(3)
  })

  it('honours the limit while still excluding the seated musician', async () => {
    const { candidates } = await getNextCandidates(
      fakeClient({
        positions: [
          { id: CHAIR_1, musician_id: REBECCA.id },
          { id: CHAIR_2, musician_id: null },
        ],
        players: [REBECCA, ANNA, BEN],
      }),
      CHAIR_2,
      1
    )

    expect(names(candidates)).toEqual(['Anna'])
  })
})
