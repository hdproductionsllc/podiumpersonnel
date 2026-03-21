import { NextRequest, NextResponse } from 'next/server'
import { createClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendContractOfferEmail, sendAdminOfferSentEmail } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { logEmailConfig } from '@/lib/email/client'
import { DEFAULT_TIMEZONE, getAppUrl } from '@/lib/utils'
import { getVenueName, getVenueMapsUrl } from '@/lib/venue-helpers'

export async function POST(request: NextRequest) {
  console.log('📧 Send email API called')
  logEmailConfig()

  try {
    const supabase = await createClient()

    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { offerId, includeLeaderFee: explicitLeaderFee, leaderFeeAmount: explicitLeaderFeeAmount } = body

    if (!offerId) {
      return NextResponse.json({ error: 'Offer ID is required' }, { status: 400 })
    }

    // Fetch the offer with all related data
    const { data: offer, error: offerError } = await supabase
      .from('contract_offers')
      .select(`
        id,
        token,
        expires_at,
        custom_pay,
        personal_message,
        musician:musicians(
          id,
          first_name,
          last_name,
          email
        ),
        project_position:project_positions(
          id,
          chair_number,
          instrument:instruments(id, name),
          project:projects(
            id,
            name,
            ensemble_type,
            organization:organizations(id, name, timezone, email_logo_url, email_brand_color, email_footer_text),
            services(id, name, service_type, call_time, start_time, end_time, venue, venue_id, base_pay, leader_fee, venue_details:venues(name, address, city, state, zip, google_maps_url))
          )
        )
      `)
      .eq('id', offerId)
      .single()

    if (offerError || !offer) {
      console.error('Failed to fetch offer:', offerError)
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    const musician = offer.musician as any
    const position = offer.project_position as any
    const project = position?.project as any
    const organization = project?.organization as any
    const instrument = position?.instrument as any
    const services = project?.services as any[] || []
    const timezone = organization?.timezone || DEFAULT_TIMEZONE

    // Calculate pay
    const chairNumber = position?.chair_number || 1
    const firstService = services.length > 0 ? services[0] : null
    const basePay = firstService?.base_pay ?? null
    const hasCustomPay = (offer as any).custom_pay != null

    // Leader fee logic: only include if explicitly requested from the dialog.
    // When custom_pay is set, the pay was already finalized at offer creation time —
    // don't guess based on chair number, or the email will incorrectly show a leader fee breakdown.
    const isLeader = explicitLeaderFee != null ? !!explicitLeaderFee : (!hasCustomPay && chairNumber === 1)
    const leaderFee = explicitLeaderFeeAmount != null ? Number(explicitLeaderFeeAmount) : (firstService?.leader_fee ?? 0)
    const payAmount = hasCustomPay
      ? Number((offer as any).custom_pay)
      : basePay != null
        ? basePay + (isLeader ? leaderFee : 0)
        : null

    // Count total chairs for this instrument in this project
    let totalChairs = 1
    if (project?.id && instrument?.id) {
      const { count } = await supabase
        .from('project_positions')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('instrument_id', instrument.id)
      totalChairs = count || 1
    }

    // Check if musician has an email
    if (!musician?.email) {
      return NextResponse.json(
        { error: 'Musician does not have an email address' },
        { status: 400 }
      )
    }

    // Build the response URL
    const baseUrl = getAppUrl()
    const responseUrl = `${baseUrl}/gig/${offer.token}`

    // Format services for the email
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
      }))

    // Send the email
    console.log('📧 Attempting to send email to:', musician.email)
    console.log('📧 Email params:', {
      to: musician.email,
      musicianName: `${musician.first_name} ${musician.last_name}`,
      organizationName: organization?.name,
      projectName: project?.name,
      instrument: instrument?.name,
    })

    const result = await sendContractOfferEmail({
      to: musician.email,
      musicianName: `${musician.first_name} ${musician.last_name}`,
      organizationName: organization?.name || 'Orchestra',
      projectName: project?.name || 'Project',
      instrument: instrument?.name || 'Instrument',
      chairNumber: position?.chair_number || 1,
      totalChairs,
      services: formattedServices,
      responseUrl,
      expiresAt: offer.expires_at,
      timezone,
      payAmount,
      leaderFee: isLeader ? leaderFee : null,
      isLeader,
      personalMessage: (offer as any).personal_message || undefined,
      ensembleType: project?.ensemble_type || null,
      branding: {
        logoUrl: organization?.email_logo_url,
        brandColor: organization?.email_brand_color,
        footerText: organization?.email_footer_text,
      },
    })

    console.log('📧 Email sent successfully:', result)

    // Log to email audit trail
    await logEmail({
      organizationId: organization?.id,
      recipientEmail: musician.email,
      recipientName: `${musician.first_name} ${musician.last_name}`,
      subject: `Call: ${project?.name} - ${instrument?.name}`,
      emailType: 'contract_offer',
      musicianId: musician.id,
      projectId: project?.id,
      offerId: offerId,
      resendEmailId: result?.id || null,
      metadata: {
        instrument: instrument?.name,
        chairNumber: position?.chair_number,
        payAmount,
        ensembleType: project?.ensemble_type,
      },
      body: result?.emailHtml,
    })

    // Send notification to organization admins
    try {
      const adminEmails = await getOrgAdminEmails(organization?.id)

      if (adminEmails.length > 0) {
        const baseUrl = getAppUrl()
        await sendAdminOfferSentEmail({
          to: adminEmails,
          organizationName: organization?.name || 'Orchestra',
          projectName: project?.name || 'Project',
          musicianName: `${musician.first_name} ${musician.last_name}`,
          musicianEmail: musician.email,
          instrument: instrument?.name || 'Instrument',
          chairNumber: position?.chair_number || 1,
          totalChairs,
          services: formattedServices,
          dashboardUrl: `${baseUrl}/dashboard/projects`,
          payAmount,
          leaderFee: isLeader ? leaderFee : null,
          isLeader,
          personalMessage: (offer as any).personal_message || null,
          expiresAt: offer.expires_at,
          ensembleType: project?.ensemble_type || null,
          timezone,
        }).catch((err) => console.warn('Failed to send admin notification:', err))
        console.log('📧 Admin notification sent to:', adminEmails)
      } else {
        console.log('📧 No admin emails found for organization')
      }
    } catch (adminEmailError) {
      console.warn('Failed to send admin notification:', adminEmailError)
      // Don't fail the request if admin notification fails
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to send offer email:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send email' },
      { status: 500 }
    )
  }
}
