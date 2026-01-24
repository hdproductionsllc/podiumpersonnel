import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { changeMemberRoleSchema } from '@/lib/validations/settings'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const { memberId } = await params
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

  if (!membership || membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only the owner can change member roles' }, { status: 403 })
  }

  // Get the target member
  const { data: targetMember } = await supabase
    .from('organization_members')
    .select('id, user_id, role')
    .eq('id', memberId)
    .eq('organization_id', membership.organization_id)
    .single()

  if (!targetMember) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  if (targetMember.user_id === user.id) {
    return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 })
  }

  if (targetMember.role === 'owner') {
    return NextResponse.json({ error: 'Cannot change the owner role' }, { status: 400 })
  }

  const body = await request.json()
  const parsed = changeMemberRoleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const { error: updateError } = await adminClient
    .from('organization_members')
    .update({ role: parsed.data.role })
    .eq('id', memberId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const { memberId } = await params
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

  if (!membership || membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only the owner can remove members' }, { status: 403 })
  }

  // Get the target member
  const { data: targetMember } = await supabase
    .from('organization_members')
    .select('id, user_id, role')
    .eq('id', memberId)
    .eq('organization_id', membership.organization_id)
    .single()

  if (!targetMember) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  }

  if (targetMember.user_id === user.id) {
    return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 })
  }

  if (targetMember.role === 'owner') {
    return NextResponse.json({ error: 'Cannot remove the owner' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const { error: deleteError } = await adminClient
    .from('organization_members')
    .delete()
    .eq('id', memberId)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
