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

  // Get primary musician
  const { data: musician } = await supabase
    .from('musicians')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!musician) {
    return NextResponse.json({ error: 'No musician records found' }, { status: 404 })
  }

  // Get preferences
  const { data: preferences } = await supabase
    .from('musician_notification_preferences')
    .select('*')
    .eq('musician_id', musician.id)
    .maybeSingle()

  return NextResponse.json({
    preferences: preferences || {
      musician_id: musician.id,
      email_new_offers: true,
      email_offer_reminders: true,
      email_schedule_changes: true,
      email_payment_updates: true,
    },
  })
}

export async function PUT(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    email_new_offers,
    email_offer_reminders,
    email_schedule_changes,
    email_payment_updates,
  } = body

  // Get all musician records for this user
  const { data: musicians } = await supabase
    .from('musicians')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)

  if (!musicians || musicians.length === 0) {
    return NextResponse.json({ error: 'No musician records found' }, { status: 404 })
  }

  // Upsert preferences for all musician records
  for (const musician of musicians) {
    const { error } = await supabase
      .from('musician_notification_preferences')
      .upsert({
        musician_id: musician.id,
        email_new_offers,
        email_offer_reminders,
        email_schedule_changes,
        email_payment_updates,
        updated_at: new Date().toISOString(),
      })

    if (error) {
      console.error('Failed to update preferences for musician:', musician.id, error)
    }
  }

  return NextResponse.json({ success: true })
}
