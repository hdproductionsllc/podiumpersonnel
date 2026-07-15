/**
 * Repertoire matcher for the intake import (Book Builder Phase B).
 *
 * Pure, deterministic. Given ONE parsed questionnaire song and the org's
 * repertoire + alias index, it PROPOSES matches — it never decides. The review
 * screen is the human-confirm gate; this function only ranks candidates and
 * flags anything that isn't a clean single hit as 'ambiguous' so a person looks.
 *
 * Match waterfall (first tier that yields candidates wins — mirrors the owner's
 * mental model and the Phase A index shape):
 *   1. exact norm_title match      (score 100)
 *   2. title_aliases lookup        (score  85)
 *   3. keyword fallback            (score  60) — every title keyword (minus the
 *      stopwords the/a/of) present as a whole token in the candidate's norm_title
 *
 * Artist rule (owner's "never guess the artist"): a candidate whose library
 * artist DISAGREES with the questionnaire artist can never be an auto-match. If
 * the only candidates disagree on artist, the result is 'ambiguous' with a
 * warning — never silently matched to the wrong composer. Artist AGREEMENT only
 * boosts the score (breaks ties toward the right work); it is never required,
 * because most questionnaire songs give no artist at all.
 */

import { normTitle } from './normalize'

export interface RepertoireRow {
  id: string
  title: string
  artist: string | null
  ensemble: string
  norm_title: string
}

export interface AliasRow {
  alias_norm: string
  repertoire_id: string
}

export interface MatchIndex {
  repertoire: RepertoireRow[]
  aliases: AliasRow[]
}

export interface SongInput {
  titleRaw: string
  artistRaw?: string | null
}

export type MatchStatus = 'matched' | 'ambiguous' | 'missing'

export interface MatchCandidate {
  repertoireId: string
  title: string
  artist: string | null
  ensemble: string
  score: number
  /** 'exact' | 'alias' | 'keyword' — how this candidate was reached. */
  via: 'exact' | 'alias' | 'keyword'
  /** True when a questionnaire artist was given and it disagrees with this row. */
  artistMismatch: boolean
}

export interface MatchResult {
  status: MatchStatus
  candidates: MatchCandidate[]
  /** Present when the human must look — e.g. an artist disagreement. */
  warning?: string
}

// Stopwords dropped from keyword matching. Deliberately tiny (the owner's rule
// of thumb): only the highest-frequency articles/preposition, never content
// words, so "Air on the G String" still keys on air/g/string.
const STOPWORDS = new Set(['the', 'a', 'of'])

const SCORE = { exact: 100, alias: 85, keyword: 60 } as const
const ARTIST_AGREE_BOOST = 15
const MAX_KEYWORD_CANDIDATES = 10

/** Normalize an artist for agreement testing (lowercase, punctuation → space). */
function normArtist(a: string | null | undefined): string {
  if (!a) return ''
  return a
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Do two artists agree? Conservative: equal, or one wholly contains the other
 * as a token-boundary substring (so "Ben E King" agrees with "Ben E. King" and
 * "Bach" agrees with "J.S. Bach"). Anything else is a disagreement.
 */
function artistsAgree(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  // Whole-token containment: " king " inside " ben e king ", " bach " inside
  // " j s bach ". The space padding stops "art" matching inside "mozart".
  const pa = ` ${a} `
  const pb = ` ${b} `
  return pa.includes(pb) || pb.includes(pa)
}

function keywordsOf(nt: string): string[] {
  return nt.split(' ').filter((w) => w && !STOPWORDS.has(w))
}

/**
 * Deterministic ordering: score desc, then title asc, then repertoireId asc.
 * Never rely on input array order — the DB may return rows in any order.
 */
function sortCandidates(cands: MatchCandidate[]): MatchCandidate[] {
  return cands.sort(
    (x, y) =>
      y.score - x.score ||
      x.title.localeCompare(y.title) ||
      x.repertoireId.localeCompare(y.repertoireId)
  )
}

export function matchSong(song: SongInput, index: MatchIndex): MatchResult {
  const nt = normTitle(song.titleRaw || '')
  const artistQ = normArtist(song.artistRaw)

  if (!nt) {
    return { status: 'missing', candidates: [] }
  }

  const repertoire = index.repertoire || []
  const aliases = index.aliases || []

  // Build a candidate from a repertoire row, scoring artist agreement/mismatch.
  const build = (row: RepertoireRow, via: MatchCandidate['via']): MatchCandidate => {
    const artistLib = normArtist(row.artist)
    let score: number = SCORE[via]
    let artistMismatch = false
    if (artistQ && artistLib) {
      if (artistsAgree(artistQ, artistLib)) score += ARTIST_AGREE_BOOST
      else artistMismatch = true
    }
    return {
      repertoireId: row.id,
      title: row.title,
      artist: row.artist,
      ensemble: row.ensemble,
      score,
      via,
      artistMismatch,
    }
  }

  // --- Tier 1: exact norm_title ---
  let candidates: MatchCandidate[] = repertoire
    .filter((r) => r.norm_title === nt)
    .map((r) => build(r, 'exact'))

  // --- Tier 2: title_aliases (only if exact found nothing) ---
  if (candidates.length === 0) {
    const repIds = new Set(aliases.filter((al) => al.alias_norm === nt).map((al) => al.repertoire_id))
    if (repIds.size > 0) {
      candidates = repertoire.filter((r) => repIds.has(r.id)).map((r) => build(r, 'alias'))
    }
  }

  // --- Tier 3: keyword fallback (only if alias found nothing) ---
  if (candidates.length === 0) {
    const keywords = keywordsOf(nt)
    if (keywords.length > 0) {
      candidates = repertoire
        .filter((r) => {
          const tokens = new Set(r.norm_title.split(' '))
          return keywords.every((k) => tokens.has(k))
        })
        .map((r) => build(r, 'keyword'))
    }
  }

  candidates = sortCandidates(candidates)

  if (candidates.length === 0) {
    return { status: 'missing', candidates }
  }

  // Auto-matchable = candidates whose artist does NOT contradict the questionnaire.
  const autoMatchable = candidates.filter((c) => !c.artistMismatch)

  if (autoMatchable.length === 1) {
    return { status: 'matched', candidates }
  }

  if (autoMatchable.length === 0) {
    // Every candidate's library artist disagrees with the questionnaire artist.
    // Never guess — surface for human confirmation.
    const top = candidates[0]
    return {
      status: 'ambiguous',
      candidates,
      warning: `Questionnaire artist "${song.artistRaw}" doesn't match the library artist "${top.artist ?? ''}" for "${top.title}". Confirm before using.`,
    }
  }

  // More than one plausible work — the human picks which.
  return {
    status: 'ambiguous',
    candidates,
    warning: `${autoMatchable.length} possible matches for "${song.titleRaw}". Choose the intended work.`,
  }
}

/** Keep the keyword-limit tunable but applied at the API boundary, not here,
 * so the pure matcher stays fully deterministic and testable. */
export function capCandidates(result: MatchResult, max = MAX_KEYWORD_CANDIDATES): MatchResult {
  if (result.candidates.length <= max) return result
  return { ...result, candidates: result.candidates.slice(0, max) }
}
