import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * A live bug, reproduced from the code and locked here.
 *
 * The owner archived one arrangement of a work, rebuilt the books, was correctly
 * told the song needed a file, uploaded the new arrangement — and got books
 * containing the OLD archived arrangement.
 *
 * The chain, every link of which is asserted below:
 *
 *   1. repertoire_identity_uidx is (org, norm_title, coalesce(artist,''),
 *      ensemble) with no is_active — an archived work still holds its title's
 *      slot, so a fresh row for the same title cannot be inserted.
 *   2. intake/parse filters is_active, so the archived work stopped matching and
 *      the row read "not in library" — the upload prompt. Correct so far.
 *   3. add-work deduped on the identity key, found the ARCHIVED row, saw every
 *      part role already taken, and skipped all of the uploaded files — the new
 *      PDFs reached R2 and were never linked to anything.
 *   4. The intake row was then matched to the archived work.
 *   5. The book route loaded repertoire_parts by repertoire_id with no is_active
 *      check, so the book was assembled from the archived work's old files.
 *
 * Nothing in the UI contradicted any of this: the review row rendered a green
 * "Matched" badge and the success toast said the work "was already in the
 * library with these parts".
 */

const root = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf-8')

const ADD_WORK = 'src/app/api/repertoire/add-work/route.ts'
const BOOK_ROUTE = 'src/app/api/intake/[projectId]/book/route.ts'
const INTAKE_ROUTE = 'src/app/api/intake/[projectId]/route.ts'
const PARSE_ROUTE = 'src/app/api/intake/parse/route.ts'
const MATCH_INDEX = 'src/lib/intake/match-index.ts'
const SONG_ROW = 'src/components/intake/intake-song-row.tsx'
const ADD_DIALOG = 'src/components/intake/add-work-dialog.tsx'

describe('the archived work still owns its identity slot', () => {
  const sql = read('supabase/migrations/068_repertoire.sql')

  it('keys identity without is_active, so archiving does not free the title', () => {
    // This is why add-work cannot simply skip archived rows in its lookup: the
    // insert that followed would violate this index.
    const idx = sql.slice(sql.indexOf('CREATE UNIQUE INDEX repertoire_identity_uidx'))
    const decl = idx.slice(0, idx.indexOf(';'))
    expect(decl).toContain('norm_title')
    expect(decl).not.toContain('is_active')
    expect(decl).not.toMatch(/WHERE/i)
  })
})

describe('matching correctly ignores archived works', () => {
  it('the match index filters is_active, which is what produced the upload prompt', () => {
    // The filter moved out of the parse route into the shared index loader when
    // the client song planner (082) started matching through the same code. Both
    // callers inherit it, which is the point — a client's typed song and the same
    // song pasted from a questionnaire must never disagree about an archived work.
    expect(read(MATCH_INDEX)).toContain("if (table === 'repertoire') q = q.eq('is_active', true)")
    expect(read(PARSE_ROUTE)).toContain('loadMatchIndex(')
    expect(read('src/app/api/plan/[token]/save/route.ts')).toContain('loadMatchIndex(')
  })

  it('the manual repertoire search filters is_active too', () => {
    expect(read('src/app/api/intake/repertoire/route.ts')).toContain("eq('is_active', true)")
  })
})

describe('add-work treats an upload onto an archived work as a revival', () => {
  const src = read(ADD_WORK)

  it('reads is_active so it can tell an archived hit from a live one', () => {
    expect(src).toContain('select(\'id,title,artist,ensemble,is_active\')')
    expect(src).toContain('const reviving = !!existing && existing.is_active === false')
  })

  it('brings the work back rather than returning it still archived', () => {
    // Otherwise the intake row is matched to a work that no longer matches
    // anything — the state this bug started from.
    expect(src).toContain('is_active: true')
  })

  it('REPLACES the colliding parts instead of skipping them', () => {
    // The whole failure: every uploaded file was dropped because the archived
    // work already had that part role.
    expect(src).toContain('const toReplace = reviving ? collided : []')
    expect(src).toContain('const skipped = reviving ? [] : collided.map((p) => p.part)')
  })

  it('keeps append-only behaviour for a work that is NOT archived', () => {
    // Append-only is a deliberate safety rule for live works: a near-duplicate
    // upload must never silently overwrite a good chart.
    expect(src).toMatch(/reviving \? \[\] : collided/)
  })

  it('archives the superseded file before repointing the row', () => {
    const replaceBlock = src.slice(src.indexOf('for (const p of toReplace)'))
    const archiveAt = replaceBlock.indexOf("from('repertoire_part_versions').insert")
    const repointAt = replaceBlock.indexOf("from('repertoire_parts')")
    expect(archiveAt).toBeGreaterThan(-1)
    expect(archiveAt).toBeLessThan(repointAt)
  })

  it('does not block the replacement when only the archive write fails', () => {
    // Migration 079 may not be applied yet. Refusing here would re-create the
    // exact situation the owner is stuck in: an upload that changes nothing.
    const replaceBlock = src.slice(src.indexOf('for (const p of toReplace)'))
    const archive = replaceBlock.slice(replaceBlock.indexOf('const { error: versionErr }'))
    expect(archive.slice(0, archive.indexOf('const { error: repointErr }'))).toContain('console.error')
    expect(archive.slice(0, archive.indexOf('const { error: repointErr }'))).not.toContain('return ')
  })

  it('skips the repoint when the bytes are identical', () => {
    // Content-addressed keys: same key means same file, so there is nothing to
    // archive and nothing to change.
    expect(src).toContain('if (old.storage_path === p.storagePath) continue')
  })

  it('reports parts the upload did not cover, which keep the old file', () => {
    // A revival supplying only vln1 leaves vla/vc pointing at the archived
    // arrangement — one book, two versions, and nothing else would say so.
    expect(src).toContain('const retained = reviving')
    expect(src).toContain('retainedParts: retained')
  })

  it('still derives every storage path server-side', () => {
    expect(src).toContain('`repertoire/${orgId}/${sha256}.pdf`')
  })
})

describe('the upload dialog says what actually happened', () => {
  const src = read(ADD_DIALOG)

  it('no longer claims success when the files were discarded', () => {
    // The old copy for this case was "was already in the library with these
    // parts" — technically true, and read as "done".
    expect(src).toContain('was NOT used for')
  })

  it('warns when parts kept their previous file', () => {
    expect(src).toContain('kept the previous file')
    expect(src).toContain('older arrangement')
  })

  it('tells the admin where to fix a skipped part', () => {
    expect(src).toContain('Use Replace in the music library')
  })

  it('gives those warnings time to be read', () => {
    expect(src).toMatch(/duration: \d{5}/)
  })
})

describe('the book builder never silently uses an archived work', () => {
  const src = read(BOOK_ROUTE)

  it('looks up whether each matched work is still active', () => {
    expect(src).toContain('archivedWorkIds')
    expect(src).toContain("select('id, is_active')")
    expect(src).toContain("eq('organization_id', libraryOrgId)")
  })

  it('warns per song, naming it', () => {
    expect(src).toContain('archivedWorkIds.has(row.matched_repertoire_id)')
    expect(src).toContain('ARCHIVED library work')
  })

  it('still includes the files rather than shipping an empty book', () => {
    // A silently missing part sends musicians to a gig with no music. The
    // warning is the fix, not withholding the PDFs.
    const warn = src.slice(src.indexOf('archivedWorkIds.has(row.matched_repertoire_id)'))
    expect(warn.slice(0, warn.indexOf('}'))).not.toContain('continue')
    expect(src).toContain('entry.files[bp.part] = {')
  })
})

describe('a build never uses a cached manifest', () => {
  const src = read('src/components/intake/book-download.tsx')

  it('re-fetches on every build and publish', () => {
    // The manifest holds presigned URLs for the files as they were when it was
    // fetched. After fixing a work in the library, a stale tab would hand back
    // the OLD files and read as "the fix didn't work". The links expire too.
    const builders = src.split('\n').filter((l) => l.includes('await loadManifest('))
    expect(builders.length).toBeGreaterThanOrEqual(4)
    for (const line of builders) {
      expect(line, `build path reuses a cached manifest: ${line.trim()}`).toContain(
        'loadManifest(true)'
      )
    }
  })

  it('still allows a cached read for plain rendering', () => {
    expect(src).toContain('if (manifest && !fresh) return manifest')
  })
})

describe('the review screen flags an archived match before books are built', () => {
  it('the API returns is_active with the matched work', () => {
    const src = read(INTAKE_ROUTE)
    expect(src).toContain("select('id,title,artist,ensemble,is_active')")
  })

  it('the panel maps it onto the row', () => {
    const src = read('src/components/intake/intake-panel.tsx')
    expect(src).toContain('matchedArchived: rep ? rep.is_active === false : false')
  })

  it('the row shows it in both the editable and read-only renders', () => {
    const src = read(SONG_ROW)
    expect(src).toContain('Archived work')
    expect(src).toContain('This work is archived in your library')
  })

  it('clears the flag on every deliberate re-match', () => {
    // Otherwise picking the correct work leaves a stale red warning, and the
    // admin learns to ignore it.
    // Every block that re-decides the match must clear it. Cancelling out of
    // the picker must NOT — nothing changed, so the warning still applies.
    const src = read(SONG_ROW)
    const setters = src.split('onChange({').slice(1).map((b) => b.slice(0, b.indexOf('})')))
    const rematchers = setters.filter((b) => b.includes('matchStatus:'))
    expect(rematchers.length).toBeGreaterThanOrEqual(5)
    for (const block of rematchers) {
      expect(block, `re-match setter missing matchedArchived reset:\n${block}`).toContain(
        'matchedArchived: false'
      )
    }
  })
})

describe('archiving explains its own limits', () => {
  const src = read('src/components/library/library-client.tsx')

  it('says archiving does not unlink already-matched projects', () => {
    // The owner reasonably read "archived" as "retired everywhere".
    expect(src).toContain('does NOT unlink projects already matched to it')
  })

  it('points at Replace as the way to swap an arrangement', () => {
    expect(src).toContain('use Replace on each part')
  })
})
