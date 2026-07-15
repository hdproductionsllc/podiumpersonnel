import { describe, it, expect } from 'vitest'
import { matchSong, type RepertoireRow, type AliasRow, type MatchIndex } from '@/lib/intake/matcher'
import { normTitle } from '@/lib/intake/normalize'

// Build a repertoire row with norm_title derived the SAME way the indexer does.
function rep(id: string, title: string, artist: string | null, ensemble = 'quartet'): RepertoireRow {
  return { id, title, artist, ensemble, norm_title: normTitle(title) }
}

const CANON = rep('r-canon', 'Canon in D', 'Pachelbel')
const AVE_BACH = rep('r-ave-bach', 'Ave Maria', 'Bach/Gounod')
const AVE_SCHUBERT = rep('r-ave-schubert', 'Ave Maria', 'Schubert')
const AIR = rep('r-air', 'Air on the G String', 'J.S. Bach')
const GODFATHER = rep('r-godfather', 'Godfather Theme', 'Nino Rota')
const STAND = rep('r-stand', 'Stand by Me', 'Ben E. King')

const index: MatchIndex = {
  repertoire: [CANON, AVE_BACH, AVE_SCHUBERT, AIR, GODFATHER, STAND],
  aliases: [
    { alias_norm: normTitle('Love Theme from The Godfather'), repertoire_id: 'r-godfather' },
  ] as AliasRow[],
}

describe('matchSong — exact norm_title', () => {
  it('matches a single exact title with no artist supplied', () => {
    const r = matchSong({ titleRaw: 'Canon in D' }, index)
    expect(r.status).toBe('matched')
    expect(r.candidates).toHaveLength(1)
    expect(r.candidates[0].repertoireId).toBe('r-canon')
    expect(r.candidates[0].via).toBe('exact')
    expect(r.candidates[0].score).toBe(100)
  })

  it('matches through curly-quote / casing differences (same normalization)', () => {
    const r = matchSong({ titleRaw: 'CANON IN D' }, index)
    expect(r.status).toBe('matched')
    expect(r.candidates[0].repertoireId).toBe('r-canon')
  })

  it('boosts score when the supplied artist agrees', () => {
    const r = matchSong({ titleRaw: 'Canon in D', artistRaw: 'Pachelbel' }, index)
    expect(r.status).toBe('matched')
    expect(r.candidates[0].score).toBe(115)
    expect(r.candidates[0].artistMismatch).toBe(false)
  })

  it('agrees on partial artist names (Ben E King ~ Ben E. King)', () => {
    const r = matchSong({ titleRaw: 'Stand by Me', artistRaw: 'Ben E King' }, index)
    expect(r.status).toBe('matched')
    expect(r.candidates[0].artistMismatch).toBe(false)
    expect(r.candidates[0].score).toBe(115)
  })
})

describe('matchSong — ambiguous', () => {
  it('flags multiple exact-title works (same title, different artists)', () => {
    const r = matchSong({ titleRaw: 'Ave Maria' }, index)
    expect(r.status).toBe('ambiguous')
    expect(r.candidates).toHaveLength(2)
    expect(r.warning).toMatch(/possible matches/i)
  })

  it('picks the agreeing work when the artist disambiguates', () => {
    const r = matchSong({ titleRaw: 'Ave Maria', artistRaw: 'Schubert' }, index)
    // Only the Schubert row is auto-matchable; the Bach/Gounod row is a mismatch.
    expect(r.status).toBe('matched')
    expect(r.candidates[0].repertoireId).toBe('r-ave-schubert')
    expect(r.candidates[0].artistMismatch).toBe(false)
    // The other candidate is still returned, flagged as an artist mismatch.
    const bach = r.candidates.find((c) => c.repertoireId === 'r-ave-bach')
    expect(bach?.artistMismatch).toBe(true)
  })
})

describe('matchSong — artist-mismatch rule (never guess the composer)', () => {
  it('does NOT auto-match when the sole candidate disagrees on artist', () => {
    const r = matchSong({ titleRaw: 'Canon in D', artistRaw: 'Beethoven' }, index)
    expect(r.status).toBe('ambiguous')
    expect(r.candidates).toHaveLength(1)
    expect(r.candidates[0].artistMismatch).toBe(true)
    expect(r.warning).toMatch(/doesn't match the library artist/i)
  })

  it('flags ambiguous when every exact candidate disagrees on artist', () => {
    const r = matchSong({ titleRaw: 'Ave Maria', artistRaw: 'Beethoven' }, index)
    expect(r.status).toBe('ambiguous')
    expect(r.candidates.every((c) => c.artistMismatch)).toBe(true)
  })
})

describe('matchSong — alias tier', () => {
  it('resolves a known alias to its canonical work (score 85)', () => {
    const r = matchSong({ titleRaw: 'Love Theme from The Godfather' }, index)
    expect(r.status).toBe('matched')
    expect(r.candidates[0].repertoireId).toBe('r-godfather')
    expect(r.candidates[0].via).toBe('alias')
    expect(r.candidates[0].score).toBe(85)
  })
})

describe('matchSong — keyword fallback', () => {
  it('matches when all title keywords (minus stopwords) are present', () => {
    // "G String Air" → keywords g/string/air all in "air on the g string"
    const r = matchSong({ titleRaw: 'G String Air' }, index)
    expect(r.status).toBe('matched')
    expect(r.candidates[0].repertoireId).toBe('r-air')
    expect(r.candidates[0].via).toBe('keyword')
    expect(r.candidates[0].score).toBe(60)
  })

  it('does not keyword-match when a keyword is absent (falls to the similarity tier)', () => {
    // "waltz" is absent from every row, so the keyword tier misses. The
    // similarity tier takes over: a suggestive-but-not-confident resemblance is
    // surfaced as 'ambiguous' (amber, one-click pick) — never a silent 'matched',
    // and the candidates are guesses, not keyword/exact hits. The row still
    // requires a human to resolve it.
    const r = matchSong({ titleRaw: 'G String Waltz' }, index)
    expect(r.status).not.toBe('matched')
    expect(['ambiguous', 'missing']).toContain(r.status)
    expect(r.candidates.length).toBeGreaterThan(0)
    expect(r.candidates.every((c) => c.via === 'similarity')).toBe(true)
  })
})

describe('matchSong — missing', () => {
  it('returns missing for an unknown title', () => {
    const r = matchSong({ titleRaw: 'A Totally Unknown Song' }, index)
    expect(r.status).toBe('missing')
    expect(r.candidates).toHaveLength(0)
  })

  it('returns missing for empty / punctuation-only input', () => {
    expect(matchSong({ titleRaw: '' }, index).status).toBe('missing')
    expect(matchSong({ titleRaw: '   ' }, index).status).toBe('missing')
  })
})

describe('matchSong — waterfall short-circuits', () => {
  it('uses exact tier and does not fall through to keyword when exact hits', () => {
    const r = matchSong({ titleRaw: 'Canon in D' }, index)
    expect(r.candidates.every((c) => c.via === 'exact')).toBe(true)
  })

  it('is deterministic regardless of repertoire input order', () => {
    const shuffled: MatchIndex = { repertoire: [...index.repertoire].reverse(), aliases: index.aliases }
    const a = matchSong({ titleRaw: 'Ave Maria' }, index)
    const b = matchSong({ titleRaw: 'Ave Maria' }, shuffled)
    expect(a.candidates.map((c) => c.repertoireId)).toEqual(b.candidates.map((c) => c.repertoireId))
  })
})
