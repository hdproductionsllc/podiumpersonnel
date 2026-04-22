import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ContractOfferEmail } from '@/lib/email/templates/contract-offer'
import { render } from '@react-email/render'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { getVenueName, getVenueMapsUrl, getVenueAddress } from '@/lib/venue-helpers'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { positionId, musicianId, personalMessage, customPay, includeLeaderFee, leaderFeeAmount } = body

    if (!positionId || !musicianId) {
      return NextResponse.json({ error: 'Position ID and Musician ID are required' }, { status: 400 })
    }

    // Fetch position with project, services, and instrument
    const { data: position, error: positionError } = await supabase
      .from('project_positions')
      .select(`
        id,
        chair_number,
        instrument:instruments(id, name),
        project:projects(
          id,
          name,
          ensemble_type,
          organization:organizations(id, name, timezone, email_logo_url, email_brand_color, email_footer_text),
          services(id, name, service_type, call_time, start_time, end_time, venue, venue_id, base_pay, leader_fee, venue_details:venues!services_venue_id_fkey(name, address, city, state, zip, google_maps_url), venue_2, venue_id_2, venue_2_details:venues!services_venue_id_2_fkey(name, address, city, state, zip, google_maps_url))
        )
      `)
      .eq('id', positionId)
      .single()

    if (positionError || !position) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 })
    }

    // Fetch musician
    const { data: musician } = await supabase
      .from('musicians')
      .select('id, first_name, last_name, email')
      .eq('id', musicianId)
      .single()

    if (!musician) {
      return NextResponse.json({ error: 'Musician not found' }, { status: 404 })
    }

    const posData = position as any
    const project = posData.project as any
    const organization = project?.organization as any
    const instrument = posData.instrument as any
    const services = project?.services as any[] || []
    const timezone = organization?.timezone || DEFAULT_TIMEZONE

    // Count total chairs
    let totalChairs = 1
    if (project?.id && instrument?.id) {
      const { count } = await supabase
        .from('project_positions')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('instrument_id', instrument.id)
      totalChairs = count || 1
    }

    const baseUrl = getAppUrl()
    const responseUrl = `${baseUrl}/gig/preview`

    const formattedServices = services
      .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .map((service: any) => ({
        name: service.name,
        date: new Date(service.start_time).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: timezone,
        }),
        callTime: service.call_time
          ? new Date(service.call_time).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              timeZone: timezone,
            })
          : null,
        time: new Date(service.start_time).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: timezone,
        }),
        endTime: service.end_time
          ? new Date(service.end_time).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              timeZone: timezone,
            })
          : null,
        venue: getVenueName(service),
        venueUrl: getVenueMapsUrl(service),
        venueAddress: getVenueAddress(service),
        venue2: service.venue_2_details || service.venue_2 ? getVenueName({ venue: service.venue_2, venue_details: service.venue_2_details }) : null,
        venue2Url: service.venue_2_details || service.venue_2 ? getVenueMapsUrl({ venue: service.venue_2, venue_details: service.venue_2_details }) : null,
        venue2Address: service.venue_2_details ? getVenueAddress({ venue_details: service.venue_2_details }) : null,
      }))

    // Compute pay amount for preview
    const chairNumber = posData.chair_number || 1
    // Use the admin's explicit leader fee decision instead of assuming from chair number
    const isLeader = !!includeLeaderFee
    const firstService = services[0]
    const serviceBasePay = firstService?.base_pay ?? null
    let payAmount: number | null = customPay != null ? parseFloat(customPay) : null
    if (payAmount == null && serviceBasePay != null) {
      payAmount = serviceBasePay + (isLeader ? (leaderFeeAmount || 0) : 0)
    }

    const emailHtml = await render(
      ContractOfferEmail({
        musicianName: `${musician.first_name} ${musician.last_name}`,
        organizationName: organization?.name || 'Orchestra',
        projectName: project?.name || 'Project',
        instrument: instrument?.name || 'Instrument',
        chairNumber,
        totalChairs,
        services: formattedServices,
        responseUrl,
        expiresAt: null,
        timezone,
        payAmount: payAmount != null && !isNaN(payAmount) ? payAmount : undefined,
        leaderFee: isLeader && leaderFeeAmount ? leaderFeeAmount : undefined,
        isLeader,
        personalMessage: personalMessage || undefined,
        ensembleType: project?.ensemble_type || null,
        branding: {
          logoUrl: organization?.email_logo_url,
          brandColor: organization?.email_brand_color,
          footerText: organization?.email_footer_text,
        },
      })
    )

    return NextResponse.json({ html: emailHtml })
  } catch (error) {
    console.error('Failed to generate email preview:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate preview' },
      { status: 500 }
    )
  }
}
