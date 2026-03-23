import { updateOrganizationSchema } from '@/lib/validations/settings'
import { requireOrgAdmin, apiSuccess, apiError } from '@/lib/api-helpers'

export async function PATCH(request: Request) {
  const { supabase, membership, error } = await requireOrgAdmin()
  if (error) return error

  const body = await request.json()
  const parsed = updateOrganizationSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(parsed.error.issues[0].message)
  }

  // Check if slug is already taken by another organization
  if (parsed.data.slug) {
    const { data: existingOrg } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', parsed.data.slug)
      .neq('id', membership!.organization_id)
      .single()

    if (existingOrg) {
      return apiError('This slug is already taken')
    }
  }

  const { error: updateError } = await supabase
    .from('organizations')
    .update({
      name: parsed.data.name,
      slug: parsed.data.slug,
      timezone: parsed.data.timezone,
      musician_policy: parsed.data.musician_policy || null,
      ...(parsed.data.disable_staffing_alerts !== undefined && {
        disable_staffing_alerts: parsed.data.disable_staffing_alerts,
      }),
    })
    .eq('id', membership!.organization_id)

  if (updateError) {
    return apiError(updateError.message, 500)
  }

  return apiSuccess({ success: true })
}
