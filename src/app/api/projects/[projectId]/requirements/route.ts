import { NextRequest, NextResponse } from 'next/server'
import { requireOrgAdmin, apiError, apiSuccess } from '@/lib/api-helpers'
import { createRequirement, parseRequirementInput } from '@/lib/staffing/requirements'

// Admin adds a requirement to a gig ("Stagehand x 8, load-in only") and its
// chairs are made at once. Only for an organization with
// call_scoped_requirements on. The rules live in createRequirement and the
// create_requirement database function (src/lib/staffing/requirements.ts,
// migration 099); this only reads the request.
//
// Body: { instrumentId, quantity, serviceIds: null | string[], defaultPay?, notes?, requestId }
//       requestId is the dialog's own id for this request: sending it again
//       returns what the first request made instead of making more chairs.
// 200:  { success, created, requirement, positionIds }
// 4xx/5xx: { error, code? }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const { user, error } = await requireOrgAdmin()
  if (error) return error

  const parsed = parseRequirementInput(await request.json().catch(() => null))
  if (!parsed.ok) return apiError(parsed.error)

  const result = await createRequirement(user!.id, projectId, parsed.value)
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  }
  return apiSuccess({
    success: true,
    created: result.created,
    requirement: result.requirement,
    positionIds: result.positionIds,
  })
}
