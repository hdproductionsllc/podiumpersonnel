import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MockSupabaseDb } from './helpers/supabase-mock'
const state = vi.hoisted(() => ({ db: undefined as unknown as MockSupabaseDb }))
vi.mock('@/lib/api-helpers', () => ({ requireOrgAdmin: async () => ({ membership: { organization_id: 'org' }, error: null }), apiError: (error: string, status = 400) => Response.json({ error }, { status }), apiSuccess: (data: unknown) => Response.json(data) }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => state.db }))
vi.mock('@/lib/after-gig/run', () => ({ AFTER_GIG_PROJECT_SELECT: '*', requestGigReports: vi.fn(async () => []) }))
import { POST } from '@/app/api/projects/[projectId]/gig-report/route'
import { requestGigReports } from '@/lib/after-gig/run'
const player = 'f4acecd7-5253-4a88-9826-9dcd950e1887'
beforeEach(() => {
  vi.clearAllMocks()
  state.db = new MockSupabaseDb({ projects: [{ id: 'gig', organization_id: 'org', status: 'completed', services: [{ start_time: '2026-01-01T12:00:00Z', end_time: '2026-01-01T13:00:00Z' }], project_positions: [{ status: 'confirmed', musician_id: player, musician: { id: player, first_name: 'Test', last_name: 'Player', email: 'test@example.test' } }] }] })
})
const post = (body: unknown) => POST(new Request('http://localhost/gig-report', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ projectId: 'gig' }) })
describe('admin confirms actual performers', () => {
  it('records the explicit roster before dispatch and deduplicates IDs', async () => {
    expect((await post({ playedMusicianIds: [player, player] })).status).toBe(200)
    expect(state.db.tables.projects[0].gig_report_musician_ids).toEqual([player])
    expect(requestGigReports).toHaveBeenCalledTimes(1)
  })
  it('rejects unreconciled, released or foreign performers', async () => {
    expect((await post({ playedMusicianIds: ['00000000-0000-4000-8000-000000000001'] })).status).toBe(400)
    state.db.tables.projects[0].project_positions[0].status = 'released'
    expect((await post({ playedMusicianIds: [player] })).status).toBe(400)
    expect(requestGigReports).not.toHaveBeenCalled()
  })
  it('rejects the old implicit lead-only request and other organizations', async () => {
    expect((await post({})).status).toBe(400)
    state.db.tables.projects[0].organization_id = 'another-org'
    expect((await post({ playedMusicianIds: [player] })).status).toBe(404)
    expect(requestGigReports).not.toHaveBeenCalled()
  })
})
