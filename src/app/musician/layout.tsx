import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { MusicianNav } from '@/components/musician/musician-nav'
import { MusicianHeader, MusicianDesktopHeader } from '@/components/musician/musician-header'
import { ImpersonationBanner } from '@/components/musician/impersonation-banner'
import { MusicianSignOutButton } from '@/components/musician/musician-sign-out-button'
import { RememberEmail } from '@/components/musician/remember-email'

export default async function MusicianLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const impersonateId = cookieStore.get('impersonate-musician')?.value

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // No user — render children bare (login/register pages handle their own layout)
    return <>{children}</>
  }

  let musician: { id: string; first_name: string; last_name: string; email: string | null; profile_photo_url: string | null } | null = null
  let isImpersonating = false
  let impersonatedOrg: string | null = null

  // Check if we're impersonating a musician
  if (impersonateId) {
    // Verify the musician exists and has a portal account
    const { data: impersonatedMusician } = await supabase
      .from('musicians')
      .select(`
        id, first_name, last_name, email, profile_photo_url, user_id, organization_id,
        organization:organizations(id, name)
      `)
      .eq('id', impersonateId)
      .single()

    if (impersonatedMusician && impersonatedMusician.user_id) {
      // Verify the current user is an admin of this musician's organization
      const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', impersonatedMusician.organization_id)
        .eq('user_id', user.id)
        .single()

      if (membership && ['owner', 'admin'].includes(membership.role)) {
        musician = {
          id: impersonatedMusician.id,
          first_name: impersonatedMusician.first_name,
          last_name: impersonatedMusician.last_name,
          email: impersonatedMusician.email,
          profile_photo_url: impersonatedMusician.profile_photo_url,
        }
        isImpersonating = true
        const org = impersonatedMusician.organization as unknown as { id: string; name: string }
        impersonatedOrg = org.name
      }
    }
  }

  // If not impersonating, get the user's own musician records
  if (!musician) {
    const { data: musicians } = await supabase
      .from('musicians')
      .select('id, first_name, last_name, email, profile_photo_url, portal_enabled')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)

    if (!musicians || musicians.length === 0) {
      return (
        <div className="flex min-h-screen items-center justify-center px-4 bg-gradient-to-b from-background to-muted/20">
          <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center space-y-4">
            <h2 className="text-xl font-semibold">No Musician Account Found</h2>
            <p className="text-sm text-muted-foreground">
              Your login doesn&apos;t have a musician profile linked to it. If you were invited to perform, try registering with the email your organization has on file.
            </p>
            <div className="flex flex-col gap-2">
              <a
                href="/musician/register"
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Register as a Musician
              </a>
              <MusicianSignOutButton />
            </div>
          </div>
        </div>
      )
    }

    // Check if portal access is disabled
    if ((musicians[0] as any).portal_enabled === false) {
      return (
        <div className="flex min-h-screen items-center justify-center px-4 bg-gradient-to-b from-background to-muted/20">
          <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center space-y-4">
            <h2 className="text-xl font-semibold">Portal Access Disabled</h2>
            <p className="text-sm text-muted-foreground">
              Your portal access has been disabled by your organization. Please contact them for assistance.
            </p>
            <MusicianSignOutButton />
          </div>
        </div>
      )
    }

    musician = musicians[0]
  }

  const musicianName = `${musician.first_name} ${musician.last_name}`

  // Get count of pending offers
  let pendingOffersCount = 0
  if (isImpersonating) {
    // When impersonating, just get offers for this specific musician
    const { count } = await supabase
      .from('contract_offers')
      .select('*', { count: 'exact', head: true })
      .eq('musician_id', musician.id)
      .in('status', ['pending', 'viewed'])

    pendingOffersCount = count || 0
  } else {
    // Normal flow: get all musician records for this user
    const { data: musicianIds } = await supabase
      .from('musicians')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (musicianIds && musicianIds.length > 0) {
      const ids = musicianIds.map((m) => m.id)
      const { count } = await supabase
        .from('contract_offers')
        .select('*', { count: 'exact', head: true })
        .in('musician_id', ids)
        .in('status', ['pending', 'viewed'])

      pendingOffersCount = count || 0
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Impersonation Banner */}
      {isImpersonating && (
        <ImpersonationBanner
          musicianName={musicianName}
          organizationName={impersonatedOrg || ''}
        />
      )}

      {/* Mobile Header */}
      <MusicianHeader
        musicianName={musicianName}
        email={musician.email || user.email || ''}
        profilePhotoUrl={musician.profile_photo_url}
      />

      {/* Desktop Header (shown in main content area) */}
      <div className="md:pl-60">
        <MusicianDesktopHeader
          musicianName={musicianName}
          email={musician.email || user.email || ''}
          profilePhotoUrl={musician.profile_photo_url}
        />
      </div>

      {/* Navigation */}
      <MusicianNav pendingOffersCount={pendingOffersCount} impersonateId={isImpersonating ? musician.id : null} />

      {/* Remember email for login prefill */}
      <RememberEmail email={musician.email || user.email || ''} />

      {/* Main Content */}
      <main className={`pb-20 md:pb-6 md:pl-60 ${isImpersonating ? 'pt-12' : ''}`}>
        <div className="mx-auto max-w-4xl p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
