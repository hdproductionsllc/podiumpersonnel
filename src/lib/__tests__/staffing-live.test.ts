import { describe, it, expect } from 'vitest'
import {
  LIVE_OFFER_STATUSES,
  hasLapsed,
  hasLiveStatus,
  isActiveOffer,
  isLapsedOffer,
  isLiveOffer,
} from '@/lib/staffing/live'

/**
 * IDENTITY tests for src/lib/staffing/live.ts: the one "is this offer live?"
 * predicate that replaced the hand-written checks (audit C section 3.1). Each
 * legacy formulation is copied here verbatim and compared with its replacement
 * over every status and a spread of deadlines, so the swap provably changed no
 * answer. The only instant they may differ is now === expires_at exactly
 * (documented in live.ts), which no case below lands on.
 */

const NOW = new Date('2026-11-01T12:00:00.000Z')
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString()

const STATUSES = ['pending', 'viewed', 'accepted', 'declined', 'expired', 'rescinded', 'released', null, undefined]
const DEADLINES = [null, undefined, at(-7 * 86400000), at(-1), at(1), at(48 * 3600000)]

type O = { status: string | null | undefined; expires_at: string | null | undefined }

const CASES: O[] = STATUSES.flatMap((status) => DEADLINES.map((expires_at) => ({ status, expires_at })))

// --- the legacy checks, verbatim (with `new Date()` pinned to NOW) -----------

/** accept/decline routes: redirect away when either is true. */
const legacyRouteRefuses = (o: O) =>
  (o.expires_at && new Date(o.expires_at) < NOW) || (o.status !== 'pending' && o.status !== 'viewed')

/** project-offers.tsx isLive. */
const legacyIsExpired = (expiresAt: string | null | undefined) => (!expiresAt ? false : new Date(expiresAt) < NOW)
const legacyOffersIsLive = (o: O) =>
  (o.status === 'pending' || o.status === 'viewed') && !legacyIsExpired(o.expires_at)

/** project-offers.tsx displayStatus. */
const legacyDisplaysExpired = (o: O) =>
  !!(legacyIsExpired(o.expires_at) && (o.status === 'pending' || o.status === 'viewed'))

/** projects-client.tsx openChairIds: an offer that keeps the chair "not open". */
const legacyOpenChairBlocker = (o: O) =>
  (o.status === 'pending' || o.status === 'viewed') && (!o.expires_at || Date.parse(o.expires_at) > NOW.getTime())

/** next-candidate.ts (after its pending/viewed/accepted query). */
const legacyCandidateExcluded = (o: O) =>
  (['pending', 'viewed', 'accepted'] as unknown[]).includes(o.status) &&
  (o.status === 'accepted' || !o.expires_at || new Date(o.expires_at) > NOW)

/** schedule-conflict.ts (after the same query). */
const legacyConflictHolds = (o: O) => {
  if (!(['pending', 'viewed', 'accepted'] as unknown[]).includes(o.status)) return false
  if (o.status === 'accepted') return true
  return !o.expires_at || new Date(o.expires_at).getTime() > NOW.getTime()
}

/** gig-page-client.tsx */
const legacyClientCanRespond = (s: O['status']) => s === 'pending' || s === 'viewed'
const legacyClientIsExpired = (e: O['expires_at']) => !!(e && new Date(e) < NOW)

describe('isLiveOffer and friends answer exactly what the old checks did', () => {
  it.each(CASES)('status=%s', (o) => {
    expect(isLiveOffer(o, NOW)).toBe(!legacyRouteRefuses(o))
    expect(isLiveOffer(o, NOW)).toBe(legacyOffersIsLive(o))
    expect(isLiveOffer(o, NOW)).toBe(legacyOpenChairBlocker(o))
    expect(isLapsedOffer(o, NOW)).toBe(legacyDisplaysExpired(o))
    expect(isActiveOffer(o, NOW)).toBe(legacyCandidateExcluded(o))
    expect(isActiveOffer(o, NOW)).toBe(legacyConflictHolds(o))
    expect(hasLiveStatus(o.status)).toBe(legacyClientCanRespond(o.status))
    expect(hasLapsed(o.expires_at, NOW)).toBe(legacyClientIsExpired(o.expires_at))
  })
})

describe('the definitions themselves', () => {
  it('live statuses are pending and viewed, nothing else', () => {
    expect([...LIVE_OFFER_STATUSES]).toEqual(['pending', 'viewed'])
  })

  it('"No expiration" never lapses', () => {
    expect(isLiveOffer({ status: 'pending', expires_at: null }, new Date('2099-01-01'))).toBe(true)
  })

  it('a pending offer one millisecond past its deadline is lapsed, not live', () => {
    const o = { status: 'pending', expires_at: at(-1) }
    expect(isLiveOffer(o, NOW)).toBe(false)
    expect(isLapsedOffer(o, NOW)).toBe(true)
  })

  it('is still answerable at the exact instant of the deadline (the accept route\'s reading)', () => {
    expect(isLiveOffer({ status: 'viewed', expires_at: NOW.toISOString() }, NOW)).toBe(true)
  })

  it('an accepted offer holds its musician whatever its deadline said', () => {
    expect(isActiveOffer({ status: 'accepted', expires_at: at(-86400000) }, NOW)).toBe(true)
    expect(isLiveOffer({ status: 'accepted', expires_at: null }, NOW)).toBe(false)
  })

  it('defaults "now" to the current time', () => {
    expect(isLiveOffer({ status: 'pending', expires_at: new Date(Date.now() + 60000).toISOString() })).toBe(true)
    expect(isLiveOffer({ status: 'pending', expires_at: new Date(Date.now() - 60000).toISOString() })).toBe(false)
  })
})
