/**
 * A download filename with an ampersand must survive into Content-Disposition.
 * The storage client's own `download` option encodes with encodeURI, which
 * leaves `&` alone and truncates "Violin & Cello Duo - VIOLIN Book.pdf" to
 * "Violin " — a file with no extension (real, 2026-09-21).
 */
import { describe, it, expect } from 'vitest'
import { createSignedDownloadUrl, withDownloadName } from '../storage/signed-download'

const NAME = 'Madelyn Intagliata Violin & Cello Duo - VIOLIN Book.pdf'
const SIGNED = 'https://x.supabase.co/storage/v1/object/sign/project-files/a/b.pdf?token=abc'

describe('withDownloadName', () => {
  it('encodes every reserved character so the query string cannot split', () => {
    const url = withDownloadName(SIGNED, NAME)
    const q = new URL(url).searchParams
    expect(q.get('token')).toBe('abc')
    expect(q.get('download')).toBe(NAME)
    expect(url).not.toMatch(/&%20|& /)
  })

  it('keeps #, + and = in the name too', () => {
    const q = new URL(withDownloadName(SIGNED, 'Set #2 + encore = fun.pdf')).searchParams
    expect(q.get('download')).toBe('Set #2 + encore = fun.pdf')
  })

  it('starts the query string when the signed URL has none', () => {
    expect(withDownloadName('https://x/y.pdf', 'a.pdf')).toBe('https://x/y.pdf?download=a.pdf')
  })
})

describe('createSignedDownloadUrl', () => {
  it('signs without the download option and appends the encoded name', async () => {
    const calls: unknown[][] = []
    const bucket = {
      createSignedUrl: async (...args: unknown[]) => {
        calls.push(args)
        return { data: { signedUrl: SIGNED }, error: null }
      },
    }
    const { url, error } = await createSignedDownloadUrl(bucket, 'a/b.pdf', NAME, 60)
    expect(error).toBeNull()
    expect(calls).toEqual([['a/b.pdf', 60]])
    expect(new URL(url!).searchParams.get('download')).toBe(NAME)
  })

  it('passes a storage error through', async () => {
    const bucket = { createSignedUrl: async () => ({ data: null, error: { message: 'nope' } }) }
    const { url, error } = await createSignedDownloadUrl(bucket, 'a/b.pdf', NAME)
    expect(url).toBeNull()
    expect(error?.message).toBe('nope')
  })
})
