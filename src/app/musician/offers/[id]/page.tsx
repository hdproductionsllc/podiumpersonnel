import { notFound, redirect } from 'next/navigation'
import { createClient, resolveMusicianIds } from '@/lib/supabase/server'
import { OfferDetail } from '@/components/musician/offer-detail'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface OfferDetailPageProps {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ impersonate?: string }>
}

export default async function MusicianOfferDetailPage({ params, searchParams }: OfferDetailPageProps) {
  const { id } = await params
  const sp = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/musician/login')
  }

  // Resolve musician IDs (supports admin impersonation)
  const { musicianIds, error: resolveError } = await resolveMusicianIds(
    supabase, user.id, sp?.impersonate
  )

  if (resolveError || musicianIds.length === 0) {
    redirect('/musician/login?error=no_musician_records')
  }

  // Fetch the offer
  const { data: offer, error } = await supabase
    .from('contract_offers')
    .select(`
      id,
      token,
      status,
      custom_pay,
      expires_at,
      responded_at,
      created_at,
      musician:musicians(
        id,
        first_name,
        last_name,
        email,
        organization:organizations(id, name, timezone, email_logo_url, email_brand_color, musician_policy)
      ),
      project_position:project_positions(
        id,
        chair_number,
        instrument:instruments(id, name),
        project:projects(
          id,
          name,
          description,
          start_date,
          end_date,
          organization_id
        )
      )
    `)
    .eq('id', id)
    .in('musician_id', musicianIds)
    .single()

  if (error || !offer) {
    notFound()
  }

  // Get services for this project
  const position = offer.project_position as any
  const project = position?.project

  let services: any[] = []
  if (project?.id) {
    const { data: serviceData } = await supabase
      .from('services')
      .select(`
        id,
        name,
        service_type,
        start_time,
        end_time,
        venue,
        base_pay,
        leader_fee,
        venue_info:venues(id, name, address, city, state, google_maps_url)
      `)
      .eq('project_id', project.id)
      .order('start_time', { ascending: true })

    services = serviceData || []
  }

  // Calculate total pay
  let totalPay: number | null = offer.custom_pay
  if (totalPay === null && services.length > 0) {
    const isLeader = position?.chair_number === 1
    totalPay = services.reduce((sum: number, service: any) => {
      const basePay = service.base_pay || 0
      const leaderFee = isLeader ? (service.leader_fee || 0) : 0
      return sum + basePay + leaderFee
    }, 0)
  }

  // Count total chairs for this instrument
  let totalChairs = 1
  if (project?.id && position?.instrument?.id) {
    const { count } = await supabase
      .from('project_positions')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('instrument_id', position.instrument.id)

    totalChairs = count || 1
  }

  // Mark as viewed if pending
  if (offer.status === 'pending') {
    await supabase
      .from('contract_offers')
      .update({
        status: 'viewed',
        viewed_at: new Date().toISOString(),
      })
      .eq('id', offer.id)
  }

  // Fetch instruments for the organization (needed for sub request form)
  const musician = offer.musician as any
  let instruments: { id: string; name: string }[] = []
  if (musician?.organization?.id) {
    const { data: instrumentData } = await supabase
      .from('instruments')
      .select('id, name')
      .eq('organization_id', musician.organization.id)
      .order('name')

    instruments = instrumentData || []
  }

  // Fetch existing sub request for this position + musician (for status display)
  let existingSubRequest: {
    id: string
    status: string
    reason: string | null
    suggested_sub_name: string | null
    suggested_sub_email: string | null
    admin_notes: string | null
    service: { id: string; name: string; start_time: string } | null
  } | null = null

  if (offer.status === 'accepted' && position?.id) {
    const { data: subRequestData } = await supabase
      .from('substitution_requests')
      .select(`
        id,
        status,
        reason,
        suggested_sub_name,
        suggested_sub_email,
        admin_notes,
        service:services(id, name, start_time)
      `)
      .eq('project_position_id', position.id)
      .in('requesting_musician_id', musicianIds)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    existingSubRequest = subRequestData as any
  }

  return (
    <div className="space-y-4">
      <Link href={sp?.impersonate ? `/musician/offers?impersonate=${sp.impersonate}` : '/musician/offers'}>
        <Button variant="ghost" size="sm" className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Offers
        </Button>
      </Link>

      <OfferDetail
        offer={offer as any}
        services={services}
        totalPay={totalPay}
        totalChairs={totalChairs}
        instruments={instruments}
        existingSubRequest={existingSubRequest}
      />
    </div>
  )
}
