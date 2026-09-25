/**
 * Spotify track ranking — pure, no I/O (importable from tests and scripts).
 *
 * Owner's rule from the old system: "weird cover versions come up — it needs
 * to be the ORIGINAL". Candidates are ranked by original-ness, not raw search
 * order: the artist the client NAMED is the strongest signal, Spotify
 * popularity separates originals from covers, and karaoke/tribute/"in the
 * style of" releases are buried.
 *
 * Above all of that sits the TITLE. Spotify pads every search with unrelated
 * hits once the real matches run out ("Til There Was You" → "Bones"; "Dream On"
 * → "The One That Got Away"), and those padding tracks are often the most
 * popular results on the page. Ranking on popularity alone put them FIRST and
 * the auto-built playlist shipped them. A candidate whose title doesn't agree
 * with the song asked for is flagged `titleMatch: false` and sinks below every
 * one that does; callers never auto-pick it.
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
  /** The track's title agrees with the song searched for. A false here is a
   *  Spotify padding result — shown for manual choice, never auto-picked. */
  titleMatch: boolean
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

/**
 * A title reduced to what identifies the song: version tags (" - Remastered
 * 2009", " - Live Version"), featured artists and any bracketed aside come off,
 * then everything but letters and digits — so "Any Way You Want It" meets
 * "Anyway You Want It" and "Isn’t" meets "Isn't".
 */
export function coreTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+-\s+.*$/, '') // " - Remastered 2009", " - Cover of Aerosmith"
    .replace(/[([][^)\]]*[)\]]/g, ' ') // "(feat. Young Thug)", "[Live]"
    .replace(/\btil\b/g, 'till') // the everyday spelling of the same word
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * Does a track's title name the song searched for? Equal cores match. So does
 * containment either way, once the shorter core is long enough to mean
 * something — a medley ("Somewhere Over the Rainbow/What a Wonderful World") or
 * a classical movement ("Symphony No. 9: IV. Ode to Joy") is still that song.
 */
export function titleAgrees(trackName: string, wanted: string): boolean {
  const a = coreTitle(trackName)
  const b = coreTitle(wanted)
  if (!a || !b) return false
  if (a === b) return true
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  return shorter.length >= 6 && longer.includes(shorter)
}

/** Higher = more likely the original recording the client meant. */
export function scoreTrack(t: RawTrack, questionnaireArtist: string | null, wantedTitle: string | null = null): number {
  // Popularity is Spotify's 0–100 signal; originals dwarf covers on it.
  let score = (t.popularity ?? 0) * 0.5
  // Worth more than any popularity gap (max 50) plus the artist bonus: the
  // wrong song by the right artist ("Set Fire to the Rain" for "Rolling in the
  // Deep") must never beat the right song.
  if (wantedTitle) score += titleAgrees(t.name, wantedTitle) ? 0 : -200
  if (questionnaireArtist) {
    const q = normName(questionnaireArtist)
    const names = t.artists.map((a) => normName(a.name))
    // The client NAMED the artist — agreement is the strongest signal there is.
    const agrees = (n: string) => n === q || n.includes(q) || q.includes(n)
    // Leading artist > featured one: Piaf's own "La Vie en Rose" over a Bocelli
    // duet that credits her second.
    if (q && names.length > 0 && agrees(names[0])) score += 60
    else if (q && names.some(agrees)) score += 40
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
export function rankTracks(
  items: RawTrack[],
  questionnaireArtist: string | null,
  limit: number,
  wantedTitle: string | null = null
): TrackCandidate[] {
  const seen = new Set<string>()
  return items
    .filter((t) => (seen.has(t.uri) ? false : (seen.add(t.uri), true)))
    .map((t) => ({ t, score: scoreTrack(t, questionnaireArtist, wantedTitle) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ t }) => ({
      uri: t.uri,
      name: t.name,
      artists: t.artists.map((a) => a.name).join(', '),
      album: t.album.name,
      imageUrl: t.album.images.length > 0 ? t.album.images[t.album.images.length - 1].url : null,
      durationMs: t.duration_ms,
      titleMatch: wantedTitle ? titleAgrees(t.name, wantedTitle) : true,
    }))
}
