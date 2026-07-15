import { describe, it, expect } from 'vitest'
import {
  parseQuestionnaire,
  parseQuestionnaireTraced,
  parseSongList,
  parseIntake,
  looksLikeQuestionnaire,
  type ParsedSong,
  type ParsedQuestionnaireTraced,
} from '../parser'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The foolproof invariant: every non-empty input line is accounted for. */
function assertEveryLineAccountedFor(rawText: string, traced: ParsedQuestionnaireTraced) {
  const lines = rawText.trim().split('\n').map((l) => l.trim())
  expect(traced.lineDispositions.length).toBe(lines.length)
  lines.forEach((line, i) => {
    if (line === '') {
      expect(traced.lineDispositions[i]).toBe('empty')
    } else {
      // A non-empty line must land in a real bucket — never silently dropped.
      expect(traced.lineDispositions[i], `line ${i + 1} unaccounted: "${line}"`).not.toBe('empty')
    }
  })
  // Every 'warning' disposition corresponds to exactly one warning message.
  const warnDisp = traced.lineDispositions.filter((d) => d === 'warning').length
  expect(warnDisp).toBe(traced.warnings.length)
}

const bySection = (songs: ParsedSong[], section: string) => songs.filter((s) => s.section === section)
const pair = (s: ParsedSong): [string, string | null] => [s.titleRaw, s.artistRaw]

// ---------------------------------------------------------------------------
// Reconstructed nichols_wedding.yaml as a realistic 17hats questionnaire.
// Curly quotes around "God Only Knows"; straight apostrophes in Guns N' Roses,
// Don't, Wouldn't; the "role- song" ceremony-other line; and a verbatim cue.
// ---------------------------------------------------------------------------
const NICHOLS_RAW = `Wedding Ceremony Music Selections

Contact Person (Name)
Krista Daniel

Contact Person (Phone Number)
314-681-4470

Will your ceremony be indoors or outdoors?
Indoors

Spotify Playlist: https://open.spotify.com/playlist/1UHDd9Ihb4Hndqba8VCE1T

Prelude Requests (select up to 10 pieces to play as guests arrive)
Somebody to Love by Queen
Faithfully by Journey
Across the Stars by John Williams
Wasted Years by Iron Maiden
Stand by me by Ben E. King
Beauty and the Beast by Celine Dion
Grow Old with You by Adam Sandler
“God Only Knows” by Beach Boys
The Longest Time by Billy Joel
Patience by Guns N' Roses

Processional - Wedding Party
Golden by KPop Demon Hunters

Processional - Bride
The Way You Make Me Feel by Michael Jackson

Ceremony - Other
Unity soil pour- Unchained melody

Processional Walking Order (list in order, first to last)
Officiant and Groom
Mothers
Bridal Party (2 pairs, 1 flower girl)
Bride and Father of the Bride

Recessional Exit Music
Wouldn't It Be Nice by Beach Boys

What are the last words the officiant will say before we begin the recessional?
It is my absolute honor to introduce for the first time as husband and wife, Justin and Maggie Poole!

Postlude Requests
I Don't Want to Miss a Thing by Aerosmith
Love Theme from the Godfather
Helena by My Chemical Romance`

describe('parseQuestionnaire — nichols reconstruction', () => {
  const result = parseQuestionnaire(NICHOLS_RAW)

  it('extracts header metadata (contact / venue / spotify)', () => {
    expect(result.contactName).toBe('Krista Daniel')
    expect(result.contactPhone).toBe('314-681-4470')
    expect(result.venueNote).toBe('Indoors')
    expect(result.spotifyUrl).toBe('https://open.spotify.com/playlist/1UHDd9Ihb4Hndqba8VCE1T')
  })

  it('parses all 10 prelude songs with title-case titles and verbatim artists', () => {
    const prelude = bySection(result.songs, 'prelude')
    expect(prelude.map(pair)).toEqual([
      ['Somebody To Love', 'Queen'],
      ['Faithfully', 'Journey'],
      ['Across The Stars', 'John Williams'],
      ['Wasted Years', 'Iron Maiden'],
      ['Stand By Me', 'Ben E. King'], // last-occurrence "by" split
      ['Beauty And The Beast', 'Celine Dion'],
      ['Grow Old With You', 'Adam Sandler'],
      ['God Only Knows', 'Beach Boys'], // curly quotes stripped
      ['The Longest Time', 'Billy Joel'],
      // Faithful reference quirk: stripQuotes removes a quote/apostrophe sitting
      // immediately before whitespace, so "Guns N' Roses" → "Guns N Roses".
      // (matcher.normArtist collapses punctuation, so matching is unaffected.)
      ['Patience', 'Guns N Roses'],
    ])
    // positions are 0-based within the section, in document order
    expect(prelude.map((s) => s.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('parses ceremony songs WITH their roles (incl. the "role- song" line)', () => {
    const ceremony = bySection(result.songs, 'ceremony')
    expect(ceremony.map((s) => [s.titleRaw, s.artistRaw, s.role])).toEqual([
      ['Golden', 'KPop Demon Hunters', 'Processional'],
      ['The Way You Make Me Feel', 'Michael Jackson', 'Bride Entrance'],
      ['Unchained Melody', null, 'Unity Soil Pour'], // ceremony-other "role- song" split
    ])
  })

  it('parses the recessional song with the apostrophe fixed ("Wouldn\'t", not "Wouldn\'T")', () => {
    const rec = bySection(result.songs, 'recessional')
    expect(rec).toHaveLength(1)
    expect(rec[0].titleRaw).toBe("Wouldn't It Be Nice")
    expect(rec[0].artistRaw).toBe('Beach Boys')
    expect(rec[0].role).toBe('Recessional')
  })

  it('parses postlude songs (artist null when the line gave none)', () => {
    const postlude = bySection(result.songs, 'postlude')
    expect(postlude.map((s) => [s.titleRaw, s.artistRaw, s.role])).toEqual([
      ["I Don't Want To Miss A Thing", 'Aerosmith', null],
      ['Love Theme From The Godfather', null, null],
      ['Helena', 'My Chemical Romance', null],
    ])
  })

  it('captures the processional walking order in order', () => {
    expect(result.processionalOrder).toEqual([
      'Officiant and Groom',
      'Mothers',
      'Bridal Party (2 pairs, 1 flower girl)',
      'Bride and Father of the Bride',
    ])
  })

  it('captures the recessional cue VERBATIM (exact characters, never reworded)', () => {
    expect(result.recessionalCue).toBe(
      'It is my absolute honor to introduce for the first time as husband and wife, Justin and Maggie Poole!'
    )
  })

  it('parses exactly 17 songs and raises no warnings on a clean questionnaire', () => {
    expect(result.songs).toHaveLength(17)
    expect(result.warnings).toEqual([])
  })

  it('accounts for every non-empty line (foolproof invariant)', () => {
    assertEveryLineAccountedFor(NICHOLS_RAW, parseQuestionnaireTraced(NICHOLS_RAW))
  })
})

// ---------------------------------------------------------------------------
// Every reception-side section type + dash lists + "Title - Artist" + skip.
// ---------------------------------------------------------------------------
const SECTIONS_RAW = `Cocktail Hour
- Fly Me to the Moon by Frank Sinatra
- La Vie en Rose - Louis Armstrong

Dinner Music
Clair de Lune - Debussy

Reception Requests
Signed, Sealed, Delivered by Stevie Wonder

Special Requests
When making your selections, keep it upbeat.
First Dance by Sarah Bareilles`

describe('parseQuestionnaire — section types, dash lists, Title-Artist, skip markers', () => {
  const traced = parseQuestionnaireTraced(SECTIONS_RAW)

  it('routes songs to cocktail_hour / dinner / reception / special', () => {
    expect(bySection(traced.songs, 'cocktail_hour').map(pair)).toEqual([
      ['Fly Me To The Moon', 'Frank Sinatra'], // dash-prefixed + "by"
      ['La Vie En Rose', 'Louis Armstrong'], // dash-prefixed + " - "
    ])
    expect(bySection(traced.songs, 'dinner').map(pair)).toEqual([['Clair De Lune', 'Debussy']])
    expect(bySection(traced.songs, 'reception').map(pair)).toEqual([
      ['Signed, Sealed, Delivered', 'Stevie Wonder'],
    ])
    expect(bySection(traced.songs, 'special').map(pair)).toEqual([['First Dance', 'Sarah Bareilles']])
  })

  it('skips the instruction line (SKIP_MARKER) without warning or dropping it', () => {
    expect(traced.warnings).toEqual([])
    // the "When making your selections..." line is disposition 'skip', not 'song'
    expect(traced.lineDispositions).toContain('skip')
    assertEveryLineAccountedFor(SECTIONS_RAW, traced)
  })
})

// ---------------------------------------------------------------------------
// Foolproof: an unclassifiable line is WARNED, never silently dropped.
// ---------------------------------------------------------------------------
const WARNINGS_RAW = `Wedding Music Selections

Here are some extra thoughts we had about the vibe.

Prelude Requests
Canon in D by Pachelbel`

describe('parseQuestionnaire — foolproof warnings', () => {
  const traced = parseQuestionnaireTraced(WARNINGS_RAW)

  it('warns on an unrecognized pre-section line and still parses the real song', () => {
    expect(traced.warnings).toHaveLength(1)
    expect(traced.warnings[0]).toContain('Here are some extra thoughts')
    expect(bySection(traced.songs, 'prelude').map(pair)).toEqual([['Canon In D', 'Pachelbel']])
  })

  it('marks the stray line as a warning and keeps the invariant', () => {
    expect(traced.lineDispositions).toContain('warning')
    assertEveryLineAccountedFor(WARNINGS_RAW, traced)
  })
})

// ---------------------------------------------------------------------------
// Single-song sections (recessional / ceremony-other) accept one song each.
// ---------------------------------------------------------------------------
describe('parseQuestionnaire — single-song sections', () => {
  it('captures a lone recessional song', () => {
    const r = parseQuestionnaire('Recessional Exit Music\nSigned Sealed Delivered by Stevie Wonder')
    const rec = r.songs.filter((s) => s.section === 'recessional')
    expect(rec).toHaveLength(1)
    expect(rec[0].role).toBe('Recessional')
  })
})

// ---------------------------------------------------------------------------
// Mode detection + song-list mode (used by the intake route via parseIntake).
// ---------------------------------------------------------------------------
describe('looksLikeQuestionnaire / parseSongList / parseIntake', () => {
  it('recognizes a questionnaire vs a plain set list', () => {
    expect(looksLikeQuestionnaire(NICHOLS_RAW)).toBe(true)
    expect(looksLikeQuestionnaire('Clocks by Coldplay\nYellow by Coldplay')).toBe(false)
  })

  it('parseSongList: single set collapses to "set_list"', () => {
    const r = parseSongList('Clocks by Coldplay\nYellow by Coldplay')
    expect(r.songs.map((s) => s.section)).toEqual(['set_list', 'set_list'])
    expect(r.songs.map(pair)).toEqual([
      ['Clocks', 'Coldplay'],
      ['Yellow', 'Coldplay'],
    ])
  })

  it('parseSongList: a blank line starts a new set', () => {
    const r = parseSongList('Clocks by Coldplay\n\nViva la Vida by Coldplay')
    expect(r.songs.map((s) => s.section)).toEqual(['set_1', 'set_2'])
  })

  it('parseIntake routes questionnaire text through the questionnaire parser', () => {
    const r = parseIntake(NICHOLS_RAW)
    expect(r.songs).toHaveLength(17)
    expect(r.recessionalCue).toContain('Justin and Maggie Poole')
  })

  it('parseIntake routes a plain list through the song-list parser', () => {
    const r = parseIntake('Clocks by Coldplay\nYellow by Coldplay')
    expect(r.songs).toHaveLength(2)
    expect(r.songs.every((s) => s.section === 'set_list')).toBe(true)
  })

  it('parseIntake warns (never throws) on empty input', () => {
    const r = parseIntake('   ')
    expect(r.songs).toEqual([])
    expect(r.warnings[0]).toMatch(/No text/i)
  })
})

// ---------------------------------------------------------------------------
// B3: inline "(*special request*)" markers (real-usage bug + feature)
// ---------------------------------------------------------------------------
// The marker phrase contains "special request", which SECTION_PATTERNS matches —
// unstripped, a song line like "Goodness of God - Bethel Music (*special
// request*)" became a phantom 'special' SECTION HEADER and the song vanished.
// The marker must be stripped before section detection and carried as a flag.

describe('special request markers', () => {
  it("parses the real-world line: song + (*special request*) under a bride's entrance header", () => {
    const text = [
      "Processional - Bride's Entrance (select one piece)",
      'Goodness of God - Bethel Music (*special request*)',
    ].join('\n')
    const traced = parseQuestionnaireTraced(text)
    assertEveryLineAccountedFor(text, traced)
    expect(traced.songs).toHaveLength(1)
    expect(traced.songs[0]).toMatchObject({
      section: 'ceremony',
      role: 'Bride Entrance',
      titleRaw: 'Goodness Of God',
      artistRaw: 'Bethel Music',
      specialRequest: true,
    })
    expect(traced.lineDispositions[1]).toBe('song') // NOT 'section'
    expect(traced.warnings).toHaveLength(0)
  })

  it('a plain "Special Requests" section header is still a header, never stripped', () => {
    const text = ['Special Requests', 'Fly Me to the Moon - Sinatra'].join('\n')
    const traced = parseQuestionnaireTraced(text)
    expect(traced.lineDispositions[0]).toBe('section')
    expect(traced.songs).toHaveLength(1)
    expect(traced.songs[0]).toMatchObject({ section: 'special', specialRequest: false })
  })

  it('recognizes the paren and bare-asterisk variants', () => {
    const text = [
      'Prelude Requests',
      'My Heart Will Go On - Celine Dion (special request)',
      'A Sky Full of Stars *special request*',
    ].join('\n')
    const traced = parseQuestionnaireTraced(text)
    expect(traced.songs).toHaveLength(2)
    expect(traced.songs[0]).toMatchObject({ titleRaw: 'My Heart Will Go On', artistRaw: 'Celine Dion', specialRequest: true })
    expect(traced.songs[1]).toMatchObject({ titleRaw: 'A Sky Full Of Stars', specialRequest: true })
  })

  it('a marker-only line is boilerplate — skipped, never warned, never a song', () => {
    const text = ['Prelude Requests', '(*special request*)', 'Canon in D - Pachelbel'].join('\n')
    const traced = parseQuestionnaireTraced(text)
    expect(traced.lineDispositions[1]).toBe('skip')
    expect(traced.songs).toHaveLength(1)
    expect(traced.songs[0]).toMatchObject({ titleRaw: 'Canon In D', specialRequest: false })
    expect(traced.warnings).toHaveLength(0)
  })

  it('unmarked songs never carry the flag', () => {
    const traced = parseQuestionnaireTraced(['Prelude Requests', 'Yellow - Coldplay'].join('\n'))
    expect(traced.songs[0].specialRequest).toBe(false)
  })

  it('song-list mode carries the flag too', () => {
    const r = parseSongList('Clocks - Coldplay\nGoodness of God - Bethel Music (*special request*)')
    expect(r.songs).toHaveLength(2)
    expect(r.songs[0].specialRequest).toBe(false)
    expect(r.songs[1]).toMatchObject({ titleRaw: 'Goodness Of God', artistRaw: 'Bethel Music', specialRequest: true })
  })
})
