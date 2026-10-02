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
]
const declineRoutes = [
  'src/app/api/gig/[token]/decline/route.ts',
]

/**
 * The seat-claim and decline logic these tests used to scan for inline now lives
 * in src/lib/staffing/respond.ts (moved from src/lib/offers/respond.ts, which
 * re-exports it), with the status list in live.ts and the chair release in seats.ts. It was extracted when the emailed-link and portal
 * routes were near-duplicates that had drifted; the portal is gone, but the
 * module stays — this is the logic that stops two musicians winning one chair,
 * and it is better tested directly than scanned for as a string in a route.
 *
 * The guarantees below are unchanged — they are asserted against the shared
 * module, plus a check that each route actually delegates to it. The behavioural
 * versions (simulating a lost race, an already-answered offer, a reverted
 * accept) live in offer-respond-shared.test.ts.
 */
const SHARED = 'src/lib/staffing/respond.ts'
const LIVE = 'src/lib/staffing/live.ts'
const SEATS = 'src/lib/staffing/seats.ts'

describe('accept path handles substitutions', () => {
  // The seat claim is the claim_chair database function (migration 094). Its
  // behaviour is tested against Postgres in db/staffing-rpcs.test.ts and through
  // the route in offer-lifecycle-behavior.test.ts; these are the tripwires.
  const src = read(SHARED)
  const sql = read('supabase/migrations/094_cascade_constraints.sql')
  const claim = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION claim_chair'), sql.indexOf('CREATE OR REPLACE FUNCTION create_offer'))

  it('claims through claim_chair, in one transaction', () => {
    expect(src).toContain("supabase.rpc('claim_chair', { p_offer_id: offer.id })")
  })

  it("releases the original musician's accepted offer BEFORE accepting the substitute's", () => {
    const release = claim.indexOf("UPDATE contract_offers SET status = 'released'")
    const accept = claim.indexOf("UPDATE contract_offers SET status = 'accepted'")
    expect(release).toBeGreaterThan(-1)
    expect(accept).toBeGreaterThan(release)
  })

  it('a substitute needs the chair still held by the one they replace; anyone else needs it empty', () => {
    expect(claim).toContain('v_is_sub AND v_pos.musician_id IS DISTINCT FROM v_sub.requesting_musician_id')
    expect(claim).toContain('NOT v_is_sub AND v_pos.musician_id IS NOT NULL')
  })

  acceptRoutes.forEach((route) => {
    it(`${route} claims the chair through the shared helper`, () => {
      expect(read(route)).toContain('claimChairForAccept')
    })

    it(`${route} writes no offer or chair status itself`, () => {
      const routeSrc = read(route)
      expect(routeSrc).not.toContain("status: 'released'")
      expect(routeSrc).not.toContain("status: 'filled'")
      expect(routeSrc).not.toContain(".from('project_positions')")
    })
  })
})

describe('decline path is race-safe', () => {
  const src = read(SHARED)

  it('uses an optimistic lock on the decline update', () => {
    expect(src).toContain("RESPONDABLE_STATUSES = LIVE_OFFER_STATUSES")
    expect(read(LIVE)).toContain("LIVE_OFFER_STATUSES = ['pending', 'viewed']")
  })

  it('clears musician_id when vacating the chair', () => {
    expect(read(SEATS)).toContain("musician_id: null, status: 'vacant'")
  })

  it('frees the chair only when nobody holds it, except on an unassign', () => {
    const seats = read(SEATS)
    expect(seats).toMatch(/reason !== 'unassigned'[\s\S]{0,80}\.is\('musician_id', null\)/)
  })

  declineRoutes.forEach((route) => {
    it(`${route} declines through the shared helper`, () => {
      expect(read(route)).toContain('markOfferDeclined')
    })

    it(`${route} frees the chair through the guarded release`, () => {
      expect(read(route)).toContain("releaseSeat(supabase, offer.project_position_id, 'declined')")
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
    expect(src).toContain("in('status', [...LIVE_OFFER_STATUSES, 'accepted'])")
    expect(read(LIVE)).toContain("LIVE_OFFER_STATUSES = ['pending', 'viewed']")
  })
})

describe("'released' is a valid offer status", () => {
  it('migration 063 extends the status check constraint', () => {
    const migration = read('supabase/migrations/063_add_released_offer_status.sql')
    expect(migration).toMatch(/CHECK \(status IN \([^)]*'released'[^)]*\)\)/)
  })
})
