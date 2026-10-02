import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The decline route calls advance() for every organization, auto-offer on or
 * off. A failed read inside the cascade must leave no history row for an
 * organization that never turned auto-offer on: nothing was asked of it, and a
 * "cascade skipped (error)" line in that org's history would be noise. An
 * organization that has it on still gets the row, so the failure is visible.
 */

const state = vi.hoisted(() => ({ logEvent: vi.fn(async () => {}) }))

vi.mock('@/lib/staffing/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/staffing/events')>()),
  logEvent: state.logEvent,
}))

vi.mock('@/lib/staffing/cascade-plan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/staffing/cascade-plan')>()
  return {
    ...actual,
    planCascade: vi.fn(async () => {
      throw new actual.CascadePlanError({ message: 'upstream request timeout', code: '57014' }, 'org-1')
    }),
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({}),
  getOrgAdminEmails: vi.fn(async () => []),
}))

import { advance } from '@/lib/staffing/cascade'

/** Just enough of a client for getOrgStaffingSettings. */
function clientWithAutoOffer(autoCascade: boolean) {
  const result = { data: { auto_cascade: autoCascade, allow_worker_drop: false }, error: null }
  const c = { select: () => c, eq: () => c, maybeSingle: async () => result }
  return { from: () => c } as never
}

const INPUT = { positionId: 'pos-1', triggerOfferId: 'offer-1', trigger: 'declined' as const }

describe('a failed cascade read', () => {
  beforeEach(() => {
    state.logEvent.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('leaves no history in an organization with auto-offer off', async () => {
    const result = await advance(clientWithAutoOffer(false), INPUT)

    expect(result).toEqual({ outcome: 'skipped', reason: 'error' })
    expect(state.logEvent).not.toHaveBeenCalled()
  })

  it('is recorded in an organization with auto-offer on', async () => {
    const result = await advance(clientWithAutoOffer(true), INPUT)

    expect(result).toMatchObject({ outcome: 'skipped', reason: 'error' })
    expect(state.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', action: 'cascade.skipped', after: expect.objectContaining({ reason: 'error' }) })
    )
  })
})
