import { requireOrgAdmin, apiSuccess, apiError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { AFTER_GIG_PROJECT_SELECT, leadOfGig, requestGigReports } from '@/lib/after-gig/run'

/**
 * POST: ask this gig's ONE lead for a gig report now, or ask again.
 * The after-gig cron does this automatically 30 minutes after the gig ends;
 * this is the admin's manual "Send now / Send again". A lead who already sent
 * their report is never asked again.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
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

  if (!leadOfGig(project).lead) {
    return apiError('Pick the gig lead first.', 400)
  }

  const outcomes = await requestGigReports(service, project, { force: true })
  return apiSuccess({ outcomes })
}
