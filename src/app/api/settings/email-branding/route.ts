import { updateEmailBrandingSchema } from '@/lib/validations/settings'
import { requireOrgAdmin, apiSuccess, apiError } from '@/lib/api-helpers'

export async function PATCH(request: Request) {
  const { supabase, membership, error } = await requireOrgAdmin()
  if (error) return error

  const body = await request.json()
  const parsed = updateEmailBrandingSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(parsed.error.issues[0].message)
  }

  const { error: updateError } = await supabase
    .from('organizations')
    .update({
      email_logo_url: parsed.data.email_logo_url || null,
      email_brand_color: parsed.data.email_brand_color || '#1E293B',
      email_footer_text: parsed.data.email_footer_text || null,
    })
    .eq('id', membership!.organization_id)

  if (updateError) {
    return apiError(updateError.message, 500)
  }

  return apiSuccess({ success: true })
}
