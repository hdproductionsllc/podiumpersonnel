/**
 * Title normalization for repertoire matching.
 *
 * EXACT replica of `normTitle()` in scripts/repertoire-index.js (the Phase A
 * indexer). The indexer computed `repertoire.norm_title` and `title_aliases.
 * alias_norm` with THIS logic, so any matcher MUST fold incoming questionnaire
 * titles the identical way or exact/alias lookups silently miss.
 *
 * Byte-for-byte port — the character classes, regex order, and replacements are
 * copied verbatim from the indexer (verified against a hexdump). Do not "clean
 * up" or reorder: the ordering is load-bearing (ensemble words are stripped
 * BEFORE punctuation collapse, apostrophes are dropped so "Cant" == "Can't",
 * years/version-noise are removed so re-typeset arrangements converge).
 *
 * The indexer is a CommonJS script that runs main() on import (and throws when
 * the library folder is absent), so it can't be `require()`d for reuse — hence
 * this maintained copy. intake-normalize.test.ts pins parity against a corpus.
 */

// Curly / modifier quotes, en/em dashes, and a private-use glyph (U+F028) seen
// in a real folder name are folded to their ASCII equivalents. PRESERVE the
// character classes exactly as the indexer has them.
export function unifyQuotes(s: string): string {
  return s
    .replace(/[‘’‛ʼ]/g, "'") // curly / modifier apostrophes
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-') // en/em dash -> hyphen
    .replace(/[]/g, '(') // private-use glyph seen in a folder name
}

// Ensemble/qualifier words that pollute titles; stripped for normTitle + display.
const ENSEMBLE_WORDS =
  /\b(string\s+)?(quartet|quintet|trio|duo|duet|sextet)\b|\bvc\s+duo\b|\bstring\s+duo\b/gi

// Version / engraving-revision noise that denotes the SAME piece, so all parts
// of a re-typeset arrangement converge to one normTitle (e.g. "God Only Knows"
// and "God Only Knows 2021 Update" are the same song).
const VERSION_NOISE =
  /\b(v\d+|updated?|update\s+\w+\s*\d{0,4}|version|revised|slower|faster|easier|harder|old|too\s+hard|new\s+version|print(?:out)?|copy|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b/g

export function normTitle(title: string): string {
  let t = unifyQuotes(title).toLowerCase()
  t = t.replace(/\(\s*\d+\s*\)/g, ' ') // "(1)" copy suffix
  t = t.replace(ENSEMBLE_WORDS, ' ')
  t = t.replace(/-\s*0?\d+\b/g, ' ') // leftover Naughtin "-01" numbering
  t = t.replace(/\b(19|20)\d{2}\b/g, ' ') // years (2021, 2022, ...)
  t = t.replace(VERSION_NOISE, ' ')
  t = t.replace(/[''`]/g, '') // drop apostrophes entirely (Cant == Can't)
  t = t.replace(/[^a-z0-9]+/g, ' ') // collapse punctuation
  t = t.replace(/\s+/g, ' ').trim()
  return t
}
