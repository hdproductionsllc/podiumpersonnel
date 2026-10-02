import { NextRequest, NextResponse } from 'next/server'
import { requireOrgAdmin, apiError, apiSuccess } from '@/lib/api-helpers'
import { setChairAutoCascade } from '@/lib/staffing/settings'

// Admin switches auto-offer off (or back on) for one chair. The rule lives in
// setChairAutoCascade (src/lib/staffing/settings.ts); this only reads the request.
//
// Body: { disabled: boolean }
// 200:  { success, disabled, changed }
// 4xx/5xx: { error, code? }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ positionId: string }> }
) {
  const { positionId } = await params
  const { supabase, user, error } = await requireOrgAdmin()
  if (error) return error

  const body = await request.json().catch(() => null)
  if (!body || typeof body.disabled !== 'boolean') {
    return apiError('disabled (true or false) is required')
  }

  const result = await setChairAutoCascade(supabase, user!.id, positionId, body.disabled)
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  }
  return apiSuccess({ success: true, disabled: result.disabled, changed: result.changed })
}
