import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendAdminWelcomeEmail, sendEmail } from '@/lib/email/send'
import { getAppUrl } from '@/lib/utils'

const PLATFORM_ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL || null

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

    // Notify platform admin of new signup
    if (PLATFORM_ADMIN_EMAIL) {
      const signupDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })

      await sendEmail({
        to: PLATFORM_ADMIN_EMAIL,
        subject: `New Podium Signup: ${organizationName}`,
        html: `
          <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
            <h2 style="margin: 0 0 16px;">New Organization Signed Up</h2>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr><td style="padding: 8px 0; color: #666;">Organization</td><td style="padding: 8px 0; font-weight: bold;">${organizationName}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Owner</td><td style="padding: 8px 0;">${userName}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Email</td><td style="padding: 8px 0;">${email}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Signed Up</td><td style="padding: 8px 0;">${signupDate}</td></tr>
            </table>
          </div>
        `,
      }).catch(() => {
        // Don't fail if platform notification fails
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to send welcome email:', error)
    // Don't fail the onboarding flow if email fails
    return NextResponse.json({ success: false, error: 'Email send failed' })
  }
}
