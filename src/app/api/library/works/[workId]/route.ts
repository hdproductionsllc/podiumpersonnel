import { requireIntakeEnabled, apiError, apiSuccess, serverError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { buildWorkPatch } from '@/lib/repertoire/work-patch'

/**
 * PATCH /api/library/works/[workId] — edit a work's title/artist, or archive
 * and restore it.
 *
 * Body: `{ title?, artist?, archived? }`. Validation and the title →
 * norm_title rule live in buildWorkPatch(); this route only owns the org
 * scoping and the database round-trip.
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
 *
 * A rename keeps every part, version, alias and matched intake attached: only
 * the display columns change. If the new title+artist already exists for the
 * same ensemble, the unique index refuses it and the caller gets a 409 naming
 * the clash rather than a quiet second copy.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ workId: string }> }
) {
  const { workId } = await params
  const { libraryOrgId, error } = await requireIntakeEnabled()
  if (error || !libraryOrgId) return error ?? apiError('Not found', 404)

  let body: Parameters<typeof buildWorkPatch>[0]
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid JSON body')
  }
  if (!body || typeof body !== 'object') return apiError('Invalid JSON body')

  const built = buildWorkPatch(body)
  if (!built.ok) return apiError(built.error)

  try {
    const service = createServiceClient()

    // Scoped to the resolved library org, so a work id from elsewhere 404s
    // rather than being quietly mutated.
    const { data: updated, error: updateError } = await service
      .from('repertoire')
      .update({ ...built.patch, updated_at: new Date().toISOString() })
      .eq('id', workId)
      .eq('organization_id', libraryOrgId)
      .select('id, title, artist, ensemble, is_active')

    if (updateError) {
      if ((updateError as { code?: string }).code === '23505') {
        return apiError(
          'A work with that title and artist already exists for this ensemble. ' +
            'Search for it — you may want to add these parts to it instead.',
          409
        )
      }
      return serverError('Library update failed', updateError)
    }
    if (!updated || updated.length === 0) return apiError('Not found', 404)

    return apiSuccess({ work: updated[0] })
  } catch (err) {
    return serverError('Library update failed', err)
  }
}
