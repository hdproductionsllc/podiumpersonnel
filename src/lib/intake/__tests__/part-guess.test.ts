/**
 * Part-guess tests (B4 add-to-library) — filename → part role, following the
 * library's real Phase A naming conventions. Guess only; the admin confirms.
 */
import { describe, it, expect } from 'vitest'
import {
  guessPartFromFilename,
  splitPartFilename,
  PART_OPTIONS,
  PART_KEYS,
} from '../part-guess'

describe('guessPartFromFilename', () => {
  it('recognizes the canonical suffix convention', () => {
    expect(guessPartFromFilename('September - Earth, Wind & Fire - vln1.pdf')).toBe('vln1')
    expect(guessPartFromFilename('September - Earth, Wind & Fire - vln2.pdf')).toBe('vln2')
    expect(guessPartFromFilename('September - Earth, Wind & Fire - vla.pdf')).toBe('vla')
    expect(guessPartFromFilename('September - Earth, Wind & Fire - vc.pdf')).toBe('vc')
  })

  it('recognizes long-form instrument names', () => {
    expect(guessPartFromFilename('Canon in D Violin 1.pdf')).toBe('vln1')
    expect(guessPartFromFilename('Canon in D 2nd Violin.pdf')).toBe('vln2')
    expect(guessPartFromFilename('Canon in D Viola.pdf')).toBe('vla')
    expect(guessPartFromFilename('Canon in D Cello.pdf')).toBe('vc')
    expect(guessPartFromFilename('7 by Beatles-05 Bass.pdf')).toBe('bass')
    expect(guessPartFromFilename('Ave Maria (Voice).pdf')).toBe('voice')
    expect(guessPartFromFilename('Wedding March Organ.pdf')).toBe('organ')
  })

  it('score beats instrument words', () => {
    expect(guessPartFromFilename('7 by Beatles-Score.pdf')).toBe('score')
    expect(guessPartFromFilename("00 Jumpin' Jumpin' String Quartet Score..pdf")).toBe('score')
  })

  it('recognizes db as bass (library convention)', () => {
    expect(guessPartFromFilename('Stand by Me db.pdf')).toBe('bass')
  })

  it('falls back to other, never throws', () => {
    expect(guessPartFromFilename('Some Song.pdf')).toBe('other')
    expect(guessPartFromFilename('')).toBe('other')
  })

  it('every option value is a valid 068 part key', () => {
    const allowed = new Set(['vln1', 'vln2', 'vla', 'vc', 'bass', 'voice', 'organ', 'other', 'score'])
    for (const o of PART_OPTIONS) expect(allowed.has(o.value)).toBe(true)
    expect(PART_KEYS.size).toBe(PART_OPTIONS.length)
  })
})

// ---------------------------------------------------------------------------
// splitPartFilename — the add-to-library dialog truncated the WRONG end.
//
// Real report (2026-08-26): five files uploaded for "How Sweet It Is" all
// rendered as "How Sweet It Is - Marvin…", so there was no way to check any of
// them against its part dropdown. The identifying token is the SUFFIX, so the
// head is what must give way.
// ---------------------------------------------------------------------------
describe('splitPartFilename', () => {
  const MARVIN = [
    'How Sweet It Is - Marvin Gaye - SCORE.pdf',
    'How Sweet It Is - Marvin Gaye - Vc.pdf',
    'How Sweet It Is - Marvin Gaye - Vla.pdf',
    'How Sweet It Is - Marvin Gaye - Vln1.pdf',
    'How Sweet It Is - Marvin Gaye - Vln2.pdf',
  ]

  it('keeps the part token in the never-truncated tail', () => {
    expect(MARVIN.map((n) => splitPartFilename(n).tail)).toEqual([
      ' - SCORE.pdf',
      ' - Vc.pdf',
      ' - Vla.pdf',
      ' - Vln1.pdf',
      ' - Vln2.pdf',
    ])
  })

  it('gives every file a DISTINCT tail — the whole point of the split', () => {
    const tails = MARVIN.map((n) => splitPartFilename(n).tail)
    expect(new Set(tails).size).toBe(MARVIN.length)
  })

  it('puts everything else in the head, losing nothing', () => {
    for (const name of MARVIN) {
      const { head, tail } = splitPartFilename(name)
      expect(head + tail).toBe(name)
    }
    expect(splitPartFilename(MARVIN[3]).head).toBe('How Sweet It Is - Marvin Gaye')
  })

  it('splits on the LAST separator, not the first', () => {
    // Title, artist and part all separated by dashes — only the last one counts.
    const { head, tail } = splitPartFilename('Signed, Sealed, Delivered - Stevie Wonder - Vln2.pdf')
    expect(tail).toBe(' - Vln2.pdf')
    expect(head).toBe('Signed, Sealed, Delivered - Stevie Wonder')
  })

  it('handles en/em dash separators the library also uses', () => {
    expect(splitPartFilename('Canon in D – Pachelbel – Vla.pdf').tail).toBe(' – Vla.pdf')
  })

  it('still shows a readable tail when there is no separator at all', () => {
    const { head, tail } = splitPartFilename('AVeryLongRunTogetherFilenameWithNoSeparators.pdf')
    expect(tail.length).toBeGreaterThan(0)
    expect(head + tail).toBe('AVeryLongRunTogetherFilenameWithNoSeparators.pdf')
  })

  it('leaves a short name whole rather than splitting it pointlessly', () => {
    expect(splitPartFilename('Vln1.pdf')).toEqual({ head: '', tail: 'Vln1.pdf' })
  })
})
