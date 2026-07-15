/**
 * Part-guess tests (B4 add-to-library) — filename → part role, following the
 * library's real Phase A naming conventions. Guess only; the admin confirms.
 */
import { describe, it, expect } from 'vitest'
import { guessPartFromFilename, PART_OPTIONS, PART_KEYS } from '../part-guess'

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
