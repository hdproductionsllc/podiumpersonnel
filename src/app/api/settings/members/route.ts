import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { addMemberSchema } from '@/lib/validations/settings'
import { checkInviteEligibility } from '@/lib/org-membership'
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

  // Batch-fetch all users at once instead of N+1 sequential queries
  const adminClient = createAdminClient()
  const userIds = members.map((m) => m.user_id)
  const emailMap = new Map<string, string>()

  // Supabase listUsers paginates at 1000 — more than enough for org members
  const { data: { users: allUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
  for (const u of allUsers) {
    if (userIds.includes(u.id)) {
      emailMap.set(u.id, u.email || 'Unknown')
    }
  }

  const membersWithEmails = members.map((member) => ({
    id: member.id,
    user_id: member.user_id,
    role: member.role,
    email: emailMap.get(member.user_id) || 'Unknown',
    created_at: member.created_at,
  }))

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
    .select('plan_tier, trial_ends_at, stripe_customer_id, stripe_subscription_id, subscription_status, is_comped')
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
        { error: 'Your current plan has reached its admin seat limit. Upgrade to add more team members.' },
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

  // One account belongs to exactly one organization. Look up EVERY membership
  // this account holds, not just one in the current org.
  //
  // This must use the admin client: the SELECT policy on organization_members is
  // USING (is_org_member(organization_id)), so a caller-scoped query can only
  // see rows for orgs the CALLER belongs to. A membership in the invitee's own
  // org would be invisible here and the guard would silently never fire.
  const { data: existingMemberships, error: membershipLookupError } = await adminClient
    .from('organization_members')
    .select('id, organization_id')
    .eq('user_id', targetUser.id)

  if (membershipLookupError) {
    return NextResponse.json({ error: 'Failed to look up user' }, { status: 500 })
  }

  // Refuse if the account is already in this org, or in a DIFFERENT one — see
  // checkInviteEligibility for why a second membership breaks the invitee.
  const eligibility = checkInviteEligibility(
    existingMemberships ?? [],
    membership.organization_id
  )

  if (!eligibility.allowed) {
    return NextResponse.json({ error: eligibility.error }, { status: eligibility.status })
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
