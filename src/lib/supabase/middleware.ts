import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if expired - required for Server Components
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protected routes - Org admin
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
                      request.nextUrl.pathname.startsWith('/signup') ||
                      request.nextUrl.pathname.startsWith('/forgot-password')
  const isDashboardRoute = request.nextUrl.pathname.startsWith('/dashboard') ||
                          request.nextUrl.pathname === '/'
  const isOnboardingRoute = request.nextUrl.pathname.startsWith('/onboarding')
  const isResetPasswordRoute = request.nextUrl.pathname.startsWith('/reset-password')

  // Musician portal routes
  const pathname = request.nextUrl.pathname
  const isMusicianRoute = pathname.startsWith('/musician')
  const isMusicianAuthRoute = pathname.startsWith('/musician/login') ||
                              pathname.startsWith('/musician/register') ||
                              pathname.startsWith('/musician/activate') ||
                              pathname.startsWith('/musician/forgot-password') ||
                              pathname.startsWith('/musician/reset-password') ||
                              pathname.startsWith('/musician/auth/callback')
  const isMusicianProtectedRoute = isMusicianRoute && !isMusicianAuthRoute

  // Redirect unauthenticated users from protected routes
  if (!user && (isDashboardRoute || isOnboardingRoute)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirect unauthenticated musicians from protected musician routes
  if (!user && isMusicianProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/musician/login'
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth routes (except reset-password)
  if (user && isAuthRoute && !isResetPasswordRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Redirect authenticated musicians away from musician auth routes
  // But allow through if there's an error param (e.g. no_musician_records) to avoid redirect loops
  const hasErrorParam = request.nextUrl.searchParams.has('error')
  if (user && isMusicianAuthRoute && !pathname.startsWith('/musician/reset-password') && !hasErrorParam) {
    const url = request.nextUrl.clone()
    url.pathname = '/musician'
    return NextResponse.redirect(url)
  }

  // Pass impersonate param as a cookie so the musician layout can read it
  // (layouts don't receive searchParams in Next.js App Router)
  const impersonateId = request.nextUrl.searchParams.get('impersonate')
  if (isMusicianRoute) {
    if (impersonateId) {
      supabaseResponse.cookies.set('impersonate-musician', impersonateId, {
        path: '/musician',
        maxAge: 60 * 60, // 1 hour
        httpOnly: true,
        sameSite: 'lax',
      })
    } else {
      // Clear the cookie when navigating without impersonate param
      supabaseResponse.cookies.delete('impersonate-musician')
    }
  }

  return supabaseResponse
}
