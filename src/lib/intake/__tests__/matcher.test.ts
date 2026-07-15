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
})
