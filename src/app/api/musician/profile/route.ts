import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send'
import { getAppUrl } from '@/lib/utils'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get all musician records for this user
  const { data: musicians, error } = await supabase
    .from('musicians')
    .select(`
      id,
      first_name,
      last_name,
      email,
      phone,
      profile_photo_url,
      w9_on_file,
      w9_file_url,
      zelle_method,
      zelle_verified,
      organization:organizations(id, name)
    `)
    .eq('user_id', user.id)
    .eq('is_active', true)

  if (error || !musicians || musicians.length === 0) {
    return NextResponse.json({ error: 'No musician records found' }, { status: 404 })
  }

  // Get notification preferences for the primary musician
  const primaryMusician = musicians[0]
  const { data: preferences } = await supabase
    .from('musician_notification_preferences')
    .select('*')
    .eq('musician_id', primaryMusician.id)
    .maybeSingle()

  // Get auth user info
  const authProviders = user.app_metadata?.providers || []
  const hasGoogleLinked = authProviders.includes('google')

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      hasGoogleLinked,
    },
    musician: primaryMusician,
    organizations: musicians.map((m: any) => ({
      id: m.organization?.id,
      name: m.organization?.name,
      musicianId: m.id,
    })),
    notificationPreferences: preferences || {
      email_new_offers: true,
      email_offer_reminders: true,
      email_schedule_changes: true,
      email_payment_updates: true,
    },
  })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { first_name, last_name, phone, zelle_method, w9_on_file, w9_file_url } = body

  // Build update payload — only include fields that were provided
  const updatePayload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  }

  if (first_name !== undefined) updatePayload.first_name = first_name
  if (last_name !== undefined) updatePayload.last_name = last_name
  if (phone !== undefined) updatePayload.phone = phone
  if (zelle_method !== undefined) updatePayload.zelle_method = zelle_method || null
  if (w9_on_file !== undefined) updatePayload.w9_on_file = w9_on_file
  if (w9_file_url !== undefined) updatePayload.w9_file_url = w9_file_url

  // Update all musician records for this user
  const { error } = await supabase
    .from('musicians')
    .update(updatePayload)
    .eq('user_id', user.id)
    .eq('is_active', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Notify org admins when musician uploads W9
  if (w9_on_file === true && w9_file_url) {
    notifyAdminsW9Uploaded(user.id).catch((err) =>
      console.warn('Failed to send W9 notification:', err)
    )
  }

  return NextResponse.json({ success: true })
}

async function notifyAdminsW9Uploaded(userId: string) {
  const admin = createAdminClient()

  // Get musician info
  const { data: musician } = await admin
    .from('musicians')
    .select('id, first_name, last_name, organization_id')
    .eq('user_id', userId)
    .limit(1)
    .single()

  if (!musician) return

  // Get org admin user IDs
  const { data: admins } = await admin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', musician.organization_id)
    .in('role', ['owner', 'admin'])

  if (!admins || admins.length === 0) return

  // Look up emails from auth.users
  const adminEmails: string[] = []
  for (const a of admins) {
    const { data: { user } } = await admin.auth.admin.getUserById(a.user_id)
    if (user?.email) adminEmails.push(user.email)
  }

  if (adminEmails.length === 0) return

  const musicianName = `${musician.first_name} ${musician.last_name}`
  const dashboardUrl = `${getAppUrl()}/dashboard/musicians`

  await sendEmail({
    to: adminEmails,
    subject: `W-9 Submitted: ${musicianName}`,
    html: `
      <p>Hi,</p>
      <p><strong>${musicianName}</strong> has uploaded their W-9 form.</p>
      <p>You can view and download it from the <a href="${dashboardUrl}">Musicians dashboard</a>.</p>
      <p>— Podium</p>
    `,
  })
}
