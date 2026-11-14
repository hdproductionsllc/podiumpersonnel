import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ manifest: vi.fn(), intakeAuth: vi.fn(), db: vi.fn(), user: vi.fn(), storageList: vi.fn(), update: vi.fn(), insert: vi.fn() }))
vi.mock('@/app/api/intake/[projectId]/book/route', () => ({ GET: m.manifest }))
vi.mock('@/lib/api-helpers', () => ({ requireIntakeEnabled: m.intakeAuth, apiError: (error: string, status: number) => Response.json({ error }, { status }), apiSuccess: (data: unknown) => Response.json(data), serverError: () => Response.json({}, { status: 500 }) }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({ from: m.db }), createClient: async () => ({ from: m.db, auth: { getUser: m.user } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ storage: { from: () => ({ list: m.storageList }) } }) }))
import { POST as approve } from '@/app/api/intake/[projectId]/approve-books/route'
import { POST as publish } from '@/app/api/projects/[projectId]/files/route'
import { BOOK_NOTES } from '../intake/book-completeness'
const ctx = { params: Promise.resolve({ projectId: 'p' }) }
const complete = { parts: [{ part: 'vc' }], songs: [{ title: 'Song', files: { vc: {} }, noMusic: false, specialRequest: false }] }
let approved: string | null
function query(data: unknown) {
  const q: any = { data, error: null }
  for (const method of ['select', 'eq', 'single', 'maybeSingle']) q[method] = vi.fn(() => q)
  q.update = m.update.mockReturnValue(q)
  q.insert = m.insert.mockReturnValue(q)
  return q
}
beforeEach(() => {
  vi.clearAllMocks(); approved = 'stamp'
  m.intakeAuth.mockResolvedValue({ membership: { organization_id: 'o' } })
  m.user.mockResolvedValue({ data: { user: { id: 'u' } } })
  m.db.mockImplementation((table: string) => query(table === 'organization_members' ? { role: 'owner', organization_id: 'o' } : table === 'projects' ? { id: 'p', organization_id: 'o' } : { id: 'i', status: 'confirmed', books_approved_at: approved }))
  m.manifest.mockImplementation(async () => Response.json(complete))
  m.storageList.mockResolvedValue({ data: [], error: null })
})
function request(body: unknown) { return new Request('https://example.com', { method: 'POST', body: JSON.stringify(body) }) }
const file = { storagePath: 'o/p/music.pdf', fileName: 'music.pdf', notes: BOOK_NOTES }
describe('server book safety gates', () => {
  it('rejects incomplete approval without stamping', async () => {
    m.manifest.mockResolvedValue(Response.json({ ...complete, songs: [{ ...complete.songs[0], files: {} }] }))
    expect((await approve(request({ approved: true }), ctx)).status).toBe(409)
    expect(m.update).not.toHaveBeenCalled()
  })
  it('allows approval revocation without requiring complete music', async () => {
    expect((await approve(request({ approved: false }), ctx)).status).toBe(200)
    expect(m.manifest).not.toHaveBeenCalled()
  })
  it('rejects incomplete publication before any metadata insertion', async () => {
    m.manifest.mockResolvedValue(Response.json({ ...complete, songs: [{ ...complete.songs[0], files: {} }] }))
    expect((await publish(request(file), ctx)).status).toBe(409)
    expect(m.insert).not.toHaveBeenCalled()
  })
  it('rejects complete books with revoked approval', async () => {
    approved = null
    expect((await publish(request(file), ctx)).status).toBe(409)
    expect(m.insert).not.toHaveBeenCalled()
  })
  it('lets complete approved books reach normal publication', async () => {
    m.storageList.mockResolvedValue({ data: [{ name: 'music.pdf', metadata: { size: 123 } }], error: null })
    expect((await publish(request(file), ctx)).status).toBe(200)
    expect(m.insert).toHaveBeenCalled()
  })
  it('leaves ordinary manual uploads on the existing storage-validation path', async () => {
    expect((await publish(request({ ...file, notes: 'Manual score' }), ctx)).status).toBe(400)
    expect(m.manifest).not.toHaveBeenCalled()
    expect(m.storageList).toHaveBeenCalled()
  })
})
