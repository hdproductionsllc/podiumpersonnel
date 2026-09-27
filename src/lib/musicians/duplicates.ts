/**
 * Duplicate-detection helpers for the musicians roster.
 *
 * Pure and framework-free: no React, no Supabase client. Cross-org duplicates
 * are by design in this app (organizations can legitimately share a musician),
 * so this module never filters by organization_id — it only ever compares the
 * candidate against whatever roster array the caller passes in. Every caller
 * is responsible for passing a roster already scoped to a single
 * organization; comparing across orgs is a caller mistake, not something this
 * module can catch.
 */

export type DuplicateReason = 'email' | 'phone' | 'name'

/** The subset of a `musicians` row this module needs, using the table's own field names. */
export interface MusicianDuplicateFields {
  first_name: string
  last_name: string
  email?: string | null
  phone?: string | null
}

/** A roster entry — the same fields, plus the id needed to exclude/identify it. */
export interface MusicianRosterEntry extends MusicianDuplicateFields {
  id: string
}

export interface PossibleDuplicate<T extends MusicianRosterEntry = MusicianRosterEntry> {
  musician: T
  reasons: DuplicateReason[]
}

/** Trims and lowercases an email; blank/whitespace-only/missing becomes null so it never matches another blank email. */
export function normalizeEmail(email?: string | null): string | null {
  if (!email) return null
  const trimmed = email.trim().toLowerCase()
  return trimmed === '' ? null : trimmed
}

/**
 * Digits only, keeping the last 10 (drops a leading "+1" country code).
 * Fewer than 7 digits is too ambiguous to treat as a phone number (could be a
 * partial number or stray digits in a notes field), so it normalizes to null.
 */
export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7) return null
  return digits.slice(-10)
}

/**
 * Lowercased "first last" with accents stripped (NFD + drop combining marks),
 * punctuation removed outright (not replaced with a space, so "O'Brien" folds
 * to "obrien" the same as "OBrien"), and whitespace collapsed.
 */
export function normalizeName(first?: string | null, last?: string | null): string {
  const raw = `${first || ''} ${last || ''}`
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Finds roster entries that might be the same person as `candidate`, within
 * whatever roster array is passed in (see module note on org-scoping above).
 *
 * Matches on email, phone, or full name — empty/null fields never match each
 * other (two musicians with no email are not a match). Results are sorted
 * strongest reason first: email > phone > name; ties keep roster order.
 */
export function findPossibleDuplicates<T extends MusicianRosterEntry>(
  candidate: MusicianDuplicateFields,
  roster: readonly T[],
  options: { excludeId?: string } = {}
): PossibleDuplicate<T>[] {
  const { excludeId } = options

  const candidateEmail = normalizeEmail(candidate.email)
  const candidatePhone = normalizePhone(candidate.phone)
  const candidateName = normalizeName(candidate.first_name, candidate.last_name)

  const matches: PossibleDuplicate<T>[] = []

  for (const musician of roster) {
    if (excludeId && musician.id === excludeId) continue

    const reasons: DuplicateReason[] = []

    const musicianEmail = normalizeEmail(musician.email)
    if (candidateEmail && musicianEmail && candidateEmail === musicianEmail) {
      reasons.push('email')
    }

    const musicianPhone = normalizePhone(musician.phone)
    if (candidatePhone && musicianPhone && candidatePhone === musicianPhone) {
      reasons.push('phone')
    }

    const musicianName = normalizeName(musician.first_name, musician.last_name)
    if (candidateName && musicianName && candidateName === musicianName) {
      reasons.push('name')
    }

    if (reasons.length > 0) {
      matches.push({ musician, reasons })
    }
  }

  const strength = (reasons: DuplicateReason[]): number => {
    if (reasons.includes('email')) return 3
    if (reasons.includes('phone')) return 2
    return 1
  }

  return matches
    .map((match, index) => ({ match, index }))
    .sort((a, b) => strength(b.match.reasons) - strength(a.match.reasons) || a.index - b.index)
    .map(({ match }) => match)
}
