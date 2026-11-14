/** Missing music must never silently produce a complete-looking musician book.
 * Explicit silent slots and special requests remain playlist-only exceptions.
 * The optional score book is intentionally partial and is not a required part.
 * This checks file coverage, not matching editions or musical suitability.
 */
export const BOOK_NOTES = 'Book from confirmed client selections \u2014 playlist first, songs in performance order.'

interface BookCoverage {
  parts: Array<{ part: string }>
  songs: Array<{
    title: string
    noMusic: boolean
    specialRequest: boolean
    files: Record<string, unknown>
  }>
}

export function getBookBlockers(manifest: BookCoverage): string[] {
  return manifest.songs.flatMap((song) => {
    if (song.noMusic || song.specialRequest) return []
    const missing = manifest.parts.filter(({ part }) => !song.files[part]).map(({ part }) => part)
    return missing.length
      ? [`"${song.title}": missing ${missing.join(', ')}. Upload the correct parts or re-match this song before building or publishing.`]
      : []
  })
}

export function assertCompleteBooks(manifest: BookCoverage): void {
  const blockers = getBookBlockers(manifest)
  if (blockers.length) throw new Error(`Books are incomplete. ${blockers.join(' ')}`)
}
