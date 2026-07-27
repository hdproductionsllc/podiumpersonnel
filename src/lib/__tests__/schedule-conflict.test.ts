/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  overlaps,
  serviceWindow,
  anyOverlap,
  findConflicts,
  describeConflicts,
  ASSUMED_SERVICE_MS,
} from '@/lib/schedule-conflict'

/**
 * "Is this musician already busy?" — the check that used to disagree with itself.
 *
 * The candidate list and auto-populate only looked at competing_schedules (the
 * outside commitments a contractor types in). The send-offer dialog only looked
 * at active offers on other projects. So Podium would suggest a cellist already
 * confirmed on another of the same contractor's ensembles that night, and the
 * warning appeared only later, in a different dialog.
 *
 * That matters most for a contractor running several groups off one pool of
 * players — which is the core use case.
 */

const HOUR = 60 * 60 * 1000
const T0 = Date.parse('2026-05-02T19:00:00Z')

const iso = (ms: number) => new Date(ms).toISOString()

describe('overlap arithmetic', () => {
  it('detects a straightforward clash', () => {
    expect(overlaps({ start: 0, end: 100 }, { start: 50, end: 150 })).toBe(true)
  })

  it('does not treat back-to-back bookings as a clash', () => {
    // A 7pm–9pm and a 9pm–11pm call are a tight night, not a double-booking.
    expect(overlaps({ start: 0, end: 100 }, { start: 100, end: 200 })).toBe(false)
  })

  it('detects containment in both directions', () => {
    expect(overlaps({ start: 0, end: 500 }, { start: 100, end: 200 })).toBe(true)
    expect(overlaps({ start: 100, end: 200 }, { start: 0, end: 500 })).toBe(true)
  })
})

describe('serviceWindow', () => {
  it('uses the real end time when there is one', () => {
    const w = serviceWindow({ start_time: iso(T0), end_time: iso(T0 + 2 * HOUR) })
    expect(w).toEqual({ start: T0, end: T0 + 2 * HOUR })
  })

  it('assumes a duration when end_time is missing', () => {
    // Under-assuming here is what lets a double-booking slip through.
    const w = serviceWindow({ start_time: iso(T0), end_time: null })
    expect(w).toEqual({ start: T0, end: T0 + ASSUMED_SERVICE_MS })
  })

  it('never produces a window that ends before it starts', () => {
    // A malformed row would otherwise silently never overlap anything.
    const w = serviceWindow({ start_time: iso(T0), end_time: iso(T0 - HOUR) })
    expect(w!.end).toBeGreaterThan(w!.start)
  })

  it('does not inflate a genuinely short service', () => {
    // Clamping every call up to the assumed length would invent a conflict
    // between a 7-9pm gig and whatever starts at 9:30.
    const w = serviceWindow({ start_time: iso(T0), end_time: iso(T0 + HOUR) })
    expect(w!.end).toBe(T0 + HOUR)
  })

  it('rejects an unparseable start', () => {
    expect(serviceWindow({ start_time: 'not a date' })).toBeNull()
  })
})

/** Fake PostgREST: one queued response per table, filters recorded. */
function makeSupabase(responses: Record<string, any>) {
  const calls: any[] = []
  const client: any = {
    calls,
    from(table: string) {
      const record: any = { table, filters: [] }
      calls.push(record)
      const builder: any = {
        select() {
          return builder
        },
        in(col: string, val: any) {
          record.filters.push([col, val])
          return builder
        },
        eq(col: string, val: any) {
          record.filters.push([col, val])
          return builder
        },
        then(onFulfilled: any, onRejected: any) {
          return Promise.resolve(
            responses[table] ?? { data: [], error: null }
          ).then(onFulfilled, onRejected)
        },
      }
      return builder
    },
  }
  return client
}

const OUR_PROJECT = 'proj-ours'
const OUR_SERVICES = [{ start_time: iso(T0), end_time: iso(T0 + 2 * HOUR) }]

function offerRow(musicianId: string, projectId: string, name: string, status: string, expiresAt?: string | null) {
  return {
    musician_id: musicianId,
    status,
    expires_at: expiresAt ?? null,
    project_position: { project_id: projectId, project: { id: projectId, name } },
  }
}

describe('findConflicts — offers on other projects', () => {
  it('flags a musician confirmed on another project at the same time', async () => {
    // The bug this whole module exists for.
    const supabase = makeSupabase({
      contract_offers: { data: [offerRow('m1', 'proj-other', 'Spring Gala', 'accepted')] },
      services: {
        data: [{ project_id: 'proj-other', start_time: iso(T0), end_time: iso(T0 + 2 * HOUR) }],
      },
    })

    const conflicts = await findConflicts(supabase, {
      musicianIds: ['m1'],
      services: OUR_SERVICES,
      excludeProjectId: OUR_PROJECT,
    })

    expect(conflicts.get('m1')).toEqual([
      { source: 'project', label: 'Spring Gala', confirmed: true },
    ])
  })

  it('ignores another project that does not overlap in time', async () => {
    const supabase = makeSupabase({
      contract_offers: { data: [offerRow('m1', 'proj-other', 'Next Week', 'accepted')] },
      services: {
        data: [
          { project_id: 'proj-other', start_time: iso(T0 + 48 * HOUR), end_time: iso(T0 + 50 * HOUR) },
        ],
      },
    })

    const conflicts = await findConflicts(supabase, {
      musicianIds: ['m1'],
      services: OUR_SERVICES,
      excludeProjectId: OUR_PROJECT,
    })

    expect(conflicts.has('m1')).toBe(false)
  })

  it('never treats the project being staffed as a conflict with itself', async () => {
    const supabase = makeSupabase({
      contract_offers: { data: [offerRow('m1', OUR_PROJECT, 'This Very Project', 'accepted')] },
      services: { data: [{ project_id: OUR_PROJECT, start_time: iso(T0), end_time: iso(T0 + 2 * HOUR) }] },
    })

    const conflicts = await findConflicts(supabase, {
      musicianIds: ['m1'],
      services: OUR_SERVICES,
      excludeProjectId: OUR_PROJECT,
    })

    expect(conflicts.has('m1')).toBe(false)
  })

  it('counts a live pending offer as a hold, marked unconfirmed', async () => {
    const supabase = makeSupabase({
      contract_offers: {
        data: [offerRow('m1', 'proj-other', 'Maybe Gala', 'pending', iso(Date.now() + 100 * HOUR))],
      },
      services: { data: [{ project_id: 'proj-other', start_time: iso(T0), end_time: iso(T0 + 2 * HOUR) }] },
    })

    const conflicts = await findConflicts(supabase, {
      musicianIds: ['m1'],
      services: OUR_SERVICES,
      excludeProjectId: OUR_PROJECT,
    })

    expect(conflicts.get('m1')?.[0]).toMatchObject({ confirmed: false, label: 'Maybe Gala' })
  })

  it('ignores a pending offer that already lapsed', async () => {
    // An expired hold blocks nobody.
    const supabase = makeSupabase({
      contract_offers: {
        data: [offerRow('m1', 'proj-other', 'Stale Gala', 'pending', iso(Date.now() - 10 * HOUR))],
      },
      services: { data: [{ project_id: 'proj-other', start_time: iso(T0), end_time: iso(T0 + 2 * HOUR) }] },
    })

    const conflicts = await findConflicts(supabase, {
      musicianIds: ['m1'],
      services: OUR_SERVICES,
      excludeProjectId: OUR_PROJECT,
    })

    expect(conflicts.has('m1')).toBe(false)
  })

  it('only asks about the musicians it was given', async () => {
    const supabase = makeSupabase({ contract_offers: { data: [] } })

    await findConflicts(supabase, {
      musicianIds: ['m1', 'm2'],
      services: OUR_SERVICES,
      excludeProjectId: OUR_PROJECT,
    })

    const offerQuery = supabase.calls.find((c: any) => c.table === 'contract_offers')
    expect(offerQuery.filters).toContainEqual(['musician_id', ['m1', 'm2']])
  })

  it('queries a fixed number of times regardless of roster size', async () => {
    // Batched on purpose — this runs while ranking a whole section.
    const supabase = makeSupabase({
      contract_offers: {
        data: [offerRow('m1', 'proj-other', 'Gala', 'accepted')],
      },
      services: { data: [{ project_id: 'proj-other', start_time: iso(T0), end_time: iso(T0 + 2 * HOUR) }] },
    })

    await findConflicts(supabase, {
      musicianIds: Array.from({ length: 50 }, (_, i) => `m${i}`),
      services: OUR_SERVICES,
      excludeProjectId: OUR_PROJECT,
    })

    expect(supabase.calls.length).toBeLessThanOrEqual(2)
  })
})

describe('findConflicts — outside commitments', () => {
  it('still flags a recorded external commitment', async () => {
    const supabase = makeSupabase({ contract_offers: { data: [] } })

    const conflicts = await findConflicts(supabase, {
      musicianIds: ['m1'],
      services: OUR_SERVICES,
      excludeProjectId: OUR_PROJECT,
      externalByMusician: new Map([
        ['m1', [{ title: 'Teaching', start_time: iso(T0), end_time: iso(T0 + HOUR) }]],
      ]),
    })

    expect(conflicts.get('m1')).toEqual([
      { source: 'external', label: 'Teaching', confirmed: true },
    ])
  })

  it('reports both kinds of clash together', async () => {
    const supabase = makeSupabase({
      contract_offers: { data: [offerRow('m1', 'proj-other', 'Spring Gala', 'accepted')] },
      services: { data: [{ project_id: 'proj-other', start_time: iso(T0), end_time: iso(T0 + 2 * HOUR) }] },
    })

    const conflicts = await findConflicts(supabase, {
      musicianIds: ['m1'],
      services: OUR_SERVICES,
      excludeProjectId: OUR_PROJECT,
      externalByMusician: new Map([
        ['m1', [{ title: 'Teaching', start_time: iso(T0), end_time: iso(T0 + HOUR) }]],
      ]),
    })

    expect(conflicts.get('m1')).toHaveLength(2)
  })

  it('leaves a free musician out of the map entirely', async () => {
    const supabase = makeSupabase({ contract_offers: { data: [] } })

    const conflicts = await findConflicts(supabase, {
      musicianIds: ['m1'],
      services: OUR_SERVICES,
      excludeProjectId: OUR_PROJECT,
      externalByMusician: new Map([
        ['m1', [{ title: 'Teaching', start_time: iso(T0 + 72 * HOUR), end_time: iso(T0 + 74 * HOUR) }]],
      ]),
    })

    expect(conflicts.size).toBe(0)
  })
})

describe('describeConflicts', () => {
  it('says nothing when there is nothing to say', () => {
    expect(describeConflicts(undefined)).toBeNull()
    expect(describeConflicts([])).toBeNull()
  })

  it('names the project for a confirmed booking', () => {
    expect(
      describeConflicts([{ source: 'project', label: 'Spring Gala', confirmed: true }])
    ).toBe('Booked on Spring Gala')
  })

  it('distinguishes a pending hold from a booking', () => {
    expect(
      describeConflicts([{ source: 'project', label: 'Spring Gala', confirmed: false }])
    ).toBe('Pending offer on Spring Gala')
  })

  it('leads with the confirmed booking when there are several', () => {
    const text = describeConflicts([
      { source: 'project', label: 'Maybe Gala', confirmed: false },
      { source: 'project', label: 'Real Gala', confirmed: true },
    ])
    expect(text).toBe('Booked on Real Gala (+1 more)')
  })
})

describe('every ranking path uses the shared check', () => {
  const root = resolve(__dirname, '../../..')
  const read = (rel: string) => readFileSync(resolve(root, rel), 'utf-8')

  const rankers = [
    'src/lib/next-candidate.ts',
    'src/app/api/projects/[projectId]/auto-populate/route.ts',
  ]

  it.each(rankers)('%s calls findConflicts', (file) => {
    expect(read(file)).toContain('findConflicts')
  })

  it.each(rankers)('%s no longer hand-rolls the overlap check', (file) => {
    // The inline copies are exactly what drifted apart.
    const src = read(file)
    expect(src).not.toContain('3 * 60 * 60 * 1000')
    expect(src).not.toContain('schedStart < svcEnd')
  })
})
