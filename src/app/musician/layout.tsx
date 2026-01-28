import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MusicianNav } from '@/components/musician/musician-nav'
import { MusicianHeader, MusicianDesktopHeader } from '@/components/musician/musician-header'
import { ImpersonationBanner } from '@/components/musician/impersonation-banner'

export default async function MusicianLayout({
  children,
  searchParams,
}: {
  children: React.ReactNode
  searchParams?: Promise<{ impersonate?: string }>
}) {
  const supabase = await createClient()
  const params = await searchParams
  const impersonateId = params?.impersonate

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/musician/login')
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
      // User has no musician records, redirect to login with error
      redirect('/musician/login?error=no_musician_records')
    }

    // Check if portal access is disabled
    if ((musicians[0] as any).portal_enabled === false) {
      redirect('/musician/login?error=portal_disabled')
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
      <MusicianNav pendingOffersCount={pendingOffersCount} />

      {/* Main Content */}
      <main className={`pb-20 md:pb-6 md:pl-60 ${isImpersonating ? 'pt-12' : ''}`}>
        <div className="mx-auto max-w-4xl p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
