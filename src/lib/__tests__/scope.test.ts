import { describe, it, expect, vi, afterEach } from 'vitest'
import { POSITION_SCOPE_FIELDS, isMissingScope, isScoped, servicesFor, servicesForMusician, withScope } from '@/lib/staffing/scope'

/**
 * servicesFor (src/lib/staffing/scope.ts, migration 098): which services a
 * chair works. 'all', or no scope on the row at all, must hand back the very
 * array it was given (same objects, same order, so every reader's output is
 * unchanged); 'selected' keeps only the listed services and never widens.
 */

const GIG = [
  { id: 'svc-rehearsal', start_time: '2026-11-06T20:00:00Z' },
  { id: 'svc-ceremony', start_time: '2026-11-07T21:00:00Z' },
  { id: 'svc-cocktail', start_time: '2026-11-07T22:30:00Z' },
]

afterEach(() => vi.restoreAllMocks())

describe('servicesFor', () => {
  it('a row read without scope (before 098, every quartet row) works the whole gig: the same array', () => {
    expect(servicesFor({}, GIG)).toBe(GIG)
    expect(servicesFor(null, GIG)).toBe(GIG)
    expect(servicesFor(undefined, GIG)).toBe(GIG)
  })

  it("'all' works the whole gig, whatever position_services says: the same array", () => {
    const chair = { scope_mode: 'all', position_services: [{ service_id: 'svc-cocktail' }] }
    expect(servicesFor(chair, GIG)).toBe(GIG)
  })

  it("'all' passes null and undefined through unchanged, as the readers had them", () => {
    expect(servicesFor({ scope_mode: 'all' }, null)).toBeNull()
    expect(servicesFor({ scope_mode: 'all' }, undefined)).toBeUndefined()
  })

  it("'selected' keeps only the listed services, in the order given", () => {
    const chair = { scope_mode: 'selected', position_services: [{ service_id: 'svc-cocktail' }, { service_id: 'svc-rehearsal' }] }
    expect(servicesFor(chair, GIG).map((s) => s.id)).toEqual(['svc-rehearsal', 'svc-cocktail'])
  })

  it("'selected' with nothing listed works NO services (never widens to the whole gig)", () => {
    expect(servicesFor({ scope_mode: 'selected', position_services: [] }, GIG)).toEqual([])
    expect(servicesFor({ scope_mode: 'selected' }, GIG)).toEqual([])
    expect(servicesFor({ scope_mode: 'selected', position_services: null }, GIG)).toEqual([])
    expect(servicesFor({ scope_mode: 'selected' }, null)).toEqual([])
  })

  it('a listed service that is not on the gig adds nothing', () => {
    const chair = { scope_mode: 'selected', position_services: [{ service_id: 'svc-elsewhere' }] }
    expect(servicesFor(chair, GIG)).toEqual([])
  })

  it('only the exact word selected scopes a chair', () => {
    expect(isScoped({ scope_mode: 'selected' })).toBe(true)
    for (const mode of ['all', 'SELECTED', '', null, undefined]) expect(isScoped({ scope_mode: mode })).toBe(false)
  })
})

describe('servicesForMusician', () => {
  const positions = [
    { musician_id: 'm-a', scope_mode: 'selected', position_services: [{ service_id: 'svc-ceremony' }] },
    { musician_id: 'm-a', scope_mode: 'selected', position_services: [{ service_id: 'svc-rehearsal' }] },
    { musician_id: 'm-b', scope_mode: 'all' },
    { musician_id: 'm-c' },
  ]

  it('everything the person\'s chairs on the gig work, in gig order', () => {
    expect(servicesForMusician(positions, 'm-a', GIG).map((s) => s.id)).toEqual(['svc-rehearsal', 'svc-ceremony'])
  })

  it('a chair on the whole gig (or one read without scope) is the whole gig: the same array', () => {
    expect(servicesForMusician(positions, 'm-b', GIG)).toBe(GIG)
    expect(servicesForMusician(positions, 'm-c', GIG)).toBe(GIG)
  })

  it('someone on no chair of the gig gets the whole gig, as before', () => {
    expect(servicesForMusician(positions, 'm-z', GIG)).toBe(GIG)
    expect(servicesForMusician(null, 'm-a', GIG)).toBe(GIG)
    expect(servicesForMusician(positions, null, GIG)).toBe(GIG)
  })
})

describe('withScope: tolerating a database without 098', () => {
  it('asks for the scope fields, with their leading comma', async () => {
    const run = vi.fn<(scope: string) => Promise<{ data: number; error: null }>>(async () => ({ data: 1, error: null }))
    expect(await withScope(run)).toEqual({ data: 1, error: null })
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith(`, ${POSITION_SCOPE_FIELDS}`)
  })

  it('098 missing (column or table): runs the same read without them, and says so once per process', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const missingColumn = { code: '42703', message: 'column project_positions_1.scope_mode does not exist' }
    const missingTable = { code: 'PGRST200', message: "Could not find a relationship between 'project_positions' and 'position_services' in the schema cache" }
    for (const error of [missingColumn, missingTable, missingColumn]) {
      const run = vi.fn(async (scope: string) => (scope ? { data: null, error } : { data: 'rows', error: null }))
      expect(await withScope(run)).toEqual({ data: 'rows', error: null })
      expect(run.mock.calls.map((c) => c[0])).toEqual([`, ${POSITION_SCOPE_FIELDS}`, ''])
    }
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('migration 098')).length).toBeLessThanOrEqual(1)
  })

  it('any other error comes back as it was, with no second read', async () => {
    for (const error of [
      { code: '57014', message: 'upstream request timeout' },
      { code: '42703', message: 'column projects_1.gig_lead_musician_id does not exist' },
      { code: 'PGRST200', message: "Could not find a relationship between 'projects' and 'venues'" },
    ]) {
      const run = vi.fn(async () => ({ data: null, error }))
      expect(await withScope(run)).toEqual({ data: null, error })
      expect(run).toHaveBeenCalledTimes(1)
    }
  })

  it('isMissingScope names only the 098 fields', () => {
    expect(isMissingScope({ code: '42703', message: 'column x.scope_mode does not exist' })).toBe(true)
    expect(isMissingScope({ code: 'PGRST204', message: "Could not find the 'scope_mode' column" })).toBe(true)
    expect(isMissingScope({ code: '42703', message: 'column x.status does not exist' })).toBe(false)
    expect(isMissingScope(null)).toBe(false)
  })
})
