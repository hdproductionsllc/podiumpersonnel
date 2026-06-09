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

describe('accept routes handle substitutions', () => {
  acceptRoutes.forEach((route) => {
    const src = read(route)
    it(`${route} transfers the chair from the original musician on a substitution`, () => {
      expect(src).toContain("positionUpdate.eq('musician_id', subRequest.requesting_musician_id)")
    })
    it(`${route} still requires an empty chair for a normal offer`, () => {
      expect(src).toContain("positionUpdate.is('musician_id', null)")
    })
    it(`${route} releases the original musician's accepted offer`, () => {
      expect(src).toContain("status: 'released'")
      expect(src).toContain("eq('musician_id', subRequest.requesting_musician_id)")
    })
  })
})

describe('decline routes are race-safe', () => {
  declineRoutes.forEach((route) => {
    const src = read(route)
    it(`${route} uses an optimistic lock on the decline update`, () => {
      expect(src).toContain(".in('status', ['pending', 'viewed'])")
    })
    it(`${route} clears musician_id when vacating the chair`, () => {
      expect(src).toContain('musician_id: null, status: \'vacant\'')
    })
    it(`${route} bails out when the offer was already responded to`, () => {
      expect(src).toMatch(/declinedOffer\b/)
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
