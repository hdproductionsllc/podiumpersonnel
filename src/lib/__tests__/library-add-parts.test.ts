import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createHash } from 'crypto'
import { verifyUploadedPart, verifyUploadedParts } from '@/lib/repertoire/uploaded-parts'
import type { R2Client } from '@/lib/storage/r2'

/**
 * Adding to the library from the library page.
 *
 * The page could Replace, Remove and Archive, but never ADD — a score that
 * arrived after its parts had nowhere to go except the intake review screen,
 * which needs a questionnaire row to hang off. These lock the two properties
 * that make the new path safe:
 *
 *   1. It identifies the work by ID. add-work identifies it by (title, artist,
 *      ensemble) because an intake row has no id yet; from the library page a
 *      typo in a title would quietly create a SECOND work.
 *   2. It clears the same fidelity bar as every other upload path — the object
 *      is re-downloaded and re-hashed server-side before it becomes a row.
 */

const root = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf-8')

const ADD_PARTS = 'src/app/api/library/works/[workId]/parts/route.ts'
const ADD_WORK = 'src/app/api/repertoire/add-work/route.ts'
const CLIENT = 'src/components/library/library-client.tsx'

/** A stand-in R2 holding whatever bytes the test says it holds. */
function fakeR2(objects: Record<string, Uint8Array>) {
  const deleted: string[] = []
  const client = {
    async headObject(key: string) {
      const bytes = objects[key]
      return bytes ? { size: bytes.length, etag: 'e', contentType: 'application/pdf' } : null
    },
    async getRange(key: string, length: number) {
      return objects[key].slice(0, length)
    },
    async deleteObject(key: string) {
      deleted.push(key)
      delete objects[key]
    },
  } as unknown as R2Client
  return { client, deleted }
}

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
const PDF_SHA = createHash('sha256').update(PDF).digest('hex')
const KEY = `repertoire/org-1/${PDF_SHA}.pdf`

describe('the fidelity gate', () => {
  it('passes an object whose bytes hash to the sha in its own key', async () => {
    const { client, deleted } = fakeR2({ [KEY]: PDF })
    const problem = await verifyUploadedPart(client, {
      sha256: PDF_SHA,
      bytes: PDF.length,
      originalFilename: 'Iris - Score.pdf',
      storagePath: KEY,
    })
    expect(problem).toBeNull()
    expect(deleted).toEqual([])
  })

  it('refuses a claim for an object that was never uploaded', async () => {
    // The browser uploads, then calls the API. A claim with nothing behind it
    // would otherwise become a part row advertising a file that is not there.
    const { client } = fakeR2({})
    const problem = await verifyUploadedPart(client, {
      sha256: PDF_SHA,
      bytes: PDF.length,
      originalFilename: 'Iris - Score.pdf',
      storagePath: KEY,
    })
    expect(problem).toContain('was not found in storage')
  })

  it('refuses when the stored size is not the size claimed', async () => {
    const { client } = fakeR2({ [KEY]: PDF })
    const problem = await verifyUploadedPart(client, {
      sha256: PDF_SHA,
      bytes: PDF.length + 100,
      originalFilename: 'Iris - Score.pdf',
      storagePath: KEY,
    })
    expect(problem).toContain("doesn't match the upload")
  })

  it('deletes an object whose bytes do not hash to its own key', async () => {
    // Content addressing means that key is wrong for EVERY part that might ever
    // point at it, not just this upload — so it does not get to stay.
    const wrongBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    const { client, deleted } = fakeR2({ [KEY]: wrongBytes })
    const problem = await verifyUploadedPart(client, {
      sha256: PDF_SHA,
      bytes: wrongBytes.length,
      originalFilename: 'Iris - Score.pdf',
      storagePath: KEY,
    })
    expect(problem).toContain('failed integrity verification and was removed')
    expect(deleted).toEqual([KEY])
  })

  it('stops a batch at the first bad file', async () => {
    const { client } = fakeR2({ [KEY]: PDF })
    const problem = await verifyUploadedParts(client, [
      { sha256: PDF_SHA, bytes: PDF.length, originalFilename: 'ok.pdf', storagePath: KEY },
      { sha256: PDF_SHA, bytes: PDF.length, originalFilename: 'missing.pdf', storagePath: 'nope' },
    ])
    expect(problem).toContain('missing.pdf')
  })

  it('is the ONE implementation both upload paths use', () => {
    // Two copies of this check is two chances to weaken one of them.
    expect(read(ADD_WORK)).toContain('verifyUploadedParts')
    expect(read(ADD_PARTS)).toContain('verifyUploadedParts')
  })
})

describe('POST /api/library/works/[workId]/parts', () => {
  const src = read(ADD_PARTS)

  it('scopes every read and the insert to the resolved library org', () => {
    // A work id from another org's shelf must not exist for this caller — the
    // same rule the rest of the library routes follow, including shared shelves.
    expect(src).toContain('requireIntakeEnabled()')
    expect(src).toContain('const orgId = libraryOrgId')
    const lookup = src.slice(src.indexOf("from('repertoire')"))
    expect(lookup.slice(0, lookup.indexOf('maybeSingle'))).toContain(
      "eq('organization_id', orgId)"
    )
    expect(src).toContain('organization_id: orgId')
  })

  it('identifies the work by id, never by title', () => {
    // The whole reason this exists next to add-work: matching on a typed title
    // from a page that already knows the id can only create a duplicate work.
    expect(src).toContain("eq('id', workId)")
    expect(src).not.toContain('norm_title')
  })

  it('derives the storage key server-side from the hash', () => {
    expect(src).toContain('`repertoire/${orgId}/${sha256}.pdf`')
    expect(src).toContain('/^[0-9a-f]{64}$/')
  })

  it('refuses a role the work already fills, pointing at Replace', () => {
    // Append-only. The unique index would reject it anyway; saying so out loud
    // beats the silent skip that once swallowed a whole upload.
    expect(src).toContain('already has a')
    expect(src).toContain('Use Replace on that part')
    expect(src).toMatch(/409/)
  })

  it('lets a substitute part keep its own slot', () => {
    // 'vla covering vc' is keyed separately from a real viola part, so it must
    // not be read as the viola role being filled.
    expect(src).toContain('p.substitute === false')
    expect(src).toContain("(p.played_on == null || p.played_on === '')")
  })

  it('rejects two files claiming the same role in one request', () => {
    expect(src).toContain('const duplicate = parts.find(')
  })

  it('checks the cheap things before hashing megabytes', () => {
    // Shape, then the work, then collisions, and only then the R2 round trips.
    const gate = src.indexOf('await verifyUploadedParts(')
    expect(gate).toBeGreaterThan(-1)
    expect(src.indexOf('const collision')).toBeLessThan(gate)
    expect(src.indexOf('/^[0-9a-f]{64}$/')).toBeLessThan(gate)
  })

  it('verifies before it inserts', () => {
    expect(src.indexOf('await verifyUploadedParts(')).toBeLessThan(src.indexOf('.insert('))
  })

  it('returns parts shaped like the search route, so the page needs no reload', () => {
    expect(src).toContain('available: !!p.storage_path')
  })

  it('only accepts PDFs', () => {
    expect(src).toMatch(/\\\.pdf\$\/i/)
  })
})

describe('the library page can add', () => {
  const src = read(CLIENT)

  it('offers Add part in both the compact and the detailed view', () => {
    // The first cut of Replace shipped inside the detailed view only, while the
    // page defaults to compact — it was invisible. Not repeating that.
    expect(src.match(/<AddPartsForm/g)?.length).toBe(2)
  })

  it('only offers part roles the work does not already have', () => {
    // The unique index (repertoire_id, part, substitute, played_on) means a
    // second Violin 1 is a row the database refuses; do not ask for it.
    expect(src).toContain('PART_OPTIONS.filter((o) => !taken.has(o.value))')
    expect(src).toContain('Every part role is filled')
  })

  it('guesses the role from the filename but lets the admin change it', () => {
    expect(src).toContain('guessPartFromFilename')
    expect(src).toContain('aria-label={`Part role for ${row.file.name}`}')
  })

  it('reuses the intake add-work dialog rather than a second uploader', () => {
    expect(src).toContain('AddWorkDialog')
    expect(src).toContain('setAddWorkOpen')
  })

  it('says when the work it just added a part to is still archived', () => {
    // An archived work matches nothing, so a new part on one changes no book
    // until it is restored.
    expect(src).toContain('This work is still archived')
  })

  it('uploads browser → R2 direct, never through a serverless route', () => {
    const upload = src.slice(src.indexOf('async function uploadPdf'))
    expect(upload.slice(0, upload.indexOf('return sha256'))).toContain("method: 'PUT'")
    expect(src).toContain("fetch('/api/repertoire/upload-url'")
  })
})
