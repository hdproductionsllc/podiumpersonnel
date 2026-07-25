import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Offer / gig lifecycle integrity audit.
 *
 * Locks in the Phase 2 fixes: substitutes can accept, declines can't clobber a
 * concurrent accept, vacated chairs don't keep a stale musician, and the expiry
 * cron never vacates a chair held by an accepted offer.
 */

const root = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf-8')

const acceptRoutes = [
  'src/app/api/gig/[token]/accept/route.ts',
  'src/app/api/musician/offers/[id]/accept/route.ts',
]
const declineRoutes = [
  'src/app/api/gig/[token]/decline/route.ts',
  'src/app/api/musician/offers/[id]/decline/route.ts',
]

/**
 * The seat-claim and decline logic these tests used to scan for inline now lives
 * in src/lib/offers/respond.ts, shared by both answer paths (the emailed link
 * and the portal) so the two copies can no longer drift apart.
 *
 * The guarantees below are unchanged — they are asserted against the shared
 * module, plus a check that each route actually delegates to it. The behavioural
 * versions (simulating a lost race, an already-answered offer, a reverted
 * accept) live in offer-respond-shared.test.ts.
 */
const SHARED = 'src/lib/offers/respond.ts'

describe('accept path handles substitutions', () => {
  const src = read(SHARED)

  it('transfers the chair from the original musician on a substitution', () => {
    expect(src).toContain("positionUpdate.eq('musician_id', subRequest.requesting_musician_id)")
  })

  it('still requires an empty chair for a normal offer', () => {
    expect(src).toContain("positionUpdate.is('musician_id', null)")
  })

  acceptRoutes.forEach((route) => {
    it(`${route} claims the chair through the shared helper`, () => {
      expect(read(route)).toContain('claimChairForAccept')
    })

    it(`${route} releases the original musician's accepted offer`, () => {
      // Still route-local: only the accept paths mark the predecessor released.
      const routeSrc = read(route)
      expect(routeSrc).toContain("status: 'released'")
      expect(routeSrc).toContain("eq('musician_id', subRequest.requesting_musician_id)")
    })
  })
})

describe('decline path is race-safe', () => {
  const src = read(SHARED)

  it('uses an optimistic lock on the decline update', () => {
    expect(src).toContain("RESPONDABLE_STATUSES")
    expect(src).toContain("['pending', 'viewed']")
  })

  it('clears musician_id when vacating the chair', () => {
    expect(src).toContain("musician_id: null, status: 'vacant'")
  })

  declineRoutes.forEach((route) => {
    it(`${route} declines through the shared helper`, () => {
      expect(read(route)).toContain('markOfferDeclined')
    })

    it(`${route} bails out when the offer was already responded to`, () => {
      // The route must branch on the decline outcome and return early — never
      // vacate the chair or send a decline email after losing the race. The two
      // routes phrase the guard differently (one checks !== 'declined', the
      // other matches each outcome), so assert the branch, not the wording.
      const routeSrc = read(route)
      expect(routeSrc).toMatch(/declineOutcome\s*(!==\s*'declined'|===\s*'already_responded')/)
      expect(routeSrc).toMatch(/declineOutcome[\s\S]{0,200}return/)
    })
  })
})

describe('expiry cron protects confirmed chairs', () => {
  it('does not vacate a position that still has an accepted offer', () => {
    const src = read('src/app/api/cron/expire-offers/route.ts')
    expect(src).toContain("in('status', ['pending', 'viewed', 'accepted'])")
  })
})

describe("'released' is a valid offer status", () => {
  it('migration 063 extends the status check constraint', () => {
    const migration = read('supabase/migrations/063_add_released_offer_status.sql')
    expect(migration).toMatch(/CHECK \(status IN \([^)]*'released'[^)]*\)\)/)
  })
})
