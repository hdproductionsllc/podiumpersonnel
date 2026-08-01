import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { sanitizeFilename, makeR2Client } from '@/lib/storage/r2'

/**
 * The music library is the most valuable thing in the product and the easiest to
 * leak: one durable URL to a PDF and the catalogue walks out the door.
 *
 * These lock the properties that keep that from happening — a private bucket
 * reached only through signed, short-lived, org-scoped links that never get
 * indexed, cached, or passed along in a Referer header.
 */

const root = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf-8')

const PART_ROUTE = 'src/app/api/library/parts/[partId]/route.ts'
const SEARCH_ROUTE = 'src/app/api/library/search/route.ts'

const client = makeR2Client({
  accountId: 'acct',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
  bucket: 'podium-repertoire',
  endpoint: 'https://acct.r2.cloudflarestorage.com',
})

describe('presigned URLs', () => {
  it('signs the link without calling R2', async () => {
    // Minting is local crypto: no network, so no per-link cost and no latency.
    const url = await client.getSignedUrl('org/work/part.pdf', 300)
    expect(url).toContain('X-Amz-Signature=')
    expect(url).toContain('X-Amz-Expires=300')
  })

  it('carries an expiry so a forwarded link dies', async () => {
    const url = await client.getSignedUrl('org/work/part.pdf', 300)
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('300')
  })

  it('previews inline by default', async () => {
    const url = await client.getSignedUrl('k', 300, { filename: 'Ave Maria.pdf' })
    const disposition = new URL(url).searchParams.get('response-content-disposition')
    expect(disposition).toBe('inline; filename="Ave Maria.pdf"')
  })

  it('downloads as an attachment when asked', async () => {
    const url = await client.getSignedUrl('k', 300, {
      download: true,
      filename: 'Ave Maria.pdf',
    })
    const disposition = new URL(url).searchParams.get('response-content-disposition')
    expect(disposition).toBe('attachment; filename="Ave Maria.pdf"')
  })

  it('signs the response overrides, so they cannot be swapped by the holder', async () => {
    // Both are inside the signature. Editing the query invalidates the URL rather
    // than silently changing what R2 serves.
    const preview = await client.getSignedUrl('k', 300, { filename: 'a.pdf' })
    const download = await client.getSignedUrl('k', 300, { download: true, filename: 'a.pdf' })

    const sigOf = (u: string) => new URL(u).searchParams.get('X-Amz-Signature')
    expect(sigOf(preview)).not.toBe(sigOf(download))
    expect(new URL(preview).searchParams.get('X-Amz-SignedHeaders')).toBeTruthy()
  })
})

describe('sanitizeFilename', () => {
  it('keeps an ordinary filename intact', () => {
    expect(sanitizeFilename('Ave Maria - Schubert.pdf')).toBe('Ave Maria - Schubert.pdf')
  })

  it('strips quotes that would break out of the header value', () => {
    // A bare quote would end the quoted string early and let the rest be read as
    // further Content-Disposition directives.
    expect(sanitizeFilename('bad".pdf')).toBe('bad.pdf')
    expect(sanitizeFilename('back\\slash.pdf')).toBe('backslash.pdf')
  })

  it('strips CR/LF so a filename cannot inject a header', () => {
    expect(sanitizeFilename('a.pdf\r\nX-Evil: 1')).not.toMatch(/[\r\n]/)
  })

  it('falls back rather than producing an empty name', () => {
    expect(sanitizeFilename('""')).toBe('download.pdf')
    expect(sanitizeFilename('   ')).toBe('download.pdf')
  })

  it('bounds the length', () => {
    expect(sanitizeFilename('x'.repeat(500)).length).toBeLessThanOrEqual(200)
  })
})

describe('the part route protects the catalogue', () => {
  const src = read(PART_ROUTE)

  it('requires an intake-enabled admin', () => {
    expect(src).toContain('requireIntakeEnabled')
  })

  it('scopes the lookup to the resolved library org', () => {
    // Without this a part id from another org would be readable. libraryOrgId
    // (not the caller's own org id) is what makes shared libraries work.
    expect(src).toContain("eq('organization_id', libraryOrgId)")
  })

  it('keeps links short-lived', () => {
    const ttl = /LINK_TTL_SECONDS = (\d+)/.exec(src)
    expect(ttl).toBeTruthy()
    expect(Number(ttl![1])).toBeLessThanOrEqual(900)
  })

  it('tells crawlers and caches to stay away', () => {
    expect(src).toContain('X-Robots-Tag')
    expect(src).toContain('noindex')
    expect(src).toContain('no-store')
  })

  it('does not leak the signed URL through a Referer header', () => {
    expect(src).toContain("'Referrer-Policy': 'no-referrer'")
  })

  it('handles a part that was catalogued but never uploaded', () => {
    // storage_path is NULL until bytes land — a real state in this library.
    expect(src).toContain('storage_path')
    expect(src).toMatch(/409/)
  })
})

describe('the search route protects the catalogue', () => {
  const src = read(SEARCH_ROUTE)

  it('requires an intake-enabled admin', () => {
    expect(src).toContain('requireIntakeEnabled')
  })

  it('never trusts a caller-supplied org id', () => {
    expect(src).toContain("eq('organization_id', libraryOrgId)")
    expect(src).not.toMatch(/searchParams\.get\(['"]org/)
  })

  it('escapes user input before it reaches a PostgREST filter', () => {
    // .or() is string-built, so an unescaped comma or paren could restructure it.
    expect(src).toContain('escapeLike')
  })

  it('bounds page size so one request cannot pull the whole catalogue', () => {
    const max = /MAX_PAGE_SIZE = (\d+)/.exec(src)
    expect(max).toBeTruthy()
    expect(Number(max![1])).toBeLessThanOrEqual(200)
  })

  it('validates filter values against the schema enums', () => {
    expect(src).toContain('Unknown ensemble filter')
    expect(src).toContain('Unknown part filter')
  })
})

describe('the library page keeps itself out of search results', () => {
  it('marks the page noindex', () => {
    const src = read('src/app/dashboard/library/page.tsx')
    expect(src).toContain('index: false')
  })

  it('404s rather than advertising the feature when the flag is off', () => {
    const src = read('src/app/dashboard/library/page.tsx')
    expect(src).toContain('notFound()')
  })

  it('opens preview links with noreferrer', () => {
    const src = read('src/components/library/library-client.tsx')
    expect(src).toContain('rel="noopener noreferrer"')
  })
})

describe('the redirect that hands out the signed URL carries the protections', () => {
  it('NextResponse.redirect actually applies the headers we pass', async () => {
    // The 401 from the shared auth helper does not carry these — that response
    // holds no music. This is the one that does, so prove the headers survive
    // rather than trusting the signature.
    const { NextResponse } = await import('next/server')

    const res = NextResponse.redirect('https://acct.r2.cloudflarestorage.com/b/k?X-Amz-Signature=x', {
      status: 302,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
        'Referrer-Policy': 'no-referrer',
      },
    })

    expect(res.status).toBe(302)
    expect(res.headers.get('x-robots-tag')).toContain('noindex')
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('location')).toContain('X-Amz-Signature=')
  })
})

describe('archiving a work instead of deleting it', () => {
  const src = read('src/app/api/library/works/[workId]/route.ts')

  it('flips is_active rather than removing the row', () => {
    // A hard delete would cascade through repertoire_parts and title_aliases,
    // and NULL out intake_songs.matched_repertoire_id — silently unlinking the
    // work from every intake that matched it.
    expect(src).toContain('is_active')
    expect(src).not.toMatch(/\.delete\(\)/)
  })

  it('is scoped to the resolved library org', () => {
    expect(src).toContain("eq('organization_id', libraryOrgId)")
  })

  it('requires an intake-enabled admin', () => {
    expect(src).toContain('requireIntakeEnabled')
  })

  it('rejects anything other than a boolean', () => {
    expect(src).toContain("typeof body.archived !== 'boolean'")
  })

  it('is reversible — the same route restores', () => {
    expect(src).toContain('is_active: !body.archived')
  })
})

describe('removing and replacing a part', () => {
  const src = read(PART_ROUTE)

  it('deletes the row but never the stored object', () => {
    // Keys are content-addressed, so two parts with identical bytes share one
    // object. Deleting it because one part went away would break the other.
    expect(src).not.toContain('deleteObject(')
  })

  it('scopes both mutations to the library org', () => {
    const deleteBlock = src.slice(src.indexOf('export async function DELETE'), src.indexOf('export async function PUT'))
    const putBlock = src.slice(src.indexOf('export async function PUT'))
    expect(deleteBlock).toContain("eq('organization_id', libraryOrgId)")
    expect(putBlock).toContain("eq('organization_id', libraryOrgId)")
  })

  it('derives the replacement key server-side from the hash', () => {
    // The client never chooses where bytes live, so it cannot repoint a part at
    // another org's object.
    expect(src).toContain('`repertoire/${libraryOrgId}/${sha256}.pdf`')
  })

  it('validates the hash shape before trusting it', () => {
    expect(src).toContain('/^[0-9a-f]{64}$/')
  })

  it('confirms the bytes really landed before repointing the row', () => {
    // Otherwise a failed upload leaves the part advertising a file that is not
    // there — worse than the old file, which at least opened.
    expect(src).toContain('headObject(storagePath)')
    expect(src).toMatch(/head\.size !== bytes/)
  })

  it('only accepts PDFs', () => {
    expect(src).toMatch(/\\\.pdf\$\/i/)
  })
})

describe('seeing more at a glance', () => {
  const search = read(SEARCH_ROUTE)
  const client = read('src/components/library/library-client.tsx')

  it('offers sorts, all resolved server-side', () => {
    // Sorting by a caller-supplied column name would let anyone order by, or
    // probe, columns the API never meant to expose.
    expect(search).toContain('const SORTS')
    expect(search).toContain('Unknown sort option')
    expect(search).not.toMatch(/\.order\((\s*)(sortParam|url\.searchParams)/)
  })

  it('lets a page hold more rows, still bounded', () => {
    const max = /MAX_PAGE_SIZE = (\d+)/.exec(search)
    expect(Number(max![1])).toBeGreaterThanOrEqual(200)
    expect(Number(max![1])).toBeLessThanOrEqual(500)
  })

  it('defaults to the compact table', () => {
    expect(client).toContain('useState(true)')
    expect(client).toContain('Detailed view')
  })

  it('hides archived works unless asked', () => {
    expect(search).toContain("includeArchived") 
    expect(search).toContain("if (!includeArchived) query = query.eq('is_active', true)")
  })
})
