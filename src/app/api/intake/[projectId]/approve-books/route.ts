/**
 * POST /api/intake/[projectId]/approve-books — the owner's sign-off that the
 * assembled books look good and are ready to send (Book Builder pipeline:
 * confirm → assemble + download → APPROVE → assign + send).
 *
 * Body: { approved: boolean } — true stamps books_approved_at, false revokes.
 * Requires the intake to be CONFIRMED (books are built from the confirmed
 * list; there is nothing to approve on a draft). Any later save of the intake
 * clears the stamp automatically (see the PUT route).
 *
 * Security: org from the admin's membership; project verified to belong to it.
 */

import { requireIntakeEnabled, apiError, apiSuccess, serverError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const { membership, error } = await requireIntakeEnabled()
  if (error || !membership) return error!
  const orgId = membership.organization_id

  let body: { approved?: unknown }
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid JSON body', 400)
  }
  if (typeof body.approved !== 'boolean') {
    return apiError('approved (boolean) is required.', 400)
  }

  const service = createServiceClient()

  const { data: project, error: projErr } = await service
    .from('projects')
    .select('id, organization_id')
    .eq('id', projectId)
    .maybeSingle()
  if (projErr) return serverError('approve-books: verify project', projErr)
  if (!project || project.organization_id !== orgId) {
    return apiError('Project not found', 404)
  }

  const { data: intake, error: intakeErr } = await service
    .from('intakes')
    .select('id, status')
    .eq('project_id', projectId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (intakeErr) return serverError('approve-books: load intake', intakeErr)
  if (!intake) return apiError('This project has no client selections yet.', 404)
  if (body.approved && intake.status !== 'confirmed') {
    return apiError('Confirm the client selections first — approval covers the confirmed list.', 409)
  }

  const stamp = body.approved ? new Date().toISOString() : null
  const { error: updErr } = await service
    .from('intakes')
    .update({ books_approved_at: stamp })
    .eq('id', intake.id)
    .eq('organization_id', orgId)
  if (updErr) return serverError('approve-books: update', updErr)

  return apiSuccess({ booksApprovedAt: stamp })
}
