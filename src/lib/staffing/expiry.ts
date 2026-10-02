/**
 * How long a musician has to answer an offer: the one place the defaults live.
 *
 * Before this, each offer writer did its own arithmetic: the Send Offer dialog
 * (48 hours recommended, 4 hours for ASAP), the "next in line" fallback in the
 * offers list (7 days) and the substitute approval (7 days). The numbers are
 * unchanged; they are just named here, and every writer resolves its choice
 * through resolveExpiresAt().
 *
 * Pure and dependency-free, so the browser dialog and the server share it.
 */

export type OfferExpiry =
  /** Answer within this many hours of sending. */
  | { kind: 'hours'; hours: number }
  /** Answer by this instant (ISO). The dialog's "Custom date" is end of that day, admin's local time. */
  | { kind: 'until'; at: string }
  /**
   * No deadline chosen: open until answered or withdrawn, but never past the
   * gig's first service start (capNoExpiryAtGigStart, applied by createOffer).
   */
  | { kind: 'none' }

const HOUR_MS = 60 * 60 * 1000

/** The Send Offer dialog's "48 hours (recommended)". Also what the API uses when no expiry is given. */
export const DEFAULT_OFFER_EXPIRY: OfferExpiry = { kind: 'hours', hours: 48 }

/** "ASAP (4 hours)" in the dialog. */
export const ASAP_OFFER_EXPIRY: OfferExpiry = { kind: 'hours', hours: 4 }

/** The offers list's one-click "send to next in line" fallback: one week. */
export const NEXT_IN_LINE_OFFER_EXPIRY: OfferExpiry = { kind: 'hours', hours: 7 * 24 }

/** A substitute's offer, made when an admin approves a sub request: one week. */
export const SUBSTITUTE_OFFER_EXPIRY: OfferExpiry = { kind: 'hours', hours: 7 * 24 }

/** Longest deadline the API accepts, so a typo cannot create a decade-long offer. */
export const MAX_OFFER_EXPIRY_HOURS = 366 * 24

/** The instant an offer sent at `now` stops being answerable, or null for no deadline. */
export function resolveExpiresAt(expiry: OfferExpiry, now: number = Date.now()): string | null {
  switch (expiry.kind) {
    case 'hours':
      return new Date(now + expiry.hours * HOUR_MS).toISOString()
    case 'until':
      return new Date(expiry.at).toISOString()
    case 'none':
      return null
  }
}

/**
 * "No expiration" means "until the gig starts" (the plan, B1.2): an offer
 * nobody answers must not hold a chair past the moment it is needed. An offer
 * with no deadline gets the start of the gig's first service still ahead; an
 * offer with a deadline is returned unchanged, and so is one on a gig with no
 * service still to come (there is nothing to cap it at).
 *
 * New offers only: createOffer applies it; existing rows are not rewritten.
 */
export function capNoExpiryAtGigStart(
  expiresAt: string | null,
  serviceStarts: readonly (string | null | undefined)[],
  now: number = Date.now()
): string | null {
  if (expiresAt !== null) return expiresAt
  const ahead = serviceStarts
    .map((s) => (s ? new Date(s).getTime() : NaN))
    .filter((t) => Number.isFinite(t) && t > now)
  return ahead.length > 0 ? new Date(Math.min(...ahead)).toISOString() : null
}

/**
 * The dialog's "Response deadline" select, as an expiry. `value` is the
 * select's value ('0.17' ASAP, '1' / '2' / '7' days, 'custom', '' none) and
 * `customDate` the date input (YYYY-MM-DD). A custom date means the end of that
 * day in the admin's own timezone, so this must run in the browser.
 * Returns null for "Custom date" with no date picked yet.
 */
export function expiryFromDialogChoice(value: string, customDate: string): OfferExpiry | null {
  if (value === '') return { kind: 'none' }
  if (value === '0.17') return ASAP_OFFER_EXPIRY
  if (value === 'custom') {
    return customDate ? { kind: 'until', at: new Date(customDate + 'T23:59:59').toISOString() } : null
  }
  const days = parseInt(value)
  return Number.isFinite(days) && days > 0 ? { kind: 'hours', hours: days * 24 } : { kind: 'none' }
}

/** Validate an expiry from a request body. Returns null when it is malformed. */
export function parseOfferExpiry(input: unknown): OfferExpiry | null {
  if (!input || typeof input !== 'object') return null
  const e = input as Record<string, unknown>
  if (e.kind === 'none') return { kind: 'none' }
  if (e.kind === 'hours') {
    const hours = e.hours
    if (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0 || hours > MAX_OFFER_EXPIRY_HOURS) return null
    return { kind: 'hours', hours }
  }
  if (e.kind === 'until') {
    if (typeof e.at !== 'string' || Number.isNaN(new Date(e.at).getTime())) return null
    return { kind: 'until', at: e.at }
  }
  return null
}
