import { NextRequest, NextResponse } from 'next/server'
import { createClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendContractOfferEmail, sendAdminOfferSentEmail } from '@/lib/email/send'
import { logEmailConfig } from '@/lib/email/client'

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
    const { offerId } = body

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
            organization:organizations(id, name, timezone),
            services(id, name, service_type, start_time, end_time, venue)
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
    const timezone = organization?.timezone || 'America/Los_Angeles'

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
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
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
        time: new Date(service.start_time).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: timezone,
        }),
        venue: service.venue,
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
    })

    console.log('📧 Email sent successfully:', result)

    // Send notification to organization admins
    try {
      const adminEmails = await getOrgAdminEmails(organization?.id)

      if (adminEmails.length > 0) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
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
