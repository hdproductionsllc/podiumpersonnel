/**
 * Spotify track ranking — pure, no I/O (importable from tests and scripts).
 *
 * Owner's rule from the old system: "weird cover versions come up — it needs
 * to be the ORIGINAL". Candidates are ranked by original-ness, not raw search
 * order: the artist the client NAMED is the strongest signal, Spotify
 * popularity separates originals from covers, and karaoke/tribute/"in the
 * style of" releases are buried.
 */

export interface RawTrack {
  uri: string
  name: string
  duration_ms: number
  popularity?: number
  artists: Array<{ name: string }>
  album: { name: string; images: Array<{ url: string }>; album_type?: string }
}

export interface TrackCandidate {
  uri: string
  name: string
  artists: string
  album: string
  imageUrl: string | null
  durationMs: number
}

const COVER_PENALTIES: Array<[RegExp, number]> = [
  [/karaoke|tribute|made famous|in the style of|originally performed|as made popular|backing track/i, -100],
  [/\bcovers?\b|covered version/i, -50],
  [/instrumental|acoustic version|piano version|string quartet|music box|lullab|8[- ]?bit|kids?\s+version/i, -25],
  [/\((?:live|en vivo)\b|- live\b|\blive at\b/i, -10],
]

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Higher = more likely the original recording the client meant. */
export function scoreTrack(t: RawTrack, questionnaireArtist: string | null): number {
  // Popularity is Spotify's 0–100 signal; originals dwarf covers on it.
  let score = (t.popularity ?? 0) * 0.5
  if (questionnaireArtist) {
    const q = normName(questionnaireArtist)
    const names = t.artists.map((a) => normName(a.name))
    // The client NAMED the artist — agreement is the strongest signal there is.
    if (q && names.some((n) => n === q || n.includes(q) || q.includes(n))) score += 60
    else score -= 20
  }
  const hay = `${t.name} ${t.album.name} ${t.artists.map((a) => a.name).join(' ')}`
  for (const [re, pts] of COVER_PENALTIES) {
    if (re.test(hay)) score += pts
  }
  if (t.album.album_type === 'compilation') score -= 5
  return score
}

/** Rank raw search results and shape the top `limit` into UI candidates. */
export function rankTracks(items: RawTrack[], questionnaireArtist: string | null, limit: number): TrackCandidate[] {
  return items
    .map((t) => ({ t, score: scoreTrack(t, questionnaireArtist) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ t }) => ({
      uri: t.uri,
      name: t.name,
      artists: t.artists.map((a) => a.name).join(', '),
      album: t.album.name,
      imageUrl: t.album.images.length > 0 ? t.album.images[t.album.images.length - 1].url : null,
      durationMs: t.duration_ms,
    }))
}
