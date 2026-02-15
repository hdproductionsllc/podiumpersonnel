import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPortalInvitationEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import crypto from 'crypto'
import { getAppUrl } from '@/lib/utils'
import { getOrgPlan } from '@/lib/api-helpers'
import { canUseEmailFeatures } from '@/lib/plan'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Plan gate
  const { data: mem } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single()
  if (mem) {
    const plan = await getOrgPlan(mem.organization_id)
    if (plan && !canUseEmailFeatures(plan)) {
      return NextResponse.json({ error: 'Portal invites require a Pro subscription' }, { status: 403 })
    }
  }

  // Get musician with organization
  const { data: musician, error: fetchError } = await supabase
    .from('musicians')
    .select(`
      id,
      first_name,
      last_name,
      email,
      user_id,
      portal_invite_token,
      organization:organizations(id, name, email_logo_url, email_brand_color)
    `)
    .eq('id', id)
    .single()

  if (fetchError || !musician) {
    console.error('Failed to fetch musician for portal invite:', fetchError)
    return NextResponse.json({ error: `Musician not found: ${fetchError?.message || 'Unknown error'}` }, { status: 404 })
  }

  // Verify user has access to this organization
  const organization = musician.organization as any
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', organization.id)
    .eq('user_id', user.id)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Check if musician has email
  if (!musician.email) {
    return NextResponse.json({ error: 'Musician does not have an email address' }, { status: 400 })
  }

  // Check if musician already has a user account linked
  if (musician.user_id) {
    return NextResponse.json({ error: 'Musician already has a portal account' }, { status: 400 })
  }

  // Generate invite token
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7) // 7 days expiration

  // Update musician with invite token
  const { error: updateError } = await supabase
    .from('musicians')
    .update({
      portal_invite_token: token,
      portal_invite_sent_at: new Date().toISOString(),
      portal_invite_expires_at: expiresAt.toISOString(),
    })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 })
  }

  // Send invitation email
  try {
    const baseUrl = getAppUrl()
    console.log('Sending portal invite email to:', musician.email)
    const emailResult = await sendPortalInvitationEmail({
      to: musician.email,
      musicianName: `${musician.first_name} ${musician.last_name}`,
      organizationName: organization.name,
      activationUrl: `${baseUrl}/musician/activate/${token}`,
      expiresAt: expiresAt.toISOString(),
      branding: {
        logoUrl: organization.email_logo_url,
        brandColor: organization.email_brand_color,
      },
    })
    console.log('Portal invite email sent successfully:', emailResult)

    await logEmail({
      organizationId: organization.id,
      recipientEmail: musician.email,
      recipientName: `${musician.first_name} ${musician.last_name}`,
      subject: `${organization.name} has invited you to Podium`,
      emailType: 'portal_invitation',
      musicianId: musician.id,
      resendEmailId: emailResult?.id || null,
    })
  } catch (emailError) {
    console.error('Failed to send portal invitation email:', emailError)
    return NextResponse.json({ error: 'Failed to send invitation email' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
