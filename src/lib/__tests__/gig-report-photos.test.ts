import { beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

const state = vi.hoisted(() => ({ valid: true, user: true, role: 'admin', listError: false, uploadError: false, files: [] as { name: string }[], uploaded: null as null | { path: string; bytes: Buffer }, signed: [] as string[], token: 0 }))
vi.mock('@/lib/after-gig/report-token', () => ({ resolveGigReportToken: async () => state.valid ? { organizationId: 'org', projectId: 'gig', reportId: `report-${state.token}` } : null }))
vi.mock('@/lib/supabase/server', () => {
  const bucket = {
    list: vi.fn(async () => ({ data: state.files, error: state.listError ? { message: 'offline' } : null })),
    upload: vi.fn(async (path: string, bytes: Buffer) => { state.uploaded = { path, bytes }; return { error: state.uploadError ? { message: 'offline' } : null } }),
    createSignedUrls: vi.fn(async (paths: string[]) => { state.signed = paths; return { data: paths.map(path => ({ signedUrl: `https://example.test/${path}` })), error: null } }),
  }
  const client = {
    auth: { getUser: async () => ({ data: { user: state.user ? { id: 'user' } : null } }) },
    storage: { from: () => bucket },
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: table === 'projects' ? { organization_id: 'org' } : { role: state.role } }),
        then: (resolve: (value: unknown) => void) => resolve({ data: [{ id: `report-${state.token}` }], error: null }),
      }
      return chain
    },
  }
  return { createServiceClient: () => client, createClient: async () => client }
})

import { POST } from '@/app/api/report/[token]/photos/route'
import { GET } from '@/app/api/projects/[projectId]/gig-report/photos/route'

async function upload(bytes: Uint8Array, type = 'image/jpeg') {
  const form = new FormData()
  form.append('photo', new Blob([new Uint8Array(bytes)], { type }), '../../evil.jpg')
  // Materialize multipart bytes before the handler can reject/cancel the body.
  // This avoids Node's FormData encoder enqueueing after stream cancellation.
  const encoded = new Response(form)
  const body = await encoded.arrayBuffer()
  return POST(new Request('http://localhost/photos', { method: 'POST', body, headers: { 'Content-Type': encoded.headers.get('content-type')! } }), { params: Promise.resolve({ token: 'test' }) })
}
const image = () => sharp({ create: { width: 24, height: 16, channels: 3, background: '#ff0000' } }).jpeg().toBuffer()

beforeEach(() => { state.valid = true; state.user = true; state.role = 'admin'; state.listError = false; state.uploadError = false; state.files = []; state.uploaded = null; state.signed = []; state.token++ })

describe('private gig photos', () => {
  it('validates actual bytes, strips metadata and chooses a server-scoped path', async () => {
    const bytes = await sharp(await image()).withMetadata({ exif: { IFD0: { Artist: 'Private name' } } }).toBuffer()
    expect((await upload(bytes)).status).toBe(200)
    expect(state.uploaded?.path).toMatch(/^org\/gig\/report-\d+\/[a-f0-9]{64}\.jpg$/)
    expect((await sharp(state.uploaded!.bytes).metadata()).exif).toBeUndefined()
  })
  it('rejects a forged image and unsupported SVG', async () => {
    expect((await upload(new TextEncoder().encode('<script>bad</script>'))).status).toBe(400)
    expect((await upload(await image(), 'image/svg+xml')).status).toBe(400)
    expect(state.uploaded).toBeNull()
  })
  it('rejects unknown report tokens before touching storage', async () => {
    state.valid = false
    expect((await upload(await image())).status).toBe(404)
    expect(state.uploaded).toBeNull()
  })
  it('retries the same image without creating another object', async () => {
    const bytes = await image()
    await upload(bytes)
    state.files = [{ name: state.uploaded!.path.split('/').pop()! }]
    state.uploaded = null
    expect((await upload(bytes)).status).toBe(200)
    expect(state.uploaded).toBeNull()
  })
  it('returns a retryable failure when storage fails', async () => {
    state.uploadError = true
    expect((await upload(await image())).status).toBe(503)
    state.uploadError = false
    expect((await upload(await image())).status).toBe(200)
  })
  it('limits the body even without a truthful Content-Length', async () => {
    expect((await upload(new Uint8Array(4 * 1024 * 1024))).status).toBe(413)
    expect(state.uploaded).toBeNull()
  })
  it('rate limits repeated upload attempts', async () => {
    const bytes = await image()
    for (let i = 0; i < 30; i++) await upload(bytes)
    expect((await upload(bytes)).status).toBe(429)
  })
  it('does not produce signed links for anonymous or non-admin users', async () => {
    const get = () => GET(new Request('http://localhost/photos'), { params: Promise.resolve({ projectId: 'gig' }) })
    state.user = false
    expect((await get()).status).toBe(401)
    state.user = true; state.role = 'musician'
    expect((await get()).status).toBe(403)
    expect(state.signed).toEqual([])
  })
  it('gives an authorized admin scoped, noncached photo links', async () => {
    state.files = [{ name: `${'a'.repeat(64)}.jpg` }, { name: '../foreign.jpg' }]
    const response = await GET(new Request('http://localhost/photos'), { params: Promise.resolve({ projectId: 'gig' }) })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(state.signed).toEqual([`org/gig/report-${state.token}/${'a'.repeat(64)}.jpg`])
  })
})
