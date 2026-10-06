import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { aggregateParts, loadPartsFor } from '../match-index'
import { partGap } from '../matcher'

/**
 * A live miss (Lori Stone wedding, 2026-10-06). "Ordinary World" in the library
 * held only the quintet's Cello II and Double Bass. The review screen showed a
 * clean green "Matched: Ordinary World"; the gap surfaced only at book-building,
 * five days before the gig, as "no file for vln1, vln2, vla".
 *
 * The gap badge already existed — but only the FIRST automatic match carried
 * part data. A reloaded review (rowFromSaved) and a hand-picked work
 * (pickSearch) both hard-coded `matchedParts: null`, and the confirmed
 * (read-only) list never rendered the note at all.
 */

const root = resolve(__dirname, '../../../..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf-8')

// Ordinary World's rows as they were in production before the fix.
const ORDINARY_WORLD = '49b186d5'
const before = [
  { repertoire_id: ORDINARY_WORLD, part: 'vc', substitute: false, played_on: null },
  { repertoire_id: ORDINARY_WORLD, part: 'bass', substitute: false, played_on: null },
]

describe('aggregateParts', () => {
  it('reports the real gap for a quartet gig', () => {
    const pa = aggregateParts(before).get(ORDINARY_WORLD)!
    expect(partGap(pa, 'quartet').map((g) => g.part)).toEqual(['vln1', 'vln2', 'vla'])
  })

  it('keeps substitutes separate from real parts', () => {
    const pa = aggregateParts([
      { repertoire_id: 'w', part: 'vln1', substitute: false, played_on: null },
      { repertoire_id: 'w', part: 'vln2', substitute: true, played_on: 'vla' },
      { repertoire_id: 'w', part: 'vln1', substitute: false, played_on: null },
    ]).get('w')!
    expect(pa.available).toEqual(['vln1'])
    expect(pa.substitutes).toEqual([{ part: 'vln2', playedOn: 'vla' }])
  })
})

/** Minimal stand-in for the Supabase query chain loadPartsFor uses. */
function fakeService(rows: typeof before, calls: string[][] = []) {
  return {
    from: () => {
      let ids: string[] = []
      const q = {
        select: () => q,
        eq: () => q,
        in: (_col: string, v: string[]) => {
          ids = v
          calls.push(v)
          return q
        },
        then: (ok: (r: { data: unknown; error: null }) => void) =>
          ok({ data: rows.filter((r) => ids.includes(r.repertoire_id)), error: null }),
      }
      return q
    },
  } as never
}

describe('loadPartsFor', () => {
  it('gives a work with NO part rows an empty availability, not null', async () => {
    // null means "unknown" and hides the badge; empty means "nothing playable".
    const r = await loadPartsFor(fakeService([]), 'org', ['bare'])
    expect(r.ok && r.data.get('bare')).toEqual({ available: [], substitutes: [] })
  })

  it('chunks long id lists', async () => {
    const calls: string[][] = []
    const ids = Array.from({ length: 120 }, (_, i) => `w${i}`)
    await loadPartsFor(fakeService([], calls), 'org', ids)
    expect(calls.map((c) => c.length)).toEqual([50, 50, 20])
  })

  it('returns the parts it finds', async () => {
    const r = await loadPartsFor(fakeService(before), 'org', [ORDINARY_WORLD])
    expect(r.ok && r.data.get(ORDINARY_WORLD)?.available.sort()).toEqual(['bass', 'vc'])
  })
})

describe('every way a song gets linked to a work carries its parts', () => {
  it('a reloaded review keeps them', () => {
    expect(read('src/app/api/intake/[projectId]/route.ts')).toContain('loadPartsFor(')
    expect(read('src/components/intake/intake-panel.tsx')).toContain('matchedParts: rep?.parts ?? null')
  })

  it('a hand-picked search result keeps them', () => {
    expect(read('src/app/api/intake/repertoire/route.ts')).toContain('loadPartsFor(')
    expect(read('src/components/intake/intake-song-row.tsx')).toContain('matchedParts: r.parts ?? null')
  })

  it('the confirmed list shows the gap, not just the editor', () => {
    const row = read('src/components/intake/intake-song-row.tsx')
    const readOnly = row.slice(row.indexOf('if (readOnly)'), row.indexOf('return (', row.indexOf('if (readOnly)') + 40))
    expect(readOnly).toContain('gapNote')
  })
})
