import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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

      // Update last login time for all linked musicians
      await supabase
        .from('musicians')
        .update({ portal_last_login: new Date().toISOString() })
        .eq('user_id', data.user.id)

      // Redirect to the specified next URL or musician dashboard
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/musician/login?error=auth_callback_error`)
}
