import { requireOrgAdmin, apiSuccess, apiError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * PUT { musicianId: string | null }: name the ONE lead of this gig, or clear
 * the choice (the app then falls back to the only confirmed musician flagged
 * leader, if there is exactly one). The lead must be confirmed on this gig.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { membership, error } = await requireOrgAdmin()
  if (error) return error
  const { projectId } = await params

  const body = await request.json().catch(() => null)
  const musicianId: unknown = body?.musicianId
  if (musicianId !== null && typeof musicianId !== 'string') return apiError('musicianId is required', 400)

  const service = createServiceClient()
  const { data: project } = await service
    .from('projects')
    .select('id, organization_id, project_positions(status, musician_id)')
    .eq('id', projectId)
    .maybeSingle()
  // Same answer for "not yours" and "does not exist".
  if (!project || project.organization_id !== membership!.organization_id) return apiError('Not found', 404)

  if (musicianId !== null) {
    const confirmed = (project.project_positions as { status: string; musician_id: string | null }[] | null) || []
    if (!confirmed.some((p) => p.status === 'confirmed' && p.musician_id === musicianId)) {
      return apiError('The gig lead must be confirmed on this gig.', 400)
    }
  }

  const { error: updateError } = await service
    .from('projects')
    .update({ gig_lead_musician_id: musicianId })
    .eq('id', projectId)
    .eq('organization_id', membership!.organization_id)
  if (updateError) return apiError('Could not save the gig lead', 500)

  return apiSuccess({ gigLeadMusicianId: musicianId })
}
