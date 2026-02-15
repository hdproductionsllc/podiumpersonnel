import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { addMemberSchema } from '@/lib/validations/settings'
import { resolveOrgPlan, canAddMember, type OrgBilling } from '@/lib/plan'

export async function GET() {
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

  const { data: members } = await supabase
    .from('organization_members')
    .select('id, user_id, role, created_at')
    .eq('organization_id', membership.organization_id)
    .order('created_at', { ascending: true })

  if (!members) {
    return NextResponse.json({ members: [] })
  }

  const adminClient = createAdminClient()
  const membersWithEmails = await Promise.all(
    members.map(async (member) => {
      const { data: { user: memberUser } } = await adminClient.auth.admin.getUserById(member.user_id)
      return {
        id: member.id,
        user_id: member.user_id,
        role: member.role,
        email: memberUser?.email || 'Unknown',
        created_at: member.created_at,
      }
    })
  )

  return NextResponse.json({ members: membersWithEmails })
}

export async function POST(request: Request) {
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

  if (membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only the owner can add members' }, { status: 403 })
  }

  // Plan gate: check member seat limit
  const adminClientForPlan = createAdminClient()
  const { data: org } = await adminClientForPlan
    .from('organizations')
    .select('plan_tier, trial_ends_at, stripe_customer_id, stripe_subscription_id, subscription_status')
    .eq('id', membership.organization_id)
    .single()

  if (org) {
    const plan = resolveOrgPlan(org as OrgBilling)
    const { count } = await adminClientForPlan
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', membership.organization_id)

    if (!canAddMember(plan, count ?? 0)) {
      return NextResponse.json(
        { error: 'Free plan is limited to 1 admin seat. Upgrade to Pro to add team members.' },
        { status: 403 }
      )
    }
  }

  const body = await request.json()
  const parsed = addMemberSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Find user by email
  const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers()
  if (listError) {
    return NextResponse.json({ error: 'Failed to look up user' }, { status: 500 })
  }

  const targetUser = users.find((u) => u.email === parsed.data.email)
  if (!targetUser) {
    return NextResponse.json({ error: 'No account found with that email address' }, { status: 404 })
  }

  // Check if already a member
  const { data: existingMember } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', membership.organization_id)
    .eq('user_id', targetUser.id)
    .single()

  if (existingMember) {
    return NextResponse.json({ error: 'User is already a member of this organization' }, { status: 409 })
  }

  const { error: insertError } = await adminClient
    .from('organization_members')
    .insert({
      organization_id: membership.organization_id,
      user_id: targetUser.id,
      role: parsed.data.role,
    })

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
