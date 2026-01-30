import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendAdminWelcomeEmail } from '@/lib/email/send'
import { getAppUrl } from '@/lib/utils'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { organizationName, userName } = await request.json()

  if (!organizationName || !userName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const email = user.email
  if (!email) {
    return NextResponse.json({ error: 'No email on account' }, { status: 400 })
  }

  try {
    await sendAdminWelcomeEmail({
      to: email,
      userName,
      organizationName,
      dashboardUrl: `${getAppUrl()}/dashboard`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to send welcome email:', error)
    // Don't fail the onboarding flow if email fails
    return NextResponse.json({ success: false, error: 'Email send failed' })
  }
}
