import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendOfferReminderEmail, formatPerformanceDateForSubject } from '@/lib/email/send'
import { logEmail } from '@/lib/email/log'
import { getAppUrl } from '@/lib/utils'

export async function POST(request: NextRequest) {
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
        status,
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
            services(start_time)
          )
        )
      `)
      .eq('id', offerId)
      .single()

    if (offerError || !offer) {
      console.error('Failed to fetch offer:', offerError)
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    // Only send reminders for pending offers
    if (offer.status !== 'pending' && offer.status !== 'viewed') {
      return NextResponse.json(
        { error: 'Can only send reminders for pending offers' },
        { status: 400 }
      )
    }

    const musician = offer.musician as any
    const position = offer.project_position as any
    const project = position?.project as any
    const organization = project?.organization as any
    const instrument = position?.instrument as any
    const projectServices = (project?.services as any[] || []).sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    const performanceDate = projectServices[0] ? formatPerformanceDateForSubject(projectServices[0].start_time, organization?.timezone) : ''

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

    // Calculate days remaining
    let daysRemaining: number | null = null
    if (offer.expires_at) {
      const now = new Date()
      const expires = new Date(offer.expires_at)
      daysRemaining = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    }

    // Build the response URL
    const baseUrl = getAppUrl()
    const responseUrl = `${baseUrl}/gig/${offer.token}`

    // Send the reminder email
    const result = await sendOfferReminderEmail({
      to: musician.email,
      musicianName: `${musician.first_name} ${musician.last_name}`,
      organizationName: organization?.name || 'Orchestra',
      projectName: project?.name || 'Project',
      instrument: instrument?.name || 'Instrument',
      chairNumber: position?.chair_number || 1,
      totalChairs,
      responseUrl,
      expiresAt: offer.expires_at,
      daysRemaining,
      performanceDate,
    })

    await logEmail({
      organizationId: organization?.id,
      recipientEmail: musician.email,
      recipientName: `${musician.first_name} ${musician.last_name}`,
      subject: `Reminder: ${project?.name} - ${instrument?.name}`,
      emailType: 'offer_reminder',
      musicianId: musician.id,
      projectId: project?.id,
      offerId,
      resendEmailId: result?.id || null,
      body: result?.emailHtml,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to send reminder email:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send email' },
      { status: 500 }
    )
  }
}
