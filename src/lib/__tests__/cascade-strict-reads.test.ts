/* eslint-disable @typescript-eslint/no-explicit-any -- a hand-rolled PostgREST stand-in */
import { describe, it, expect } from 'vitest'
import { getNextCandidates } from '@/lib/staffing/candidates'

/**
 * The auto-cascade's reading of the candidate list (getNextCandidates with
 * { forCascade: true }), on the REAL candidates.ts, conflicts.ts and
 * zip-distance.ts.
 *
 * The admin's suggestion list has always tolerated a failed read: it shrinks
 * or loses its conflict warnings, and a person looks before anything is sent.
 * The cascade acts on the answer by itself, so for it every failed read must
 * throw (advance() turns that into skipped('error'): nothing written, the
 * admins get the ordinary notice). Otherwise:
 *
 *   - a failed position or roster read looks like an empty list -> "nobody
 *     left" email and the chair marked exhausted for good;
 *   - a failed history read re-offers the chair to whoever just declined it;
 *   - a failed conflict read offers it to someone booked elsewhere that night.
 *
 * And the cascade counts a lapsed-but-uncollected offer on the gig as holding
 * its musician, as cascade_offer (096) does, so the two agree on who is free.
 */

const PROJECT = 'proj-1'
const OTHER_PROJECT = 'proj-2'
const CHAIR = 'pos-violin-2'

type Read =
  | 'position'
  | 'positions'
  | 'gigOffers'
  | 'history'
  | 'musicians'
  | 'services'
  | 'otherOffers'
  | 'otherServices'
  | 'zip'

interface Fixture {
  fail?: Read
  gigOffers?: { musician_id: string; status: string; expires_at: string | null }[]
  history?: { musician_id: string }[]
}

const SERVICES = [{ id: 'svc-1', start_time: '2026-11-07T21:00:00Z', end_time: '2026-11-07T23:00:00Z' }]

const PLAYERS = [
  { id: 'm-anna', first_name: 'Anna', last_name: 'A', call_order: 1 },
  { id: 'm-ben', first_name: 'Ben', last_name: 'B', call_order: 2 },
  { id: 'm-cleo', first_name: 'Cleo', last_name: 'C', call_order: 3 },
]

const BOOM = { message: 'upstream request timeout', code: '57014' }

/** A thenable builder: every filter returns itself; awaiting or .single() yields the result. */
function chain(result: { data: unknown; error: unknown }) {
  const c: any = {
    select: () => c,
    eq: () => c,
    in: () => c,
    not: () => c,
    order: () => c,
    limit: () => c,
    single: async () => result,
    maybeSingle: async () => result,
    then: (res: any, rej: any) => Promise.resolve(result).then(res, rej),
  }
  return c
}

function fakeClient(f: Fixture) {
  const answer = (read: Read, data: unknown) => chain(f.fail === read ? { data: null, error: BOOM } : { data, error: null })
  return {
    from(table: string) {
      return {
        select(cols: string) {
          if (table === 'project_positions') {
            if (cols.includes('project:projects!inner')) {
              return answer('position', {
                id: CHAIR,
                instrument_id: 'inst-violin',
                chair_number: 2,
                project: {
                  id: PROJECT,
                  organization_id: 'org-1',
                  services: [{ id: 'svc-1', venue_id: 'v-1', venue: { zip: '78701' } }],
                },
              })
            }
            return answer('positions', [{ id: CHAIR, musician_id: null }])
          }
          if (table === 'contract_offers') {
            if (cols.includes('project_position:project_positions!inner')) {
              // Ben holds an accepted offer on another gig the same evening.
              return answer('otherOffers', [
                {
                  musician_id: 'm-ben',
                  status: 'accepted',
                  expires_at: null,
                  project_position: { project_id: OTHER_PROJECT, project: { id: OTHER_PROJECT, name: 'Gala' } },
                },
              ])
            }
            if (cols.includes('status')) return answer('gigOffers', f.gigOffers ?? [])
            return answer('history', f.history ?? [])
          }
          if (table === 'musicians') {
            return answer(
              'musicians',
              PLAYERS.map((p) => ({
                ...p,
                email: `${p.first_name.toLowerCase()}@example.com`,
                zip_code: '78702',
                service_radius_miles: 50,
                is_leader: false,
                competing_schedules: [],
                musician_instruments: [{ instrument_id: 'inst-violin' }],
              }))
            )
          }
          if (table === 'services') {
            if (cols.startsWith('project_id')) {
              return answer('otherServices', [{ project_id: OTHER_PROJECT, start_time: '2026-11-07T22:00:00Z', end_time: null }])
            }
            return answer('services', SERVICES)
          }
          if (table === 'zip_coordinates') {
            return answer('zip', [
              { zip: '78701', lat: 30.27, lng: -97.74 },
              { zip: '78702', lat: 30.26, lng: -97.71 },
            ])
          }
          throw new Error(`unexpected table: ${table}`)
        },
      }
    },
  } as any
}

const names = (r: { candidates: { first_name: string; has_conflict: boolean }[] }) =>
  r.candidates.map((c) => `${c.first_name}${c.has_conflict ? ' (conflict)' : ''}`)

describe('every read the cascade relies on must succeed', () => {
  it('with every read working, both readings agree', async () => {
    const lenient = await getNextCandidates(fakeClient({}), CHAIR)
    const strict = await getNextCandidates(fakeClient({}), CHAIR, undefined, { forCascade: true })
    expect(names(lenient)).toEqual(['Anna', 'Cleo', 'Ben (conflict)'])
    expect(names(strict)).toEqual(names(lenient))
  })

  it.each<[Read, string]>([
    ['position', 'the chair and its gig'],
    ['positions', 'who sits on the gig'],
    ['gigOffers', 'offers out on the gig'],
    ['history', 'who already had their turn at this chair'],
    ['musicians', 'the roster'],
    ['services', "the gig's services"],
    ['otherOffers', 'offers on other gigs (conflicts)'],
    ['otherServices', "other gigs' services (conflicts)"],
    ['zip', 'the service-area coordinates'],
  ])('%s (%s) fails: the cascade gets an error, the suggestion list carries on', async (read) => {
    await expect(getNextCandidates(fakeClient({ fail: read }), CHAIR, undefined, { forCascade: true })).rejects.toMatchObject(BOOM)
    await expect(getNextCandidates(fakeClient({ fail: read }), CHAIR)).resolves.toBeDefined()
  })

  it('the lenient reading of a failed history read would re-offer the chair to whoever declined it', async () => {
    // Why the strictness matters: Anna declined this chair.
    const ok = await getNextCandidates(fakeClient({ history: [{ musician_id: 'm-anna' }] }), CHAIR)
    expect(names(ok)).not.toContain('Anna')
    const failed = await getNextCandidates(fakeClient({ history: [{ musician_id: 'm-anna' }], fail: 'history' }), CHAIR)
    expect(names(failed)).toContain('Anna')
  })
})

describe('a lapsed offer on the gig, not yet collected by the expire cron', () => {
  const lapsed = { musician_id: 'm-anna', status: 'pending', expires_at: new Date(Date.now() - 60_000).toISOString() }

  it('holds its musician for the cascade (as cascade_offer counts it)', async () => {
    const r = await getNextCandidates(fakeClient({ gigOffers: [lapsed] }), CHAIR, undefined, { forCascade: true })
    expect(names(r)).toEqual(['Cleo', 'Ben (conflict)'])
  })

  it('holds nobody on the admin\'s suggestion list, as before', async () => {
    const r = await getNextCandidates(fakeClient({ gigOffers: [lapsed] }), CHAIR)
    expect(names(r)).toEqual(['Anna', 'Cleo', 'Ben (conflict)'])
  })
})
