import { requireOrgAdmin, apiSuccess, apiError } from '@/lib/api-helpers'
import { gigEndedAt, reportRecipients, type PositionForAfterGig } from '@/lib/after-gig/rules'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { AFTER_GIG_PROJECT_SELECT, requestGigReports } from '@/lib/after-gig/run'

/** Confirm actual performers after the gig; request one attributed report each. Existing org-admin authorization is unchanged. */
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { membership, error } = await requireOrgAdmin()
  if (error) return error
  const { projectId } = await params

  const service = createServiceClient()
  const { data: project, error: readError } = await service
    .from('projects')
    .select(AFTER_GIG_PROJECT_SELECT)
    .eq('id', projectId)
    .maybeSingle()
  if (readError) return apiError('Could not load the gig', 500)
  // Same answer for "not yours" and "does not exist".
  if (!project || (project as { organization_id: string }).organization_id !== membership!.organization_id) {
    return apiError('Not found', 404)
  }

  const played = z.object({ playedMusicianIds: z.array(z.string().uuid()).max(500) }).safeParse(await request.json().catch(() => null))
  if (!played.success) return apiError('Confirm who actually played before requesting reports.', 400)
  const ended = gigEndedAt(project.services)
  if (project.status === 'cancelled' || !ended || ended.getTime() > Date.now()) return apiError('Review attendance after the gig ends.', 400)
  const ids = [...new Set(played.data.playedMusicianIds)]
  if (reportRecipients(project.project_positions as unknown as PositionForAfterGig[], ids).length !== ids.length) return apiError('Reconcile the confirmed roster, including substitutes, before selecting who played.', 400)
  const { error: saveError } = await service.from('projects').update({ gig_report_musician_ids: ids }).eq('id', projectId).eq('organization_id', membership!.organization_id)
  if (saveError) return apiError('Could not save the played roster. Ensure the played-roster migration is installed.', 500)
  project.gig_report_musician_ids = ids

  const outcomes = await requestGigReports(service, project, { force: true })
  return apiSuccess({ outcomes })
}
