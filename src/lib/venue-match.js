/*
 * The one rule for deciding whether typed venue text names a venue we already have.
 *
 * Written as CommonJS on purpose: the app imports it through `@/lib/venue-match`
 * (tsconfig has allowJs) and scripts/link-service-venues.js requires it directly.
 * One implementation, so a backfill can never link a gig the picker would have left
 * alone, or the reverse.
 *
 * Matching is deliberately conservative — case and spacing only, punctuation intact.
 * Stripping punctuation as well was measured against the live data and linked exactly
 * the same gigs, so the looser rule buys nothing and risks collapsing two real places
 * ("Stage A" / "Stage-A") into one.
 *
 * Callers must pass a venue list already scoped to the right organization. Venues are
 * per-org; organizations.library_org_id shares the music library only and must never
 * be followed to reach a venue.
 */

/**
 * Fold a venue name to its comparison key. For matching only — never store or
 * display the result.
 * @param {string | null | undefined} name
 * @returns {string}
 */
function normalizeVenueName(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * @template {{ id: string, name: string }} V
 * @param {string | null | undefined} typedName
 * @param {readonly V[] | null | undefined} savedVenues — already scoped to one org
 * @returns {{ venue: V | null, candidates: V[] }}
 *   `venue` is set only when exactly one saved venue matches. When several tie, the
 *   caller gets them in `candidates` to show the admin, because guessing between
 *   same-named venues is how musicians end up at the wrong address.
 */
function matchSavedVenue(typedName, savedVenues) {
  const key = normalizeVenueName(typedName)
  if (!key) return { venue: null, candidates: [] }

  const candidates = (savedVenues || []).filter(
    (v) => v && normalizeVenueName(v.name) === key
  )

  return {
    venue: candidates.length === 1 ? candidates[0] : null,
    candidates,
  }
}

module.exports = { normalizeVenueName, matchSavedVenue }
