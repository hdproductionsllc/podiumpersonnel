import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Check if the user has an organization — if not, send to onboarding
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: membership } = await supabase
          .from('organization_members')
          .select('id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle()

        if (!membership) {
          // Check if they have musician records — they may have landed on the wrong login
          const { data: musicianRecords } = await supabase
            .from('musicians')
            .select('id')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle()

          if (musicianRecords) {
            return NextResponse.redirect(`${origin}/musician`)
          }

          // Try linking by email in case they're a musician who hasn't been linked yet
          if (user.email) {
            await supabase.rpc('link_musician_records_to_user', {
              p_user_id: user.id,
              p_email: user.email.toLowerCase(),
            })

            const { data: linkedMusician } = await supabase
              .from('musicians')
              .select('id')
              .eq('user_id', user.id)
              .limit(1)
              .maybeSingle()

            if (linkedMusician) {
              return NextResponse.redirect(`${origin}/musician`)
            }
          }

          return NextResponse.redirect(`${origin}/onboarding`)
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
