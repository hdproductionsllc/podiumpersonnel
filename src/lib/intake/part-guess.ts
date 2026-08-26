/**
 * Part-role guessing for manual repertoire uploads (Book Builder B4).
 *
 * Given a PDF filename, guess which instrument part it holds so the upload
 * dialog can pre-select the dropdown. GUESS ONLY — the admin confirms every
 * part before anything is saved (same propose-don't-decide contract as the
 * matcher). The taxonomy mirrors migration 068's repertoire_parts.part CHECK.
 *
 * Patterns follow the library's real filename conventions from Phase A
 * ("Title - Artist - Vln1.pdf", "…-05 Bass.pdf", "…Score.pdf", "Violin 2",
 * "db" for double bass).
 */

export type PartKey =
  | 'vln1'
  | 'vln2'
  | 'vla'
  | 'vc'
  | 'bass'
  | 'voice'
  | 'organ'
  | 'score'
  | 'other'

export const PART_OPTIONS: Array<{ value: PartKey; label: string }> = [
  { value: 'vln1', label: 'Violin 1' },
  { value: 'vln2', label: 'Violin 2' },
  { value: 'vla', label: 'Viola' },
  { value: 'vc', label: 'Cello' },
  { value: 'bass', label: 'Bass' },
  { value: 'voice', label: 'Voice' },
  { value: 'organ', label: 'Organ' },
  { value: 'score', label: 'Score' },
  { value: 'other', label: 'Other' },
]

export const PART_KEYS: ReadonlySet<string> = new Set(PART_OPTIONS.map((o) => o.value))

// Ordered most-specific-first; first hit wins.
const PART_PATTERNS: Array<[RegExp, PartKey]> = [
  [/\bscore\b/i, 'score'],
  [/\b(?:vln\.?\s*1|violin\s*1|violin\s*i(?![a-z1-9])|1st\s*violin)\b/i, 'vln1'],
  [/\b(?:vln\.?\s*2|violin\s*2|violin\s*ii(?![a-z1-9])|2nd\s*violin)\b/i, 'vln2'],
  [/\b(?:vla\.?\s*|viola)\b/i, 'vla'],
  [/\b(?:vc|cello|violoncello)\b/i, 'vc'],
  [/\b(?:bass|db|d\.b\.|contrabass|double\s*bass)\b/i, 'bass'],
  [/\b(?:voice|vocal|vox)\b/i, 'voice'],
  [/\borgan\b/i, 'organ'],
]

/** Guess the part a PDF filename holds. Falls back to 'other'. */
export function guessPartFromFilename(filename: string): PartKey {
  const base = filename.replace(/\.pdf$/i, '')
  for (const [re, part] of PART_PATTERNS) {
    if (re.test(base)) return part
  }
  return 'other'
}

/**
 * Split a filename so the part-identifying tail is never the bit that gets cut.
 *
 * Library files are named "Title - Artist - Vln1.pdf", so what tells two parts
 * apart lives at the END. Plain CSS truncation trims the end, which removed
 * exactly the token the admin is here to check — five files reading
 * "How Sweet It Is - Marvin…" with no way to tell which part each one is.
 *
 * The head truncates; the tail is rendered separately and never shrinks.
 */
export function splitPartFilename(name: string): { head: string; tail: string } {
  // Greedy head → matches the LAST " - ", which is where the part token starts.
  const m = /^(.*)(\s[-–—]\s.*)$/.exec(name)
  if (m && m[2].length <= 40) return { head: m[1], tail: m[2] }
  // No separator (or a tail too long to pin open): keep a readable last chunk.
  if (name.length <= 28) return { head: '', tail: name }
  return { head: name.slice(0, name.length - 20), tail: name.slice(-20) }
}
