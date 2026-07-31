import { requireIntakeEnabled, apiError, apiSuccess, serverError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * PATCH /api/library/works/[workId] — archive or restore a work.
 *
 * "Delete" here is an archive (is_active = false), not a row removal, and that
 * is deliberate:
 *
 *  - intake_songs.matched_repertoire_id is ON DELETE SET NULL, so a hard delete
 *    would silently unlink this work from every intake that matched it. The book
 *    would still exist, pointing at nothing, with no trace of what it lost.
 *  - repertoire_parts and title_aliases both CASCADE, so a hard delete would take
 *    the part rows and the alias history with it — including the sha256 records
 *    the importer uses to tell a byte-dupe from a real conflict.
 *  - is_active already existed and the search already filtered on it, so this is
 *    the mechanism the schema was built for.
 *
 * Archiving hides the work from the library and from matching, and it is
 * reversible from the same screen.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workId: string }> }
) {
  const { workId } = await params
  const { libraryOrgId, error } = await requireIntakeEnabled()
  if (error || !libraryOrgId) return error ?? apiError('Not found', 404)

  let body: { archived?: unknown }
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid JSON body')
  }

  if (typeof body.archived !== 'boolean') {
    return apiError('archived must be true or false')
  }

  try {
    const service = createServiceClient()

    // Scoped to the resolved library org, so a work id from elsewhere 404s
    // rather than being quietly mutated.
    const { data: updated, error: updateError } = await service
      .from('repertoire')
      .update({ is_active: !body.archived, updated_at: new Date().toISOString() })
      .eq('id', workId)
      .eq('organization_id', libraryOrgId)
      .select('id, title, is_active')

    if (updateError) return serverError('Library archive failed', updateError)
    if (!updated || updated.length === 0) return apiError('Not found', 404)

    return apiSuccess({ work: updated[0] })
  } catch (err) {
    return serverError('Library archive failed', err)
  }
}
