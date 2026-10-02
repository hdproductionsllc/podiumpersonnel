import { NextRequest, NextResponse } from 'next/server'
import { requireOrgAdmin, apiError, apiSuccess } from '@/lib/api-helpers'
import { parseChairScopeInput, setChairScope } from '@/lib/staffing/requirements'

// Admin chooses which calls one chair works: every call, or only some. Only
// for an organization with call_scoped_requirements on, and only while nobody
// holds or is considering the chair. The rules live in setChairScope and the
// set_position_scope database function (src/lib/staffing/requirements.ts,
// migration 099); this only reads the request.
//
// Body: { serviceIds: null | string[] }   null: every call
// 200:  { success, changed }
// 4xx/5xx: { error, code? }
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ positionId: string }> }
) {
  const { positionId } = await params
  const { user, error } = await requireOrgAdmin()
  if (error) return error

  const parsed = parseChairScopeInput(await request.json().catch(() => null))
  if (!parsed.ok) return apiError(parsed.error)

  const result = await setChairScope(user!.id, positionId, parsed.value)
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  }
  return apiSuccess({ success: true, changed: result.changed })
}
