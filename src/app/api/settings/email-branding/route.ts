import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateEmailBrandingSchema } from '@/lib/validations/settings'

export async function PATCH(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization found' }, { status: 404 })
  }

  if (membership.role !== 'owner' && membership.role !== 'admin') {
    return NextResponse.json({ error: 'Only owners and admins can update email branding' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = updateEmailBrandingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { error: updateError } = await supabase
    .from('organizations')
    .update({
      email_logo_url: parsed.data.email_logo_url || null,
      email_brand_color: parsed.data.email_brand_color || '#3b82f6',
      email_footer_text: parsed.data.email_footer_text || null,
    })
    .eq('id', membership.organization_id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
