/**
 * "Is this offer still live?" — the one definition.
 *
 * An offer is live while it is waiting on an answer: status pending or viewed
 * AND not past its expires_at. The expire cron only flips the status once an
 * hour, so between the deadline and the next run the row still says pending;
 * every reader that cares about the deadline must look at both. The audit
 * found this rule spelled out by hand in nine places with two different
 * meanings (status only vs status + deadline). It now lives here.
 *
 * Two families of caller, kept deliberately distinct:
 *
 *   - Status-only (LIVE_OFFER_STATUSES / hasLiveStatus): optimistic-lock write
 *     guards and the admin's "Revoke" button. A lapsed-but-uncollected offer
 *     must still be retirable, so these ignore the deadline on purpose.
 *   - Deadline-aware (isLiveOffer / isLapsedOffer / isActiveOffer): anything that
 *     asks "can this still be answered" or "does this still hold a musician".
 *
 * Pure: no I/O, safe to import from client components.
 *
 * Boundary: an offer is lapsed once now is strictly after expires_at. Some old
 * readers wrote "live while expires_at > now" and others "expired while
 * expires_at < now"; they disagreed only at the exact millisecond of the
 * deadline, and the accept/decline routes' reading (still answerable at that
 * instant) is the one kept.
 */

/** Statuses an offer can still be answered from (before any deadline check). */
export const LIVE_OFFER_STATUSES = ['pending', 'viewed'] as const

export type LiveOfferStatus = (typeof LIVE_OFFER_STATUSES)[number]

/** The fields the predicates read; any offer row or embed carries them. */
export interface OfferLiveness {
  status: string | null | undefined
  expires_at?: string | null
}

/** The status column alone says the offer is waiting on an answer. */
export function hasLiveStatus(status: string | null | undefined): status is LiveOfferStatus {
  return status === 'pending' || status === 'viewed'
}

/** The offer's deadline has passed. "No expiration" (null) never lapses. */
export function hasLapsed(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() < now.getTime()
}

/** Waiting on an answer and still inside its deadline: the musician can respond. */
export function isLiveOffer(offer: OfferLiveness, now: Date = new Date()): boolean {
  return hasLiveStatus(offer.status) && !hasLapsed(offer.expires_at, now)
}

/** Still says pending/viewed, but the deadline has passed: shown as expired. */
export function isLapsedOffer(offer: OfferLiveness, now: Date = new Date()): boolean {
  return hasLiveStatus(offer.status) && hasLapsed(offer.expires_at, now)
}

/**
 * The offer commits its musician to this gig: accepted, or live. Used where a
 * musician counts as "taken" (next-in-line exclusions, schedule conflicts).
 */
export function isActiveOffer(offer: OfferLiveness, now: Date = new Date()): boolean {
  return offer.status === 'accepted' || isLiveOffer(offer, now)
}
