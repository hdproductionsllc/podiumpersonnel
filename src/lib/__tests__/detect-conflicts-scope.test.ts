import { describe, it, expect, vi } from 'vitest'

/**
 * The projects page's conflicts summary (detectConflicts, fed to
 * ConflictsSummary) counts only the calls a seated person's chair works, as
 * the chair's own row does, once call_scoped_requirements is on. Without a
 * call view (every organization today) it checks every service, exactly as
 * before.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

import { detectConflicts, type PositionJoined } from '@/components/projects/project-positions'
import type { MusicianForOffer } from '@/components/projects/send-offer-dialog'
import type { Service } from '@/types'
import type { CallScopeView } from '@/lib/staffing/requirement-rules'

const LOAD_IN = 'svc-load-in'
const STRIKE = 'svc-strike'
const services = [
  { id: LOAD_IN, name: 'Load-in', start_time: '2026-11-01T14:00:00Z', end_time: '2026-11-01T18:00:00Z' },
  { id: STRIKE, name: 'Strike', start_time: '2026-11-01T23:00:00Z', end_time: '2026-11-02T02:00:00Z' },
] as unknown as Service[]

const position = {
  id: 'hand-1',
  project_id: 'proj-1',
  instrument_id: 'role-hand',
  chair_number: 1,
  musician_id: 'm-1',
  status: 'confirmed',
  notes: null,
  instrument: { id: 'role-hand', name: 'Stagehand', section: 'other', sort_order: 1 },
  musician: { id: 'm-1', first_name: 'Sam', last_name: 'Lee' },
  contract_offers: [],
  substitution_requests: [],
} as unknown as PositionJoined

// Busy during the strike only.
const musicians = [
  {
    id: 'm-1',
    first_name: 'Sam',
    last_name: 'Lee',
    competing_schedules: [{ id: 'cs-1', title: 'Other show', start_time: '2026-11-01T22:00:00Z', end_time: '2026-11-02T01:00:00Z' }],
  },
] as unknown as MusicianForOffer[]

const view = (scope: CallScopeView['chairs'][string] | null): CallScopeView => ({
  chairs: scope ? { 'hand-1': scope } : {},
  requirements: [],
})

describe('detectConflicts reads the calls each chair works', () => {
  it('no call view (switch off): every service counts, as before', () => {
    const out = detectConflicts([position], musicians, services)
    expect(out.map((c) => c.service.id)).toEqual([STRIKE])
    expect(detectConflicts([position], musicians, services, null)).toEqual(out)
  })

  it('a load-in-only chair: a commitment during the strike is not a conflict', () => {
    const scoped = view({ scopeMode: 'selected', serviceIds: [LOAD_IN], requirementId: 'req-1' })
    expect(detectConflicts([position], musicians, services, scoped)).toEqual([])
  })

  it('a strike-only chair, or one on every call: it is', () => {
    const strike = view({ scopeMode: 'selected', serviceIds: [STRIKE], requirementId: null })
    expect(detectConflicts([position], musicians, services, strike).map((c) => c.service.id)).toEqual([STRIKE])
    const every = view({ scopeMode: 'all', serviceIds: [], requirementId: null })
    expect(detectConflicts([position], musicians, services, every).map((c) => c.service.id)).toEqual([STRIKE])
  })

  it('a chair whose calls are unknown is checked against every call (over-warn, never miss)', () => {
    expect(detectConflicts([position], musicians, services, view(null)).map((c) => c.service.id)).toEqual([STRIKE])
  })
})
