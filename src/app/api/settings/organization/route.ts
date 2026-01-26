import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateOrganizationSchema } from '@/lib/validations/settings'

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
    return NextResponse.json({ error: 'Only owners and admins can update the organization' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = updateOrganizationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  // Check if slug is already taken by another organization
  if (parsed.data.slug) {
    const { data: existingOrg } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', parsed.data.slug)
      .neq('id', membership.organization_id)
      .single()

    if (existingOrg) {
      return NextResponse.json({ error: 'This slug is already taken' }, { status: 400 })
    }
  }

  const { error: updateError } = await supabase
    .from('organizations')
    .update({
      name: parsed.data.name,
      slug: parsed.data.slug,
      musician_policy: parsed.data.musician_policy || null,
    })
    .eq('id', membership.organization_id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
