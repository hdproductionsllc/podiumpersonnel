/**
 * /api/intake/[projectId]/book-cover — the owner's own first page for every
 * book, in place of the generated playlist page (088).
 *
 *   POST   { storagePath, fileName } — record a PDF already uploaded through
 *          files/upload-url (signed upload into project-files).
 *   DELETE — go back to the generated page.
 *
 * Either way the first page of every book changes, so an approval of the old
 * books no longer covers what a rebuild produces: books_approved_at is cleared,
 * exactly as a new Spotify playlist clears it. The replaced PDF is removed from
 * storage AFTER the row points away from it, so a failure never leaves the
 * intake pointing at nothing.
 *
 * Security: org from the admin's membership; project verified to belong to it;
 * the storage key must sit under this org's and this project's folder — the
 * shape upload-url mints — so a caller can never attach another tenant's file.
 */

import { requireIntakeEnabled, apiError, apiSuccess, serverError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'

const BUCKET = 'project-files'

async function loadIntake(projectId: string) {
  const { membership, error } = await requireIntakeEnabled()
  if (error || !membership) return { error: error! }
  const orgId = membership.organization_id
  const service = createServiceClient()

  const { data: project, error: projErr } = await service
    .from('projects')
    .select('id, organization_id')
    .eq('id', projectId)
    .maybeSingle()
  if (projErr) return { error: serverError('book-cover: verify project', projErr) }
  if (!project || project.organization_id !== orgId) return { error: apiError('Project not found', 404) }

  const { data: intake, error: intakeErr } = await service
    .from('intakes')
    .select('id, status, book_cover_path')
    .eq('project_id', projectId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (intakeErr) {
    // 42703 = undefined column: the code shipped before migration 088 was run.
    if (intakeErr.code === '42703') {
      return { error: apiError('Custom first pages need a one-time database update (migration 088).', 503) }
    }
    return { error: serverError('book-cover: load intake', intakeErr) }
  }
  if (!intake) return { error: apiError('This project has no client selections yet.', 404) }
  return { service, orgId, intake }
}

type Loaded = Exclude<Awaited<ReturnType<typeof loadIntake>>, { error: unknown }>

async function setCover({ service, orgId, intake }: Loaded, next: { path: string; name: string } | null) {
  const { error: updErr } = await service
    .from('intakes')
    .update({
      book_cover_path: next?.path ?? null,
      book_cover_name: next?.name ?? null,
      books_approved_at: null,
    })
    .eq('id', intake.id)
    .eq('organization_id', orgId)
  if (updErr) return serverError('book-cover: update', updErr)

  const previous = intake.book_cover_path as string | null
  if (previous && previous !== next?.path) {
    const { error: rmErr } = await service.storage.from(BUCKET).remove([previous])
    // An orphaned PDF costs nothing and harms nobody; say so and move on.
    if (rmErr) console.warn('book-cover: could not remove the previous cover:', rmErr)
  }

  return apiSuccess({ cover: next ? { name: next.name } : null, booksApprovedAt: null })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params

  let body: { storagePath?: unknown; fileName?: unknown }
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid JSON body', 400)
  }
  const storagePath = typeof body.storagePath === 'string' ? body.storagePath : ''
  const fileName = typeof body.fileName === 'string' ? body.fileName.trim().slice(0, 200) : ''
  if (!storagePath || !fileName) return apiError('storagePath and fileName are required.', 400)

  const loaded = await loadIntake(projectId)
  if ('error' in loaded) return loaded.error
  const prefix = `${loaded.orgId}/${projectId}/`
  if (!storagePath.startsWith(prefix) || !/^[0-9a-f-]{36}\.pdf$/i.test(storagePath.slice(prefix.length))) {
    return apiError('That file does not belong to this project.', 400)
  }

  return setCover(loaded, { path: storagePath, name: fileName })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const loaded = await loadIntake(projectId)
  if ('error' in loaded) return loaded.error
  return setCover(loaded, null)
}
