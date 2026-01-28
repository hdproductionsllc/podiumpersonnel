import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPortalInvitationEmail } from '@/lib/email/send'
import crypto from 'crypto'
import { getAppUrl } from '@/lib/utils'

export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { musicianIds } = body

  if (!musicianIds || !Array.isArray(musicianIds) || musicianIds.length === 0) {
    return NextResponse.json({ error: 'No musicians specified' }, { status: 400 })
  }

  // Get musicians with organizations
  const { data: musicians, error: fetchError } = await supabase
    .from('musicians')
    .select(`
      id,
      first_name,
      last_name,
      email,
      user_id,
      organization_id,
      organization:organizations(id, name, email_logo_url, email_brand_color)
    `)
    .in('id', musicianIds)

  if (fetchError || !musicians) {
    console.error('Failed to fetch musicians for portal invites:', fetchError)
    return NextResponse.json({ error: `Failed to fetch musicians: ${fetchError?.message || 'Unknown error'}` }, { status: 500 })
  }

  // Verify user has access to all musicians' organizations
  const organizationIds = [...new Set(musicians.map((m) => m.organization_id))]

  for (const orgId of organizationIds) {
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
  }

  // Filter to musicians who can receive invites (have email, no user_id yet)
  const eligibleMusicians = musicians.filter((m) => m.email && !m.user_id)

  let sent = 0
  let failed = 0
  const baseUrl = getAppUrl()

  for (const musician of eligibleMusicians) {
    try {
      // Generate invite token
      const token = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)

      // Update musician with invite token
      const { error: updateError } = await supabase
        .from('musicians')
        .update({
          portal_invite_token: token,
          portal_invite_sent_at: new Date().toISOString(),
          portal_invite_expires_at: expiresAt.toISOString(),
        })
        .eq('id', musician.id)

      if (updateError) {
        failed++
        continue
      }

      const organization = musician.organization as any

      // Send invitation email
      await sendPortalInvitationEmail({
        to: musician.email!,
        musicianName: `${musician.first_name} ${musician.last_name}`,
        organizationName: organization.name,
        activationUrl: `${baseUrl}/musician/activate/${token}`,
        expiresAt: expiresAt.toISOString(),
        branding: {
          logoUrl: organization.email_logo_url,
          brandColor: organization.email_brand_color,
        },
      })

      sent++
    } catch (err) {
      console.error('Failed to send portal invite to musician:', musician.id, err)
      failed++
    }
  }

  return NextResponse.json({
    sent,
    failed,
    skipped: musicians.length - eligibleMusicians.length,
  })
}
