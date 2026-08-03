import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { bookParts, destFilename, SCORE_BOOK_PART } from '@/lib/intake/book-builder'

/**
 * An optional score book alongside the per-instrument books.
 *
 * The library does not have a score for every work, so this is opt-in and never
 * part of a default build: adding `score` to bookParts() would put a "no file
 * for score" warning on most songs in most books, and hand every player a book
 * they did not ask for.
 */

const root = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf-8')
const route = read('src/app/api/intake/[projectId]/book/route.ts')
const client = read('src/components/intake/book-download.tsx')

describe('the score is not an instrument book', () => {
  it('never appears in bookParts for any ensemble', () => {
    for (const e of ['quartet', 'quintet', 'trio', 'viola-trio', 'duo', 'solo', undefined] as const) {
      const parts = bookParts(e).map((p) => p.part)
      expect(parts, `score leaked into the ${e ?? 'default'} book`).not.toContain('score')
    }
  })

  it('sorts above the instruments when a build is unzipped', () => {
    expect(SCORE_BOOK_PART.folder).toMatch(/^00_/)
    for (const p of bookParts('quintet')) {
      expect(SCORE_BOOK_PART.folder < p.folder).toBe(true)
    }
  })

  it('names its files like every other part', () => {
    expect(destFilename(7, 'Merry Go Round of Life', 'Joe Hisaishi', SCORE_BOOK_PART.part)).toContain(
      'score'
    )
  })
})

describe('the manifest only offers a score book that exists', () => {
  it('counts the songs that actually have one', () => {
    expect(route).toContain('scoreCount += 1')
    expect(route).toContain('scoreCount,')
  })

  it('returns scorePart as null when nothing has a score', () => {
    // The checkbox is rendered off this, so a project with no scores never even
    // shows the option.
    expect(route).toContain('scorePart: scoreCount > 0 ? SCORE_BOOK_PART : null')
  })

  it('takes an EXACT score, never a substitute or a fallback', () => {
    // pickFileForPart's fallbacks exist so a player is never left without music
    // — vln2 stands in for vla, a score stands in for any part on a score-only
    // work. None of that belongs in a score book: it is the actual score or it
    // is nothing.
    expect(route).toContain("fileRows.find((r) => r.part === 'score' && !r.substitute && r.storage_path)")
    const scoreBlock = route.slice(route.indexOf('const scoreRow'), route.indexOf('for (const bp of parts)'))
    expect(scoreBlock).not.toContain('pickFileForPart')
  })

  it('does not report a missing score as a missing part', () => {
    // missingParts drives the "no file for X" warnings on the instrument books.
    // A song without a score is normal, not a gap in anyone's book.
    const scoreBlock = route.slice(route.indexOf('const scoreRow'), route.indexOf('for (const bp of parts)'))
    expect(scoreBlock).not.toContain('missingParts')
  })
})

describe('the score book is opt-in', () => {
  it('defaults to off', () => {
    expect(client).toContain('const [includeScore, setIncludeScore] = useState(false)')
  })

  it('is only built when asked for AND the manifest has one', () => {
    // Guards against a stale checkbox on a project with no scores producing an
    // empty book containing nothing but a playlist.
    expect(client).toContain('includeScore && m.scorePart ? [...m.parts, m.scorePart] : m.parts')
  })

  it('every build path goes through the same list', () => {
    // Download-all, the per-book buttons and the publish plan must agree, or
    // you get a score button that builds nothing, or a book nobody can send.
    const uses = (client.match(/partsToBuild\(/g) ?? []).length
    expect(uses).toBeGreaterThanOrEqual(4) // definition + downloadAll + buttons + publish
    expect(client).toContain('const built = partsToBuild(m)')
    expect(client).toContain('partsToBuild(m).map((bp) => ({')
  })

  it('tells the admin when the library only covers some songs', () => {
    // "Score book" reads as complete unless it says otherwise.
    expect(client).toContain('manifest.scoreCount < manifest.songs.length')
    expect(client).toContain('songs have a score')
  })

  it('defaults the score to "Don\'t send" when publishing', () => {
    // matchInstrumentForPart('score', …) finds no chair, so it lands on skip.
    // A score goes to whoever is directing, chosen deliberately.
    expect(client).toContain("matchInstrumentForPart(bp.part, instruments)?.id ?? 'skip'")
  })
})
