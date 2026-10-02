import { notFound } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { GigPageClient } from '@/components/gig/gig-page-client'
import { getOrgPlan, getOrgVertical } from '@/lib/api-helpers'
import { term } from '@/lib/verticals'
import { canUseSubstitutions } from '@/lib/plan'
import { DEFAULT_TIMEZONE } from '@/lib/utils'
import { isOfferClosed } from '@/lib/staffing/respond'
import { hasLiveStatus } from '@/lib/staffing/live'
import { logEvent, musicianActor } from '@/lib/staffing/events'
import { getOrgStaffingSettings } from '@/lib/staffing/settings'
import { gigHasStarted } from '@/lib/staffing/drop'
import { servicesFor, withScope, type PositionScope } from '@/lib/staffing/scope'

interface GigPageProps {
  params: Promise<{ token: string }>
}

/**
 * Whether this request is the organization's own staff looking at the offer
 * rather than the musician it was sent to.
 *
 * The dashboard's "View" button ("View offer as musician sees it") opens this
 * very page, and opening it used to stamp the offer "viewed" exactly as the
 * musician would. Every offer an admin previewed then read as seen, which left
 * the status unable to answer the only question it exists for: has the musician
 * read their call yet?
 *
 * The page is public and normally reached over a token link with no session at
 * all, so this is a cheap miss in the ordinary case. A staff member who is also
 * the musician on the offer is the genuine reader, and still marks it viewed.
 */
async function isOrgStaffPreviewing(
  organizationId: string | null | undefined,
  musicianUserId: string | null | undefined
): Promise<boolean> {
  if (!organizationId) return false

  try {
    const userClient = await createClient()
    const {
      data: { user },
    } = await userClient.auth.getUser()

    if (!user) return false
    if (musicianUserId && user.id === musicianUserId) return false

    const serviceClient = createServiceClient()
    const { data: membership, error } = await serviceClient
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      console.warn('gig page: could not check organization membership:', error)
      return false
    }

    return !!membership
  } catch (err) {
    // Never let this check stop the page rendering. Falling through to marking
    // the offer viewed is the behaviour that was already in place.
    console.warn('gig page: could not determine whether staff is previewing:', err)
    return false
  }
}

export default async function GigPage({ params }: GigPageProps) {
  const { token } = await params
  const supabase = createServiceClient()

  // Fetch contract offer by token (with the services its chair works: scope.ts)
  const { data: offer } = await withScope((scope) => supabase
    .from('contract_offers')
    .select(`
      *,
      musician:musicians(
        id,
        first_name,
        last_name,
        email,
        user_id,
        is_active
      ),
      project_position:project_positions(
        id,
        chair_number,
        musician_id${scope},
        instrument:instruments(id, name),
        project:projects(
          id,
          name,
          description,
          ensemble_type,
          start_date,
          end_date,
          status,
          organization_id,
          organization:organizations(id, name, timezone)
        )
      )
    `)
    .eq('token', token)
    .single())

  if (!offer) {
    notFound()
  }

  // Type the nested data - eslint-disable needed for Supabase join queries
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offerData = offer as any
  const musician = offerData.musician as { id: string; first_name: string; last_name: string; email: string | null; user_id: string | null; is_active: boolean | null } | null
  const position = offerData.project_position as (PositionScope & {
    id: string
    chair_number: number
    musician_id: string | null
    instrument: { id: string; name: string } | null
    project: {
      id: string
      name: string
      description: string | null
      ensemble_type: string | null
      start_date: string | null
      end_date: string | null
      status: string | null
      organization_id: string
      organization: { id: string; name: string; timezone: string } | null
    } | null
  }) | null

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

    // Only the services this chair works: the whole gig unless the chair is
    // limited to some. Pay, "has it started" and the schedule all follow.
    services = servicesFor(position, serviceData || [])

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
  let workTerm = 'project'
  let rankTerm = 'chair'
  if (position?.project?.organization_id) {
    const { terms } = await getOrgVertical(position.project.organization_id)
    personTerm = term(terms, 'person')
    workTerm = term(terms, 'work', { case: 'lower' })
    rankTerm = term(terms, 'rank', { case: 'lower' })
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

  // "I can't make it" (src/lib/staffing/drop.ts): offered to someone who
  // accepted, before the gig starts, where the organization allows it
  // (organizations.allow_worker_drop; off for music organizations, which keep
  // the substitute request). Unreadable settings (096 not applied) mean off.
  let canDrop = false
  if (offerData.status === 'accepted' && position?.project?.organization_id && !isOfferClosed(position.project, musician)) {
    const settings = await getOrgStaffingSettings(supabase, position.project.organization_id)
    canDrop = settings?.allowWorkerDrop === true && !gigHasStarted(services.map((s: { start_time: string }) => s.start_time))
  }

  // A released offer: whether they dropped out themselves (their sentence
  // says so) or were released another way. Read from the offer's history.
  let releasedReason: string | null = null
  if (offerData.status === 'released') {
    const { data: releasedEvent, error: releasedError } = await supabase
      .from('staffing_events')
      .select('after')
      .eq('entity_id', offerData.id)
      .eq('action', 'offer.released')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (releasedError) {
      // The page still renders with the general "released" sentence.
      console.warn(`gig page: could not read how offer ${offerData.id} was released:`, releasedError)
    }
    const reason = (releasedEvent?.after as { reason?: unknown } | null)?.reason
    releasedReason = typeof reason === 'string' ? reason : null
  }

  // An offer on a cancelled/completed gig, or to a deactivated musician, still
  // says pending but can no longer be answered (the accept/decline routes refuse
  // it). It is not marked viewed, and the page shows it closed with the reason
  // (describeGigOffer in src/lib/staffing/gig-offer-state.ts) instead of
  // buttons that would do nothing.
  const offerClosed =
    hasLiveStatus(offerData.status) &&
    isOfferClosed(position?.project, musician)

  // Someone else holds the chair now. A substitute's offer (093) is made on a
  // chair the person they replace still holds, so it never counts.
  const chairHeldByOther =
    !!position?.musician_id &&
    position.musician_id !== offerData.musician_id &&
    offerData.is_substitution !== true

  // Mark as viewed if pending, unless this is the organization's own staff
  // previewing the offer rather than the musician reading it.
  if (offerData.status === 'pending' && !offerClosed) {
    const staffPreview = await isOrgStaffPreviewing(
      position?.project?.organization_id,
      musician?.user_id
    )

    if (!staffPreview) {
      const { data: viewedRows, error: viewedError } = await supabase
        .from('contract_offers')
        .update({
          status: 'viewed',
          viewed_at: new Date().toISOString(),
        })
        .eq('id', offerData.id)
        // The page loaded a moment ago; an accept, decline or expiry may have
        // landed since. Only an offer still pending can become "viewed".
        .eq('status', 'pending')
        .select('id')

      if (viewedError) {
        // The page still renders; the contractor just won't see "viewed" yet.
        console.error(`Failed to mark offer ${offerData.id} as viewed:`, viewedError)
      } else if (viewedRows && viewedRows.length > 0) {
        // Recorded because it happens at most once per offer (only a pending
        // offer can move), and "did they ever open it?" is the first question
        // when a musician says they never got the call. The status itself is
        // overwritten by the answer; viewed_at is the only other trace.
        await logEvent({
          organizationId: position?.project?.organization_id,
          actor: musicianActor(offerData.musician_id),
          entityType: 'offer',
          entityId: offerData.id,
          action: 'offer.viewed',
          before: { status: 'pending' },
          after: { status: 'viewed' },
        })
      }
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
      projectStatus={position?.project?.status ?? null}
      musicianActive={musician?.is_active ?? null}
      chairHeldByOther={chairHeldByOther}
      workTerm={workTerm}
      rankTerm={rankTerm}
      canDrop={canDrop}
      releasedReason={releasedReason}
    />
  )
}
