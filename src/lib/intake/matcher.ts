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

import { normTitle, normTitleLoose } from './normalize'

/** The repertoire `ensemble` canon (matches migration 068's CHECK set). */
export type EnsembleCanon =
  | 'quartet'
  | 'quintet'
  | 'trio'
  | 'viola-trio'
  | 'duo'
  | 'solo'
  | 'other'

export interface RepertoireRow {
  id: string
  title: string
  artist: string | null
  ensemble: string
  norm_title: string
}

/**
 * The playable parts a matched work actually has, aggregated from
 * repertoire_parts. `available` is the set of real (non-substitute) part roles
 * present; `substitutes` are cover parts (a file named for one instrument that
 * plays another's line) with the line each one covers. Used purely to show the
 * reviewer a gap badge — it never gates a match.
 */
export interface PartAvailability {
  available: string[]
  substitutes: Array<{ part: string; playedOn: string }>
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

/** How a candidate was reached, best tier first. */
export type MatchVia = 'exact' | 'alias' | 'loose' | 'keyword' | 'similarity'

export interface MatchCandidate {
  repertoireId: string
  title: string
  artist: string | null
  ensemble: string
  score: number
  via: MatchVia
  /** True when a questionnaire artist was given and it disagrees with this row. */
  artistMismatch: boolean
  /**
   * The work's part availability, when the caller decorated candidates with it
   * (the parse route does). Absent from the pure matcher output; the review UI
   * uses it to show a "missing vla (…)" gap note. Never affects matching.
   */
  parts?: PartAvailability
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

// `similarity` is a placeholder (0) — those candidates get a Dice-derived score
// assigned after build; the base map only needs the real tiers.
const SCORE = { exact: 100, alias: 85, loose: 80, keyword: 60, similarity: 0 } as const
const ARTIST_AGREE_BOOST = 15
const MAX_KEYWORD_CANDIDATES = 10

// Best-guess (similarity) tier: only ever populated when NO real tier hit. Kept
// strictly below the keyword tier's score and gated by a floor so red rows get
// plausible guesses, not noise. Three confidence bands (real-usage feedback:
// "nearly all the not-in-library flags had the right work as top choice"):
//   confident + clear lead → PROPOSED as matched (the human still reviews)
//   suggestive             → 'ambiguous' (amber, one-click pick)
//   below                  → 'missing' with "did you mean…" guesses
const MAX_SIMILARITY_CANDIDATES = 5
const SIMILARITY_FLOOR = 0.34
const SIMILARITY_CONFIDENT = 0.8
const SIMILARITY_CONFIDENT_WITH_ARTIST = 0.7 // an agreeing artist is extra evidence
const SIMILARITY_SUGGEST = 0.5
const SIMILARITY_LEAD = 0.12 // top guess must beat the best OTHER work by this much

// Core part roles a gig ensemble needs, by repertoire ensemble canon. Solo/other
// have no fixed requirement, so no gap is ever reported for them.
const REQUIRED_PARTS: Partial<Record<EnsembleCanon, string[]>> = {
  quartet: ['vln1', 'vln2', 'vla', 'vc'],
  quintet: ['vln1', 'vln2', 'vla', 'vc'],
  trio: ['vln1', 'vln2', 'vc'],
  'viola-trio': ['vln1', 'vla', 'vc'],
  duo: ['vln1', 'vc'],
}

const ENSEMBLE_CANON: ReadonlySet<EnsembleCanon> = new Set([
  'quartet', 'quintet', 'trio', 'viola-trio', 'duo', 'solo', 'other',
])

/**
 * Map a project's free-text `ensemble_type` label ("String Quartet", "Piano
 * Trio", …) to the repertoire ensemble canon, for ensemble-aware ranking and
 * gap badges. Returns undefined for anything unrecognized (neutral ranking) —
 * this is only a hint, never a gate. Idempotent on canon values.
 */
export function canonicalEnsemble(raw: string | null | undefined): EnsembleCanon | undefined {
  if (!raw) return undefined
  const s = raw.toLowerCase().trim()
  if (ENSEMBLE_CANON.has(s as EnsembleCanon)) return s as EnsembleCanon
  // Viola trio (vln/vla/vc) is a distinct arrangement family from the vln/vln/vc
  // string trio — only tag it when the label actually names a viola trio.
  if (s.includes('viola') && s.includes('trio')) return 'viola-trio'
  if (s.includes('quartet')) return 'quartet'
  if (s.includes('quintet')) return 'quintet'
  if (s.includes('trio')) return 'trio'
  if (s.includes('duo') || s.includes('duet')) return 'duo'
  if (s.includes('solo')) return 'solo'
  return undefined
}

/**
 * Which required parts a matched work is missing for a gig ensemble, and whether
 * a substitute file covers each gap. Pure — the UI renders the amber note from
 * this. `subBy` names the covering instrument (e.g. a vln2 file playing the vla
 * line → { part: 'vla', subBy: 'vln2' }); null when nothing covers it.
 */
/**
 * A work that exists only as a conductor score — one document containing every
 * line — with no individual part files.
 *
 * These are playable: the players read the score off a tablet and turn pages with
 * a foot pedal. So a score is a DELIVERY FORMAT, not a missing part, and such a
 * work must not be reported as "missing vln1, vln2, vla, vc" — the music is all
 * there, it just isn't split up.
 *
 * Deliberately narrow: a work with SOME individual parts plus a score is NOT
 * score-only, and keeps its existing behaviour (the score never silently covers
 * one absent part). One definition, shared by the matcher, the book builder and
 * the website export, so the three can't drift apart.
 */
export function isScoreOnly(parts: PartAvailability | undefined): boolean {
  if (!parts) return false
  const have = new Set(parts.available)
  if (!have.has('score')) return false
  return !CORE_PARTS.some((p) => have.has(p))
}

/** The individual lines a string ensemble splits into. */
const CORE_PARTS = ['vln1', 'vln2', 'vla', 'vc'] as const

export function partGap(
  parts: PartAvailability | undefined,
  ensemble: EnsembleCanon | undefined
): Array<{ part: string; subBy: string | null }> {
  if (!parts || !ensemble) return []
  // Everyone reads the one document — nothing is missing.
  if (isScoreOnly(parts)) return []
  const required = REQUIRED_PARTS[ensemble]
  if (!required) return []
  const have = new Set(parts.available)
  const gaps: Array<{ part: string; subBy: string | null }> = []
  for (const req of required) {
    if (have.has(req)) continue
    const sub = parts.substitutes.find((s) => s.playedOn === req)
    gaps.push({ part: req, subBy: sub ? sub.part : null })
  }
  return gaps
}

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
  // Single-character tokens are junk keys: "N/a" folds to "n a", and the stray
  // "n" matched any title containing an "n" token ("Guns n Roses"). Dropping
  // them only loosens the subset test — a real word still has to hit.
  return nt.split(' ').filter((w) => w.length > 1 && !STOPWORDS.has(w))
}

/** Sørensen–Dice coefficient over the two titles' token sets (0..1). Pure,
 *  order-independent, and cheap — used only to rank best-guesses for red rows. */
function tokenDice(a: string, b: string): number {
  const sa = new Set(a.split(' ').filter(Boolean))
  const sb = new Set(b.split(' ').filter(Boolean))
  if (sa.size === 0 || sb.size === 0) return 0
  let inter = 0
  for (const t of sa) if (sb.has(t)) inter++
  return (2 * inter) / (sa.size + sb.size)
}

/** Rank for ensemble-aware ordering: a work whose ensemble equals the gig's sorts
 *  ahead (0) of one that doesn't (1). Neutral when no gig ensemble given. */
function ensembleRank(ensemble: string, gig: EnsembleCanon | undefined): number {
  return gig && ensemble === gig ? 0 : 1
}

/**
 * Are all of these candidates the SAME WORK — identical folded title AND
 * identical normalized artist — differing only by arrangement (ensemble)?
 * The title check matters for the keyword tier, where candidates can be
 * different works ("Canon in D" vs "Canon in C") that share keywords.
 */
function sameWorkFamily(cands: MatchCandidate[]): boolean {
  if (cands.length < 2) return false
  const titles = new Set(cands.map((c) => normTitle(c.title)))
  if (titles.size !== 1) return false
  const artists = new Set(cands.map((c) => normArtist(c.artist)))
  return artists.size === 1
}

/**
 * Deterministic ordering: score desc, then (gig ensemble first), then title asc,
 * then repertoireId asc. Ensemble is only ever a TIEBREAKER among equal-score
 * candidates — it never lets a weaker match outrank a stronger one (the owner's
 * "trio gigs prefer trio arrangements", without over-automating).
 * Never rely on input array order — the DB may return rows in any order.
 */
function sortCandidates(cands: MatchCandidate[], gig?: EnsembleCanon): MatchCandidate[] {
  return cands.sort(
    (x, y) =>
      y.score - x.score ||
      ensembleRank(x.ensemble, gig) - ensembleRank(y.ensemble, gig) ||
      x.title.localeCompare(y.title) ||
      x.repertoireId.localeCompare(y.repertoireId)
  )
}

export function matchSong(
  song: SongInput,
  index: MatchIndex,
  gigEnsemble?: EnsembleCanon
): MatchResult {
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

  // --- Tier 3: match-time loose fold (only if alias found nothing) ---
  // Bridges client spellings the base norm can't (e.g. "Love & Marriage" vs
  // "Love and Marriage") by folding BOTH the query and each row's raw title the
  // looser way. For ampersand-free text the loose fold reduces to the base norm,
  // so this can only ADD matches the exact tier missed — never re-find what it
  // already had (it runs only after exact returned nothing over the same rows).
  if (candidates.length === 0) {
    const ntLoose = normTitleLoose(song.titleRaw || '')
    if (ntLoose) {
      candidates = repertoire
        .filter((r) => normTitleLoose(r.title) === ntLoose)
        .map((r) => build(r, 'loose'))
    }
  }

  // --- Tier 4: keyword fallback (only if loose found nothing) ---
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

  candidates = sortCandidates(candidates, gigEnsemble)

  // --- Tier 5: similarity (only when nothing else matched) ---
  // Never a dead end: attach the top Dice-ranked works. Confidence decides how
  // far to take the top guess (real-usage: the top guess is nearly always the
  // intended work, so don't make the human do the obvious):
  //   confident + clear lead over every OTHER work → propose as matched
  //   suggestive → 'ambiguous' (amber, one-click)
  //   weak → 'missing' with "did you mean…" guesses
  // A contradicted artist can never auto-match (owner's "never guess the artist").
  if (candidates.length === 0) {
    const scored = repertoire
      .map((r) => ({ r, sim: tokenDice(nt, r.norm_title) }))
      .filter((x) => x.sim >= SIMILARITY_FLOOR)
      .sort(
        (a, b) =>
          b.sim - a.sim ||
          ensembleRank(a.r.ensemble, gigEnsemble) - ensembleRank(b.r.ensemble, gigEnsemble) ||
          a.r.title.localeCompare(b.r.title) ||
          a.r.id.localeCompare(b.r.id)
      )
    const guesses = scored.slice(0, MAX_SIMILARITY_CANDIDATES).map((x) => {
      const c = build(x.r, 'similarity')
      c.score = Math.round(x.sim * 50) // strictly below the keyword tier
      return c
    })
    if (guesses.length === 0) return { status: 'missing', candidates: [] }

    const top = scored[0]
    const topCand = guesses[0]
    // The top guess's work-family: same folded title + artist, any arrangement.
    const topTitleNorm = top.r.norm_title
    const topArtistNorm = normArtist(top.r.artist)
    const inFamily = (r: RepertoireRow) =>
      r.norm_title === topTitleNorm && normArtist(r.artist) === topArtistNorm
    const family = scored.filter((x) => inFamily(x.r))
    const bestRival = scored.find((x) => !inFamily(x.r))

    const artistAgrees = !!artistQ && !!topArtistNorm && artistsAgree(artistQ, topArtistNorm)
    const threshold = artistAgrees ? SIMILARITY_CONFIDENT_WITH_ARTIST : SIMILARITY_CONFIDENT
    const clearLead = !bestRival || top.sim - bestRival.sim >= SIMILARITY_LEAD

    if (!topCand.artistMismatch && top.sim >= threshold && clearLead) {
      const gigHits = family.filter((x) => x.r.ensemble === gigEnsemble)
      if (family.length === 1 || (gigEnsemble && gigHits.length === 1)) {
        return { status: 'matched', candidates: guesses }
      }
      // Right work, but several arrangements and no ensemble to decide — amber.
      return {
        status: 'ambiguous',
        candidates: guesses,
        warning: `Close match for "${song.titleRaw}" — pick the arrangement.`,
      }
    }

    if (top.sim >= SIMILARITY_SUGGEST) {
      return {
        status: 'ambiguous',
        candidates: guesses,
        warning: `No exact title match for "${song.titleRaw}" — the closest library works are shown. Pick one, search, or keep as typed.`,
      }
    }

    return { status: 'missing', candidates: guesses }
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

  // Ensemble auto-resolve: when every plausible candidate is the SAME work and
  // they differ only by arrangement, the gig's ensemble decides — a quartet gig
  // auto-picks the quartet arrangement (owner's rule: the project context
  // already answers this question; don't ask the human). The sort has already
  // placed the gig-ensemble candidate first among its equal-score family.
  if (gigEnsemble && sameWorkFamily(autoMatchable)) {
    const gigHits = autoMatchable.filter((c) => c.ensemble === gigEnsemble)
    if (gigHits.length === 1) {
      return { status: 'matched', candidates }
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
