import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendOfferAcceptedEmail, sendAdminOfferResponseEmail } from '@/lib/email/send'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = await createClient()

  // Find the offer by token with all related data for emails
  const { data: offer, error: fetchError } = await supabase
    .from('contract_offers')
    .select(`
      id,
      status,
      project_position_id,
      musician_id,
      expires_at,
      musician:musicians(id, first_name, last_name, email),
      project_position:project_positions(
        id,
        chair_number,
        instrument:instruments(id, name),
        project:projects(
          id,
          name,
          organization_id,
          organization:organizations(id, name),
          services(id, name, service_type, start_time, end_time, venue)
        )
      )
    `)
    .eq('token', token)
    .single()

  if (fetchError || !offer) {
    return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
  }

  // Check if expired
  if (offer.expires_at && new Date(offer.expires_at) < new Date()) {
    return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
  }

  // Check if can still respond
  if (offer.status !== 'pending' && offer.status !== 'viewed') {
    return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
  }

  // Update offer to accepted
  await supabase
    .from('contract_offers')
    .update({
      status: 'accepted',
      responded_at: new Date().toISOString(),
    })
    .eq('id', offer.id)

  // Update position: assign musician and set status to confirmed
  await supabase
    .from('project_positions')
    .update({
      musician_id: offer.musician_id,
      status: 'confirmed',
    })
    .eq('id', offer.project_position_id)

  // Send confirmation emails (don't block on failure)
  try {
    const musician = offer.musician as any
    const position = offer.project_position as any
    const project = position?.project as any
    const organization = project?.organization as any
    const instrument = position?.instrument as any
    const services = project?.services as any[] || []

    // Format services for email
    const formattedServices = services
      .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .map((service: any) => ({
        name: service.name,
        date: new Date(service.start_time).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        time: new Date(service.start_time).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        }),
        venue: service.venue,
      }))

    // Send confirmation to musician if they have email
    if (musician?.email) {
      await sendOfferAcceptedEmail({
        to: musician.email,
        musicianName: `${musician.first_name} ${musician.last_name}`,
        organizationName: organization?.name || 'Orchestra',
        projectName: project?.name || 'Project',
        instrument: instrument?.name || 'Instrument',
        chairNumber: position?.chair_number || 1,
        services: formattedServices,
      }).catch((err) => console.warn('Failed to send musician confirmation:', err))
    }

    // Send notification to organization admins
    if (project?.organization_id) {
      const { data: admins } = await supabase
        .from('organization_members')
        .select('user_id, users:user_id(email)')
        .eq('organization_id', project.organization_id)
        .in('role', ['owner', 'admin'])

      const adminEmails = (admins || [])
        .map((a: any) => a.users?.email)
        .filter(Boolean)

      if (adminEmails.length > 0) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        await sendAdminOfferResponseEmail({
          to: adminEmails,
          organizationName: organization?.name || 'Orchestra',
          projectName: project?.name || 'Project',
          musicianName: `${musician?.first_name} ${musician?.last_name}`,
          musicianEmail: musician?.email || null,
          instrument: instrument?.name || 'Instrument',
          chairNumber: position?.chair_number || 1,
          status: 'accepted',
          dashboardUrl: `${baseUrl}/dashboard/projects`,
        }).catch((err) => console.warn('Failed to send admin notification:', err))
      }
    }
  } catch (emailError) {
    console.warn('Email sending failed:', emailError)
    // Don't block the response on email failure
  }

  return NextResponse.redirect(new URL(`/gig/${token}`, _request.url))
}
