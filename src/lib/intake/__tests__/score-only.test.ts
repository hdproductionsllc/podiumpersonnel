/**
 * Score-only works — a conductor score with no individual parts.
 *
 * The players read the score off a tablet and turn pages with a foot pedal, so
 * these works are genuinely playable. The rule is deliberately NARROW: a work
 * that has some real parts must keep behaving exactly as it did before, and must
 * never have one absent line quietly papered over with the score.
 */
import { describe, it, expect } from 'vitest'
import { isScoreOnly, partGap, type PartAvailability } from '../matcher'
import { pickFileForPart, type PartFileRow } from '../book-builder'

const avail = (available: string[]): PartAvailability => ({ available, substitutes: [] })

const file = (part: string, extra: Partial<PartFileRow> = {}): PartFileRow => ({
  part,
  substitute: false,
  played_on: null,
  storage_path: `repertoire/${part}.pdf`,
  original_filename: `${part}.pdf`,
  ...extra,
})

describe('isScoreOnly', () => {
  it('is true for a score with no individual parts', () => {
    expect(isScoreOnly(avail(['score']))).toBe(true)
  })

  it('is true when a score sits alongside only non-core extras', () => {
    expect(isScoreOnly(avail(['score', 'bass', 'voice']))).toBe(true)
  })

  it('is FALSE when any real part exists — the score must not cover a gap', () => {
    expect(isScoreOnly(avail(['score', 'vln1']))).toBe(false)
    expect(isScoreOnly(avail(['score', 'vln1', 'vln2', 'vla']))).toBe(false)
  })

  it('is false with no score at all', () => {
    expect(isScoreOnly(avail(['vln1', 'vln2']))).toBe(false)
    expect(isScoreOnly(avail([]))).toBe(false)
    expect(isScoreOnly(undefined)).toBe(false)
  })
})

describe('partGap treats a score as a format, not a gap', () => {
  it('reports NO gaps for a score-only work', () => {
    // Would otherwise read "missing vln1, vln2, vla, vc" — i.e. look broken.
    expect(partGap(avail(['score']), 'quartet')).toEqual([])
  })

  it('still reports real gaps when individual parts exist', () => {
    const gaps = partGap(avail(['score', 'vln1', 'vln2', 'vla']), 'quartet')
    expect(gaps.map((g) => g.part)).toEqual(['vc'])
  })

  it('leaves complete works untouched', () => {
    expect(partGap(avail(['vln1', 'vln2', 'vla', 'vc']), 'quartet')).toEqual([])
  })
})

describe('pickFileForPart — score is the LAST rung', () => {
  const scoreOnly = [file('score')]

  it('gives every player the score when no parts exist', () => {
    for (const part of ['vln1', 'vln2', 'vla', 'vc']) {
      const picked = pickFileForPart(scoreOnly, part, 'Morning Mood')
      expect(picked, `${part} should get the score`).not.toBeNull()
      expect(picked!.row.part).toBe('score')
      expect(picked!.fileLabel).toBe('score')
      expect(picked!.warning).toMatch(/every player reads the score/)
    }
  })

  it('prefers a real part over the score', () => {
    const rows = [file('score'), file('vln1')]
    const picked = pickFileForPart(rows, 'vln1', 'W')
    expect(picked!.row.part).toBe('vln1')
    expect(picked!.warning).toBeNull()
  })

  it('does NOT paper over one missing part with the score', () => {
    // Real parts exist, so this work is not score-only. The cellist gets nothing
    // — same as before this feature — rather than silently receiving the score.
    const rows = [file('score'), file('vln1'), file('vln2'), file('vla')]
    expect(pickFileForPart(rows, 'vc', 'W')).toBeNull()
  })

  it('keeps the vln2-covers-viola fallback ahead of any score logic', () => {
    const rows = [file('score'), file('vln1'), file('vln2')]
    const picked = pickFileForPart(rows, 'vla', 'W')
    expect(picked!.fileLabel).toBe('vln2 as vla')
  })

  it('ignores a score row with no uploaded file', () => {
    expect(pickFileForPart([file('score', { storage_path: null })], 'vln1', 'W')).toBeNull()
  })

  it('returns null when there is neither a part nor a score', () => {
    expect(pickFileForPart([file('bass')], 'vln1', 'W')).toBeNull()
  })
})
