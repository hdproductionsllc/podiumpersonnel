import { redirect } from 'next/navigation'
import { createClient, createServiceClient, resolveMusicianIds } from '@/lib/supabase/server'
import { UnifiedDashboard, UnifiedDashboardSkeleton } from '@/components/musician/unified-dashboard'
import type { ProjectCardData } from '@/components/musician/project-card'
import type { InlineOfferData } from '@/components/musician/inline-offer-card'
import { Suspense } from 'react'

async function DashboardContent({ impersonateId }: { impersonateId?: string }) {
  const supabase = await createClient()
  const serviceClient = createServiceClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/musician/login')
  }

  const { musicianIds, error: resolveError } = await resolveMusicianIds(
    supabase, user.id, impersonateId
  )

  if (resolveError || musicianIds.length === 0) {
    redirect('/musician/login?error=no_musician_records')
  }

  // Get primary musician name
  const { data: primaryMusician } = await supabase
    .from('musicians')
    .select('id, first_name, last_name')
    .in('id', musicianIds)
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!primaryMusician) {
    redirect('/musician/login?error=no_musician_records')
  }

  // Parallel data fetching
  const [
    { data: pendingOffers },
    { data: confirmedPositions },
  ] = await Promise.all([
    // Pending/viewed offers with services
    supabase
      .from('contract_offers')
      .select(`
        id,
        token,
        status,
        custom_pay,
        expires_at,
        musician:musicians(
          id,
          organization:organizations(id, name, timezone)
        ),
        project_position:project_positions(
          id,
          chair_number,
          instrument:instruments(id, name),
          project:projects(id, name, start_date, end_date)
        )
      `)
      .in('musician_id', musicianIds)
      .in('status', ['pending', 'viewed'])
      .order('expires_at', { ascending: true, nullsFirst: false }),

    // Confirmed positions with project details
    supabase
      .from('project_positions')
      .select(`
        id,
        chair_number,
        musician_id,
        instrument_id,
        instrument:instruments(id, name),
        project:projects(
          id,
          name,
          start_date,
          end_date,
          organization_id,
          organization:organizations(id, name, timezone)
        )
      `)
      .in('musician_id', musicianIds)
      .eq('status', 'confirmed'),
  ])

  // Enrich pending offers with services and pay info
  const enrichedOffers: InlineOfferData[] = []
  if (pendingOffers && pendingOffers.length > 0) {
    const offerProjectIds = [...new Set(
      pendingOffers
        .map((o: any) => o.project_position?.project?.id)
        .filter(Boolean)
    )]

    let offerServices: any[] = []
    if (offerProjectIds.length > 0) {
      const { data } = await supabase
        .from('services')
        .select(`
          id, name, service_type, start_time, end_time, venue, base_pay, leader_fee, project_id,
          venue_info:venues(name)
        `)
        .in('project_id', offerProjectIds)
        .order('start_time', { ascending: true })
      offerServices = data || []
    }

    // Get total chairs per instrument per project for offers
    for (const offer of pendingOffers) {
      const pos = offer.project_position as any
      const proj = pos?.project
      const inst = pos?.instrument
      const projServices = offerServices.filter((s: any) => s.project_id === proj?.id)

      let totalChairs = 1
      if (proj?.id && inst?.id) {
        const { count } = await supabase
          .from('project_positions')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', proj.id)
          .eq('instrument_id', inst.id)
        totalChairs = count || 1
      }

      // Calculate total pay
      let totalPay: number | null = offer.custom_pay
      if (totalPay === null && projServices.length > 0) {
        const isLeader = pos?.chair_number === 1
        totalPay = projServices.reduce((sum: number, s: any) => {
          return sum + (s.base_pay || 0) + (isLeader ? (s.leader_fee || 0) : 0)
        }, 0)
      }

      enrichedOffers.push({
        ...(offer as any),
        services: projServices,
        totalPay,
        totalChairs,
      })
    }
  }

  // Build project cards from confirmed positions
  const projectCards: ProjectCardData[] = []
  if (confirmedPositions && confirmedPositions.length > 0) {
    const projectIds = [...new Set(
      confirmedPositions.map((p: any) => (p.project as any)?.id).filter(Boolean)
    )]

    if (projectIds.length > 0) {
      // Fetch services, files, downloads, and music confirmations in parallel
      const [
        { data: allServices },
        { data: allFiles },
      ] = await Promise.all([
        supabase
          .from('services')
          .select(`
            id, name, service_type, start_time, end_time, venue, project_id,
            venue_info:venues(id, name, address, city, state, google_maps_url)
          `)
          .in('project_id', projectIds)
          .order('start_time', { ascending: true }),

        serviceClient
          .from('project_files')
          .select(`
            id, project_id, file_name, file_size, scope, uploaded_at,
            project_file_instruments(instrument_id)
          `)
          .in('project_id', projectIds)
          .order('uploaded_at', { ascending: false }),
      ])

      // Get download history
      const fileIds = (allFiles || []).map((f) => f.id)
      let downloadedFileIds = new Set<string>()
      if (fileIds.length > 0) {
        const { data: downloads } = await serviceClient
          .from('project_file_downloads')
          .select('file_id')
          .in('file_id', fileIds)
          .in('musician_id', musicianIds)
        if (downloads) {
          downloadedFileIds = new Set(downloads.map((d) => d.file_id))
        }
      }

      // Get music confirmation status
      const { data: musicSends } = await serviceClient
        .from('music_sends')
        .select('id, project_id')
        .in('project_id', projectIds)
        .order('sent_at', { ascending: false })

      const sendIds = (musicSends || []).map((s) => s.id)
      const confirmationsByProject: Record<string, { token: string; confirmed_at: string | null }> = {}

      if (sendIds.length > 0) {
        const { data: confirmations } = await serviceClient
          .from('music_confirmations')
          .select('send_id, token, confirmed_at, musician_id')
          .in('send_id', sendIds)
          .in('musician_id', musicianIds)

        if (confirmations) {
          for (const conf of confirmations) {
            const send = musicSends!.find((s) => s.id === conf.send_id)
            if (send) {
              confirmationsByProject[send.project_id] = {
                token: conf.token,
                confirmed_at: conf.confirmed_at,
              }
            }
          }
        }
      }

      // Get total chairs per instrument per project
      const chairCounts: Record<string, number> = {}
      for (const pos of confirmedPositions) {
        const proj = pos.project as any
        const inst = pos.instrument as any
        if (proj?.id && inst?.id) {
          const key = `${proj.id}_${inst.id}`
          if (!(key in chairCounts)) {
            const { count } = await supabase
              .from('project_positions')
              .select('*', { count: 'exact', head: true })
              .eq('project_id', proj.id)
              .eq('instrument_id', inst.id)
            chairCounts[key] = count || 1
          }
        }
      }

      // Build project cards
      for (const position of confirmedPositions) {
        const proj = (position.project as any)
        const org = proj?.organization
        const inst = (position.instrument as any)
        if (!proj?.id) continue

        const projectServices = (allServices || [])
          .filter((s: any) => s.project_id === proj.id)
          .map((s: any) => ({
            ...s,
            venue_info: Array.isArray(s.venue_info) ? s.venue_info[0] || null : s.venue_info,
          }))

        // Filter files for this musician's instrument
        const instrumentId = position.instrument_id
        const projectFiles = (allFiles || [])
          .filter((f: any) => {
            if (f.project_id !== proj.id) return false
            if (f.scope === 'all') return true
            if (f.scope === 'assigned') {
              return (f.project_file_instruments || []).some(
                (fi: any) => fi.instrument_id === instrumentId
              )
            }
            return false
          })
          .map((f: any) => ({
            id: f.id,
            file_name: f.file_name,
            file_size: f.file_size,
            downloaded: downloadedFileIds.has(f.id),
          }))

        const totalChairs = chairCounts[`${proj.id}_${inst?.id}`] || 1

        projectCards.push({
          projectId: proj.id,
          projectName: proj.name,
          organizationName: org?.name || '',
          organizationTimezone: org?.timezone || null,
          instrumentName: inst?.name || '',
          chairNumber: position.chair_number,
          totalChairs,
          startDate: proj.start_date,
          endDate: proj.end_date,
          services: projectServices,
          files: projectFiles,
          confirmation: confirmationsByProject[proj.id] || null,
        })
      }
    }
  }

  return (
    <UnifiedDashboard
      initialData={{
        musician: {
          id: primaryMusician.id,
          first_name: primaryMusician.first_name,
          last_name: primaryMusician.last_name,
        },
        pendingOffers: enrichedOffers,
        projects: projectCards,
      }}
      impersonateId={impersonateId}
    />
  )
}

export default async function MusicianDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ impersonate?: string }>
}) {
  const params = await searchParams
  return (
    <Suspense fallback={<UnifiedDashboardSkeleton />}>
      <DashboardContent impersonateId={params?.impersonate} />
    </Suspense>
  )
}
