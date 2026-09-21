import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { buildWorkPatch } from '@/lib/repertoire/work-patch'
import { normTitle } from '@/lib/intake/normalize'

/**
 * Renaming a work from the library page.
 *
 * Titles arrive from filenames, so "Glass Animals - Glass Animals - vc.pdf"
 * became a work titled "Glass Animals" by Glass Animals (it is "Gooey"). The
 * page could Archive, Replace, Remove and Add parts, but never fix the name —
 * the only way was a database edit. These lock the properties that make the
 * rename safe:
 *
 *   1. The stored norm_title moves WITH the display title. Matching looks up
 *      norm_title, so a rename that left it behind would keep matching the
 *      wrong name and never the right one.
 *   2. Only the fields sent are changed. The Archive button and the Rename
 *      form share one PATCH; neither may clobber the other's columns.
 *   3. A rename onto an existing (title, artist, ensemble) is refused with a
 *      409, not a quiet second copy.
 */

const root = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf-8')

describe('buildWorkPatch', () => {
  it('keeps norm_title in step with the new title', () => {
    const r = buildWorkPatch({ title: "Can't Help Falling in Love", artist: 'Elvis Presley' })
    expect(r).toEqual({
      ok: true,
      patch: {
        title: "Can't Help Falling in Love",
        norm_title: normTitle("Can't Help Falling in Love"),
        artist: 'Elvis Presley',
      },
    })
    if (r.ok) expect(r.patch.norm_title).toBe('cant help falling in love')
  })

  it('changes only the fields that were sent', () => {
    expect(buildWorkPatch({ archived: true })).toEqual({ ok: true, patch: { is_active: false } })
    expect(buildWorkPatch({ title: 'Gooey' })).toEqual({
      ok: true,
      patch: { title: 'Gooey', norm_title: 'gooey' },
    })
    expect(buildWorkPatch({ artist: 'Glass Animals' })).toEqual({
      ok: true,
      patch: { artist: 'Glass Animals' },
    })
  })

  it('tidies whitespace and stores a blank artist as NULL', () => {
    const r = buildWorkPatch({ title: '  Gooey   ', artist: '   ' })
    expect(r).toEqual({ ok: true, patch: { title: 'Gooey', norm_title: 'gooey', artist: null } })
    expect(buildWorkPatch({ artist: null })).toEqual({ ok: true, patch: { artist: null } })
  })

  it('refuses an empty or unusable title', () => {
    expect(buildWorkPatch({ title: '' }).ok).toBe(false)
    expect(buildWorkPatch({ title: '   ' }).ok).toBe(false)
    expect(buildWorkPatch({ title: '???' }).ok).toBe(false) // normalizes to nothing
    expect(buildWorkPatch({ title: 42 }).ok).toBe(false)
    expect(buildWorkPatch({ title: 'x'.repeat(201) }).ok).toBe(false)
  })

  it('refuses a body with nothing to change', () => {
    expect(buildWorkPatch({})).toEqual({
      ok: false,
      error: 'Nothing to change: send title, artist, or archived',
    })
    expect(buildWorkPatch({ archived: 'yes' }).ok).toBe(false)
  })
})

describe('the works route', () => {
  const src = read('src/app/api/library/works/[workId]/route.ts')

  it('validates through buildWorkPatch and never writes ensemble', () => {
    expect(src).toContain('buildWorkPatch(body)')
    expect(src).not.toMatch(/ensemble\s*:/)
  })

  it('turns a unique-index clash into a 409, not a duplicate', () => {
    expect(src).toContain("'23505'")
    expect(src).toMatch(/409/)
  })

  it('stays scoped to the caller’s library org', () => {
    expect(src).toContain(".eq('organization_id', libraryOrgId)")
  })
})

describe('the library page', () => {
  const src = read('src/components/library/library-client.tsx')

  it('offers Rename in both the table and the card views', () => {
    const renames = src.match(/>\s*Rename\s*</g) ?? []
    expect(renames.length).toBe(2)
  })

  it('sends title and artist to the same PATCH the Archive button uses', () => {
    expect(src).toContain('body: JSON.stringify({ title, artist })')
    expect(src).toContain('body: JSON.stringify({ archived })')
  })
})
