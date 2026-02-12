import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { sendMusicianWelcomeEmail } from '@/lib/email/send'
import { getAppUrl } from '@/lib/utils'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const activationToken = searchParams.get('activation_token')
  const next = searchParams.get('next') ?? '/musician'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // If this is an activation callback, link by token first
      if (activationToken) {
        await supabase.rpc('activate_musician_by_token', {
          p_user_id: data.user.id,
          p_token: activationToken,
        })
      }

      // Link any musician records with matching email to this user (lowercase for case-insensitive match)
      await supabase.rpc('link_musician_records_to_user', {
        p_user_id: data.user.id,
        p_email: (data.user.email || '').toLowerCase(),
      })

      // Check if this user has any linked musician records
      const { data: musicians } = await supabase
        .from('musicians')
        .select('id, first_name, last_name, portal_last_login, organization:organizations(name)')
        .eq('user_id', data.user.id)

      // No musician records found — check if they're an org admin, otherwise reject
      if (!musicians || musicians.length === 0) {
        const { data: orgMember } = await supabase
          .from('organization_members')
          .select('id')
          .eq('user_id', data.user.id)
          .limit(1)
          .maybeSingle()

        if (orgMember) {
          // This is an org admin who landed on the musician login — send them to the admin dashboard
          return NextResponse.redirect(`${origin}/dashboard`)
        }

        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/musician/login?error=no_musician_records`)
      }

      const isFirstLogin = musicians && musicians.length > 0 &&
        musicians.every((m: any) => !m.portal_last_login)

      // Update last login time for all linked musicians
      await supabase
        .from('musicians')
        .update({ portal_last_login: new Date().toISOString() })
        .eq('user_id', data.user.id)

      // Send welcome email on first login
      if (isFirstLogin && data.user.email && musicians && musicians.length > 0) {
        const firstMusician = musicians[0] as any
        const orgNames = musicians
          .map((m: any) => m.organization?.name)
          .filter(Boolean)

        sendMusicianWelcomeEmail({
          to: data.user.email,
          musicianName: `${firstMusician.first_name} ${firstMusician.last_name}`,
          loginUrl: `${getAppUrl()}/musician/login`,
          organizations: orgNames,
        }).catch((err) => console.warn('Failed to send welcome email:', err))
      }

      // Redirect to the specified next URL or musician dashboard
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/musician/login?error=auth_callback_error`)
}
