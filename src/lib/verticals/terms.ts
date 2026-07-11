import type { TermDictionary } from './types'

export type TermKey = keyof TermDictionary
export type TermOpts = {
  /** Return the plural form (default: singular) */
  plural?: boolean
  /** 'title' (default) = as stored, 'lower' = mid-sentence lowercase */
  case?: 'title' | 'lower'
}

/**
 * Resolve one outward-facing noun from a dictionary.
 * For a null rank (vertical without chairs) returns '' — call sites should
 * gate on features.useChairs instead of rendering an empty word.
 */
export function term(dict: TermDictionary, key: TermKey, opts: TermOpts = {}): string {
  const forms = dict[key]
  if (!forms) return ''
  const word = opts.plural ? forms.plural : forms.singular
  return opts.case === 'lower' ? word.toLowerCase() : word
}

/** "3 musicians" / "1 musician" — count-aware pluralization, lowercase by default. */
export function termCount(
  dict: TermDictionary,
  key: TermKey,
  count: number,
  opts: Omit<TermOpts, 'plural'> = {}
): string {
  return `${count} ${term(dict, key, { plural: count !== 1, case: opts.case ?? 'lower' })}`
}
