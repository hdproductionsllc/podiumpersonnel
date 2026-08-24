/**
 * Matcher unit tests — the Phase B improvements over the Mac system.
 *
 * Covers the four upgrades layered onto the propose-only matcher:
 *   1. match-time loose fold (ampersand bridge) + apostrophe parity
 *   2. similarity best-guesses so a 'missing' row still carries candidates
 *   3. part-gap helpers (missing core parts / substitute coverage)
 *   4. ensemble-aware ranking + label→canon folding
 * plus the pre-existing tier/artist behavior these sit alongside.
 */
import { describe, it, expect } from 'vitest'
import {
  matchSong,
  canonicalEnsemble,
  partGap,
  type MatchIndex,
  type RepertoireRow,
  type PartAvailability,
} from '../matcher'
import { normTitle } from '../normalize'

// --- helpers ----------------------------------------------------------------

let idSeq = 0
function work(title: string, artist: string | null = null, ensemble = 'quartet'): RepertoireRow {
  idSeq += 1
  return { id: `rep-${idSeq}`, title, artist, ensemble, norm_title: normTitle(title) }
}

function index(rows: RepertoireRow[], aliases: MatchIndex['aliases'] = []): MatchIndex {
  return { repertoire: rows, aliases }
}

// --- tier waterfall ---------------------------------------------------------

describe('matchSong — tier waterfall', () => {
  it('exact norm_title is a clean single match (score 100)', () => {
    const rows = [work('Canon in D', 'Pachelbel'), work('Air on the G String', 'Bach')]
    const res = matchSong({ titleRaw: 'Canon in D' }, index(rows))
    expect(res.status).toBe('matched')
    expect(res.candidates[0].via).toBe('exact')
    expect(res.candidates[0].score).toBe(100)
    expect(res.candidates[0].title).toBe('Canon in D')
  })

  it('resolves a known alias when the exact tier misses (score 85)', () => {
    const musetta = work("Musetta's Waltz", 'Puccini')
    const res = matchSong(
      { titleRaw: "Quando m'en vo" },
      index([musetta], [{ alias_norm: normTitle("Quando m'en vo"), repertoire_id: musetta.id }])
    )
    expect(res.status).toBe('matched')
    expect(res.candidates[0].via).toBe('alias')
    expect(res.candidates[0].score).toBe(85)
  })

  it('apostrophes are already folded, so "cant" reaches "Can\'t" at the exact tier', () => {
    const rows = [work("Can't Help Falling in Love", 'Elvis Presley')]
    const res = matchSong({ titleRaw: 'Cant Help Falling in Love' }, index(rows))
    expect(res.status).toBe('matched')
    expect(res.candidates[0].via).toBe('exact')
  })
})

// --- upgrade 1: match-time loose fold --------------------------------------

describe('matchSong — match-time loose fold (ampersand bridge)', () => {
  it('bridges client "and" to a library "&" via the loose tier', () => {
    // Library stores the ampersand form; base norm folds it to "love marriage".
    const row = work('Love & Marriage', 'Sinatra')
    expect(row.norm_title).toBe('love marriage')
    const res = matchSong({ titleRaw: 'Love and Marriage' }, index([row]))
    expect(res.status).toBe('matched')
    expect(res.candidates[0].via).toBe('loose')
    expect(res.candidates[0].score).toBe(80)
  })

  it('bridges client "&" to a library "and" too (symmetric)', () => {
    const row = work('Love and Marriage', 'Sinatra')
    const res = matchSong({ titleRaw: 'Love & Marriage' }, index([row]))
    expect(res.status).toBe('matched')
    expect(res.candidates[0].via).toBe('loose')
  })

  it('does not fire the loose tier when the base norm already matches', () => {
    const row = work('Clair de Lune', 'Debussy')
    const res = matchSong({ titleRaw: 'Clair de Lune' }, index([row]))
    expect(res.candidates[0].via).toBe('exact')
  })
})

// --- upgrade 2: similarity best-guesses ------------------------------------

describe('matchSong — similarity best-guesses for missing rows', () => {
  it('a missing title still carries ranked "did you mean" candidates', () => {
    const rows = [
      work('Bohemian Rhapsody', 'Queen'),
      work('Bohemian Like You', 'The Dandy Warhols'),
      work('Somewhere Over the Rainbow', 'Arlen'),
    ]
    const res = matchSong({ titleRaw: 'Bohemian Rap City' }, index(rows))
    expect(res.status).toBe('missing')
    expect(res.candidates.length).toBeGreaterThan(0)
    // "bohemian" overlap ranks the two Bohemian works; the Rainbow one is filtered out.
    expect(res.candidates.map((c) => c.title)).toContain('Bohemian Rhapsody')
    expect(res.candidates.every((c) => c.via === 'similarity')).toBe(true)
    // Guesses score strictly below the keyword tier so they never look like matches.
    expect(res.candidates.every((c) => c.score < 60)).toBe(true)
    // Still unresolved — a guess is not a match.
    expect(res.status).toBe('missing')
  })

  it('returns no guesses when nothing clears the similarity floor', () => {
    const rows = [work('Canon in D', 'Pachelbel')]
    const res = matchSong({ titleRaw: 'Purple Haze Jimi Hendrix' }, index(rows))
    expect(res.status).toBe('missing')
    expect(res.candidates).toEqual([])
  })
})

// --- upgrade 4: ensemble-aware ranking -------------------------------------

describe('matchSong — ensemble-aware ranking', () => {
  it('ranks the gig-ensemble arrangement first among equal-score candidates', () => {
    const quartet = work('Air', 'Bach', 'quartet')
    const trio = work('Air', 'Bach', 'trio')
    // Without a gig ensemble: deterministic by title/id, both ambiguous.
    const neutral = matchSong({ titleRaw: 'Air' }, index([quartet, trio]))
    expect(neutral.status).toBe('ambiguous')
    // With a trio gig: the trio arrangement sorts first.
    const trioGig = matchSong({ titleRaw: 'Air' }, index([quartet, trio]), 'trio')
    expect(trioGig.candidates[0].ensemble).toBe('trio')
    // With a quartet gig: the quartet arrangement sorts first.
    const quartetGig = matchSong({ titleRaw: 'Air' }, index([quartet, trio]), 'quartet')
    expect(quartetGig.candidates[0].ensemble).toBe('quartet')
  })

  it('ensemble is only a tiebreaker — it never outranks a higher-scored match', () => {
    const exactQuartet = work('Serenade', 'Schubert', 'quartet')
    const looseTrio = work('Serenade & Nocturne', 'Schubert', 'trio')
    // Query exact-matches the quartet; the trio would only be reachable via a
    // weaker tier. Even on a trio gig, the exact quartet wins on score.
    const res = matchSong({ titleRaw: 'Serenade' }, index([exactQuartet, looseTrio]), 'trio')
    expect(res.status).toBe('matched')
    expect(res.candidates[0].ensemble).toBe('quartet')
  })
})

// --- canonicalEnsemble ------------------------------------------------------

describe('canonicalEnsemble', () => {
  it('folds project ensemble labels to the repertoire canon', () => {
    expect(canonicalEnsemble('String Quartet')).toBe('quartet')
    expect(canonicalEnsemble('Piano Quintet')).toBe('quintet')
    expect(canonicalEnsemble('String Trio')).toBe('trio')
    expect(canonicalEnsemble('Viola Trio')).toBe('viola-trio')
    expect(canonicalEnsemble('Duo')).toBe('duo')
    expect(canonicalEnsemble('Solo')).toBe('solo')
  })

  it('is idempotent on canon values and neutral on the unknown', () => {
    expect(canonicalEnsemble('quartet')).toBe('quartet')
    expect(canonicalEnsemble('viola-trio')).toBe('viola-trio')
    expect(canonicalEnsemble(null)).toBeUndefined()
    expect(canonicalEnsemble('')).toBeUndefined()
    expect(canonicalEnsemble('Brass Band')).toBeUndefined()
  })
})

// --- upgrade 3: part-gap ----------------------------------------------------

describe('partGap', () => {
  const full: PartAvailability = { available: ['vln1', 'vln2', 'vla', 'vc'], substitutes: [] }

  it('reports no gap when all required parts are present', () => {
    expect(partGap(full, 'quartet')).toEqual([])
  })

  it('flags a missing core part for the gig ensemble', () => {
    const noVla: PartAvailability = { available: ['vln1', 'vln2', 'vc'], substitutes: [] }
    expect(partGap(noVla, 'quartet')).toEqual([{ part: 'vla', subBy: null }])
  })

  it('names the substitute instrument that covers a missing line', () => {
    const subbed: PartAvailability = {
      available: ['vln1', 'vln2', 'vc'],
      substitutes: [{ part: 'vln2', playedOn: 'vla' }],
    }
    expect(partGap(subbed, 'quartet')).toEqual([{ part: 'vla', subBy: 'vln2' }])
  })

  it('uses the ensemble-specific requirement set (trio needs no vla)', () => {
    const trioParts: PartAvailability = { available: ['vln1', 'vln2', 'vc'], substitutes: [] }
    expect(partGap(trioParts, 'trio')).toEqual([])
    expect(partGap(trioParts, 'viola-trio')).toEqual([{ part: 'vla', subBy: null }])
  })

  it('reports nothing for solo/other or when parts/ensemble are unknown', () => {
    expect(partGap(full, 'solo')).toEqual([])
    expect(partGap(full, 'other')).toEqual([])
    expect(partGap(undefined, 'quartet')).toEqual([])
    expect(partGap(full, undefined)).toEqual([])
  })
})

// --- artist rule still holds -----------------------------------------------

describe('matchSong — artist disagreement is never auto-matched', () => {
  it('a contradicting artist forces ambiguous with a warning', () => {
    const rows = [work('Ave Maria', 'Schubert')]
    const res = matchSong({ titleRaw: 'Ave Maria', artistRaw: 'Bach/Gounod' }, index(rows))
    expect(res.status).toBe('ambiguous')
    expect(res.candidates[0].artistMismatch).toBe(true)
    expect(res.warning).toBeTruthy()
  })

  it('an agreeing artist boosts the score', () => {
    const rows = [work('Ave Maria', 'Schubert')]
    const res = matchSong({ titleRaw: 'Ave Maria', artistRaw: 'Schubert' }, index(rows))
    expect(res.status).toBe('matched')
    expect(res.candidates[0].score).toBe(115) // 100 exact + 15 artist agree
  })

  it('accents fold before agreement: Saint-Saëns == Saint-Saens', () => {
    const rows = [work('The Swan', 'Camille Saint-Saens')]
    const res = matchSong({ titleRaw: 'The Swan', artistRaw: 'Camille Saint-Saëns' }, index(rows))
    expect(res.status).toBe('matched')
    expect(res.candidates[0].artistMismatch).toBe(false)
    expect(res.candidates[0].score).toBe(115)
  })
})

// --- B3: ensemble auto-resolve (same work, several arrangements) -------------
// Owner's rule from real usage: a quartet gig with quartet AND trio arrangements
// of the same work should never ask — the project context answers the question.

describe('matchSong — ensemble auto-resolve', () => {
  const arrangements = () => [
    work('Slipping Through My Fingers', 'ABBA', 'quartet'),
    work('Slipping Through My Fingers', 'ABBA', 'trio'),
  ]

  it('the gig ensemble picks among arrangements of the same work', () => {
    const res = matchSong(
      { titleRaw: 'Slipping Through My Fingers', artistRaw: 'ABBA' },
      index(arrangements()),
      'quartet'
    )
    expect(res.status).toBe('matched')
    // The auto-pick (first non-mismatch candidate) is the gig's arrangement.
    expect(res.candidates.find((c) => !c.artistMismatch)?.ensemble).toBe('quartet')
  })

  it('works without a questionnaire artist too (family still unambiguous)', () => {
    const res = matchSong({ titleRaw: 'Slipping Through My Fingers' }, index(arrangements()), 'trio')
    expect(res.status).toBe('matched')
    expect(res.candidates.find((c) => !c.artistMismatch)?.ensemble).toBe('trio')
  })

  it('stays ambiguous when no gig ensemble is known', () => {
    expect(matchSong({ titleRaw: 'Slipping Through My Fingers' }, index(arrangements())).status).toBe('ambiguous')
  })

  it('never crosses works: same title by DIFFERENT artists stays ambiguous', () => {
    const rows = [work('Hallelujah', 'Leonard Cohen', 'quartet'), work('Hallelujah', 'Handel', 'trio')]
    expect(matchSong({ titleRaw: 'Hallelujah' }, index(rows), 'quartet').status).toBe('ambiguous')
  })

  it('stays ambiguous when the gig ensemble matches more than one row', () => {
    const rows = [work('Canon in D', 'Pachelbel', 'quartet'), work('Canon in D', 'Pachelbel', 'quartet')]
    expect(matchSong({ titleRaw: 'Canon in D' }, index(rows), 'quartet').status).toBe('ambiguous')
  })

  it('stays ambiguous when NO arrangement matches the gig ensemble', () => {
    const rows = [work('Canon in D', 'Pachelbel', 'trio'), work('Canon in D', 'Pachelbel', 'duo')]
    expect(matchSong({ titleRaw: 'Canon in D' }, index(rows), 'quartet').status).toBe('ambiguous')
  })
})

// --- B3: similarity confidence bands ------------------------------------------
// Real-usage feedback: "nearly all the not-in-library flags had the right work
// as the top choice". Confident + clear-lead guesses are PROPOSED as matched
// (the review gate still shows them); suggestive ones become amber one-clicks;
// only weak resemblance stays red.

describe('matchSong — similarity confidence bands', () => {
  it('a confident unique best-guess is proposed as matched', () => {
    // "canon in d major" vs "canon in d": Dice 2·3/(4+3) ≈ 0.857 ≥ 0.8, and the
    // only rival shares no tokens — clear lead.
    const rows = [work('Canon in D', 'Pachelbel'), work('Salut d’Amour', 'Elgar')]
    const res = matchSong({ titleRaw: 'Canon in D Major' }, index(rows))
    expect(res.status).toBe('matched')
    expect(res.candidates[0].via).toBe('similarity')
    expect(res.candidates[0].title).toBe('Canon in D')
  })

  it('an agreeing artist lowers the confidence bar', () => {
    // "clair de lune debussy arrangement" vs "clair de lune": Dice 6/8 = 0.75 —
    // below the 0.8 bar alone, above the 0.7 with-artist bar.
    const rows = [work('Clair de Lune', 'Debussy')]
    const withArtist = matchSong({ titleRaw: 'Clair de Lune Debussy Arrangement', artistRaw: 'Debussy' }, index(rows))
    expect(withArtist.status).toBe('matched')
    const withoutArtist = matchSong({ titleRaw: 'Clair de Lune Debussy Arrangement' }, index(rows))
    expect(withoutArtist.status).toBe('ambiguous') // still one click, never silent
  })

  it('a contradicted artist never auto-matches, however similar', () => {
    const rows = [work('Canon in D', 'Pachelbel')]
    const res = matchSong({ titleRaw: 'Canon in D Major', artistRaw: 'Mozart' }, index(rows))
    expect(res.status).not.toBe('matched')
  })

  it('equal resemblance to two different works stays a human choice', () => {
    // "swan lake waltz" resembles both works equally (Dice 0.667 each) — no
    // clear lead, so no auto-match; suggestive band → ambiguous one-click.
    const rows = [work('The Swan Lake', 'Tchaikovsky'), work('Swan Lake Theme', 'Tchaikovsky')]
    const res = matchSong({ titleRaw: 'Swan Lake Waltz' }, index(rows))
    expect(res.status).toBe('ambiguous')
    expect(res.candidates.every((c) => c.via === 'similarity')).toBe(true)
  })

  it('confident guesses resolve arrangement by gig ensemble like exact ones', () => {
    const rows = [
      work('Canon in D', 'Pachelbel', 'quartet'),
      work('Canon in D', 'Pachelbel', 'trio'),
    ]
    const withGig = matchSong({ titleRaw: 'Canon in D Major' }, index(rows), 'trio')
    expect(withGig.status).toBe('matched')
    expect(withGig.candidates[0].ensemble).toBe('trio')
    // Without a gig ensemble the arrangement question remains — amber, not silent.
    expect(matchSong({ titleRaw: 'Canon in D Major' }, index(rows)).status).toBe('ambiguous')
  })

  it('weak resemblance stays missing, with did-you-mean guesses attached', () => {
    // "blue moon" vs "moon river theme": Dice 2/5 = 0.4 — above the floor
    // (guesses attach) but below the suggest band (row stays red).
    const rows = [work('Moon River Theme', 'Mancini')]
    const res = matchSong({ titleRaw: 'Blue Moon' }, index(rows))
    expect(res.status).toBe('missing')
    expect(res.candidates.length).toBeGreaterThan(0)
  })
})

// --- B3 round 2: junk tokens can't drive matches ------------------------------

describe('matchSong — single-character tokens are not keywords', () => {
  it('"N/a" matches nothing, even against titles containing an "n" token', () => {
    // Real misparse fallout: "N/a" folds to "n a"; the stray "n" keyword matched
    // "Patience Guns n Roses 2024" and a decomposed "Scho n Rosmarin".
    const rows = [work('Patience Guns n Roses 2024', "Guns N' Roses", 'trio'), work('Canon in D', 'Pachelbel')]
    const res = matchSong({ titleRaw: 'N/a' }, index(rows))
    expect(res.status).toBe('missing')
    expect(res.candidates).toHaveLength(0)
  })

  it('real one-letter title words still match at the exact tier', () => {
    // The keyword filter only affects the keyword tier — exact folds are intact.
    const rows = [work('Air on the G String', 'Bach')]
    expect(matchSong({ titleRaw: 'Air on the G String' }, index(rows)).status).toBe('matched')
  })
})

// ---------------------------------------------------------------------------
// Wrong-arrangement and subtitle-only regressions (Megan Graves, 2026-08-23)
// ---------------------------------------------------------------------------

describe('matchSong — the gig ensemble outranks a wrong-arrangement exact hit', () => {
  // Real library shape: the quartet chart carries "from UP" in its title, so the
  // solo cello chart is the only EXACT hit. It used to win, and a string quartet
  // was handed a cello-only part with a "missing vln1, vln2, vla" note.
  const rows = [
    work('Married Life', 'Michael Giacchino', 'solo'),
    work('Married Life from UP', 'Giacchino', 'quartet'),
  ]

  it('surfaces the quartet arrangement instead of settling on the solo chart', () => {
    const res = matchSong({ titleRaw: 'Married Life' }, index(rows), 'quartet')
    expect(res.status).toBe('ambiguous')
    expect(res.candidates[0].ensemble).toBe('quartet')
    expect(res.candidates[0].title).toBe('Married Life from UP')
    expect(res.warning).toMatch(/nothing on a quartet gig/)
  })

  it('keeps the exact hit available — it is offered, not discarded', () => {
    const res = matchSong({ titleRaw: 'Married Life' }, index(rows), 'quartet')
    expect(res.candidates.map((c) => c.ensemble)).toContain('solo')
  })

  it('does not escalate when the exact hit already plays the gig ensemble', () => {
    const res = matchSong({ titleRaw: 'Married Life' }, index(rows), 'solo')
    expect(res.status).toBe('matched')
    expect(res.candidates[0].ensemble).toBe('solo')
  })

  it('leaves a lone off-ensemble match alone when nothing better exists', () => {
    // Only a duo arrangement exists — still a match, with the part gap to show it.
    const duoOnly = [work('Somewhere Over the Rainbow', 'Israel K', 'duo')]
    const res = matchSong({ titleRaw: 'Somewhere Over the Rainbow' }, index(duoOnly), 'quartet')
    expect(res.status).toBe('matched')
  })

  it('is inert when the project never told us its ensemble', () => {
    const res = matchSong({ titleRaw: 'Married Life' }, index(rows))
    expect(res.status).toBe('matched')
    expect(res.candidates[0].ensemble).toBe('solo')
  })
})

describe('matchSong — a subtitle-only keyword hit is a lead, not a match', () => {
  it('will not confidently match a song the library does not have', () => {
    // "Everlasting Love" is a token-subset of "This Will Be (An Everlasting Love)"
    // but they are different songs — the query touches only the parenthetical.
    const rows = [work('This Will Be (An Everlasting Love)', 'Natalie Cole')]
    const res = matchSong({ titleRaw: 'Everlasting Love' }, index(rows), 'quartet')
    expect(res.status).toBe('ambiguous')
    expect(res.warning).toMatch(/only matches the subtitle/i)
    expect(res.candidates[0].title).toBe('This Will Be (An Everlasting Love)')
  })

  it('still matches when the query touches the main title', () => {
    const rows = [work('How Sweet It Is (To Be Loved By You)', 'James Taylor')]
    const res = matchSong({ titleRaw: 'How Sweet It Is' }, index(rows), 'quartet')
    expect(res.status).toBe('matched')
  })

  it('leaves parenthetical-free titles alone (Canon in D non-regression)', () => {
    const rows = [work('Pachelbel - Canon in D - Score', null)]
    const res = matchSong({ titleRaw: 'Canon in D' }, index(rows), 'quartet')
    expect(res.status).toBe('matched')
    expect(res.candidates[0].via).toBe('keyword')
  })

  it('does not fire on an exact match that happens to have a parenthetical', () => {
    const rows = [work('This Will Be (An Everlasting Love)', 'Natalie Cole')]
    const res = matchSong({ titleRaw: 'This Will Be (An Everlasting Love)' }, index(rows))
    expect(res.status).toBe('matched')
  })
})
