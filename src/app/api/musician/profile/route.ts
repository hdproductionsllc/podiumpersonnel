import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
  const { first_name, last_name, phone } = body

  // Update all musician records for this user
  const { error } = await supabase
    .from('musicians')
    .update({
      first_name,
      last_name,
      phone,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('is_active', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
