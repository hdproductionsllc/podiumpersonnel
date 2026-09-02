import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { GigPageClient } from '@/components/gig/gig-page-client'
import { getOrgPlan, getOrgVertical } from '@/lib/api-helpers'
import { term } from '@/lib/verticals'
import { canUseSubstitutions } from '@/lib/plan'
import { DEFAULT_TIMEZONE } from '@/lib/utils'

interface GigPageProps {
  params: Promise<{ token: string }>
}

export default async function GigPage({ params }: GigPageProps) {
  const { token } = await params
  const supabase = createServiceClient()

  // Fetch contract offer by token
  const { data: offer } = await supabase
    .from('contract_offers')
    .select(`
      *,
      musician:musicians(
        id,
        first_name,
        last_name,
        email,
        user_id
      ),
      project_position:project_positions(
        id,
        chair_number,
        instrument:instruments(id, name),
        project:projects(
          id,
          name,
          description,
          ensemble_type,
          start_date,
          end_date,
          organization_id,
          organization:organizations(id, name, timezone)
        )
      )
    `)
    .eq('token', token)
    .single()

  if (!offer) {
    notFound()
  }

  // Type the nested data - eslint-disable needed for Supabase join queries
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offerData = offer as any
  const musician = offerData.musician as { id: string; first_name: string; last_name: string; email: string | null; user_id: string | null } | null
  const position = offerData.project_position as {
    id: string
    chair_number: number
    instrument: { id: string; name: string } | null
    project: {
      id: string
      name: string
      description: string | null
      ensemble_type: string | null
      start_date: string | null
      end_date: string | null
      organization_id: string
      organization: { id: string; name: string; timezone: string } | null
    } | null
  } | null

  // Get organization timezone for date formatting
  const timezone = position?.project?.organization?.timezone || DEFAULT_TIMEZONE

  // Fetch services for schedule display and pay calculation
  let payAmount: number | null = offerData.custom_pay ?? null
  let services: any[] = []

  if (position?.project?.id) {
    const { data: serviceData } = await supabase
      .from('services')
      .select('id, name, service_type, call_time, start_time, end_time, venue, venue_2, venue_id_2, base_pay, leader_fee, venue_details:venues!venue_id(name, address, city, state, zip, google_maps_url), venue_2_details:venues!venue_id_2(name, address, city, state, zip, google_maps_url)')
      .eq('project_id', position.project.id)
      .order('start_time', { ascending: true })

    services = serviceData || []

    // Calculate pay from first service if no custom_pay
    if (payAmount === null && services.length > 0) {
      const isLeader = position.chair_number === 1
      const basePay = services[0].base_pay
      const leaderFee = services[0].leader_fee ?? 50
      payAmount = basePay != null ? basePay + (isLeader ? leaderFee : 0) : null
    }
  }

  // Fetch instruments for the organization (for sub request form)
  let instruments: { id: string; name: string }[] = []
  if (position?.project?.organization_id) {
    const { data: instrumentData } = await supabase
      .from('instruments')
      .select('id, name')
      .eq('organization_id', position.project.organization_id)
      .order('sort_order', { ascending: true })

    instruments = instrumentData || []
  }

  // Whether this org's plan includes the substitution workflow (Orchestra+).
  // null plan = billing not enforced = enabled.
  // Greeting fallback when a musician record has no first name. Follows the
  // org's vertical so a theatre company greets "Hi Performer," not "Hi Musician,".
  let personTerm = 'Musician'
  if (position?.project?.organization_id) {
    personTerm = term((await getOrgVertical(position.project.organization_id)).terms, 'person')
  }

  let subsEnabled = true
  if (position?.project?.organization_id) {
    const plan = await getOrgPlan(position.project.organization_id)
    subsEnabled = !plan || canUseSubstitutions(plan)
  }

  // Check for existing sub request
  let existingSubRequest = null
  if (offerData.status === 'accepted' && musician?.id && position?.id) {
    const { data: subRequestData } = await supabase
      .from('substitution_requests')
      .select('id, status, suggested_sub_name')
      .eq('project_position_id', position.id)
      .eq('requesting_musician_id', musician.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (subRequestData) {
      existingSubRequest = subRequestData
    }
  }

  // Mark as viewed if pending
  if (offerData.status === 'pending') {
    const { error: viewedError } = await supabase
      .from('contract_offers')
      .update({
        status: 'viewed',
        viewed_at: new Date().toISOString(),
      })
      .eq('id', offerData.id)

    if (viewedError) {
      // The page still renders; the contractor just won't see "viewed" yet.
      console.error(`Failed to mark offer ${offerData.id} as viewed:`, viewedError)
    }
  }

  return (
    <GigPageClient
      token={token}
      offerId={offerData.id}
      offerStatus={offerData.status}
      expiresAt={offerData.expires_at}
      musicianFirstName={musician?.first_name || personTerm}
      organizationName={position?.project?.organization?.name || 'Organization'}
      organizationId={position?.project?.organization_id || ''}
      projectName={position?.project?.name || 'Project'}
      projectDescription={position?.project?.description || null}
      ensembleType={position?.project?.ensemble_type || null}
      projectStartDate={position?.project?.start_date || null}
      projectEndDate={position?.project?.end_date || null}
      instrumentId={position?.instrument?.id || ''}
      instrumentName={position?.instrument?.name || 'Instrument'}
      services={services}
      payAmount={payAmount}
      timezone={timezone}
      instruments={instruments}
      existingSubRequest={existingSubRequest}
      subsEnabled={subsEnabled}
    />
  )
}
