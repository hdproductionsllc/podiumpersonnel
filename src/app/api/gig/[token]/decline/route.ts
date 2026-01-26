import { NextResponse } from 'next/server'
import { createClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { sendOfferDeclinedEmail, sendAdminOfferResponseEmail, sendSubDeclinedFindAnotherEmail } from '@/lib/email/send'

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
      response_notes,
      musician:musicians(id, first_name, last_name, email),
      project_position:project_positions(
        id,
        chair_number,
        instrument:instruments(id, name),
        project:projects(
          id,
          name,
          organization_id,
          organization:organizations(id, name)
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

  // Type the nested data
  const musician = offer.musician as any
  const position = offer.project_position as any
  const project = position?.project as any
  const organization = project?.organization as any
  const instrument = position?.instrument as any

  // Check if this is a substitution offer by looking for a related substitution request
  const { data: subRequest } = await supabase
    .from('substitution_requests')
    .select(`
      id,
      requesting_musician_id,
      service_id,
      suggested_sub_name,
      requesting_musician:musicians!requesting_musician_id(id, first_name, last_name, email),
      service:services(id, name)
    `)
    .eq('offer_id', offer.id)
    .eq('status', 'approved')
    .maybeSingle()

  // Update offer to declined
  await supabase
    .from('contract_offers')
    .update({
      status: 'declined',
      responded_at: new Date().toISOString(),
    })
    .eq('id', offer.id)

  // Update position status to declined (back to vacant so another offer can be sent)
  // But only if this is NOT a substitution - for substitutions, position stays with original musician
  if (!subRequest) {
    await supabase
      .from('project_positions')
      .update({ status: 'vacant' })
      .eq('id', offer.project_position_id)
  }

  // If this is a substitution, update the substitution request and notify original musician
  if (subRequest) {
    // Update substitution request to sub_declined
    await supabase
      .from('substitution_requests')
      .update({ status: 'sub_declined' })
      .eq('id', subRequest.id)

    const originalMusician = subRequest.requesting_musician as any
    const serviceName = (subRequest.service as any)?.name || null

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

    // Get the original musician's offer token
    const { data: originalOffer } = await supabase
      .from('contract_offers')
      .select('token')
      .eq('project_position_id', offer.project_position_id)
      .eq('musician_id', subRequest.requesting_musician_id)
      .eq('status', 'accepted')
      .single()

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const gigUrl = originalOffer ? `${baseUrl}/gig/${originalOffer.token}` : baseUrl

    // Send "sub declined, find another" email to the original musician
    if (originalMusician?.email) {
      try {
        await sendSubDeclinedFindAnotherEmail({
          to: originalMusician.email,
          musicianName: `${originalMusician.first_name} ${originalMusician.last_name}`,
          organizationName: organization?.name || 'Orchestra',
          projectName: project?.name || 'Project',
          instrument: instrument?.name || 'Instrument',
          chairNumber: position?.chair_number || 1,
          totalChairs,
          serviceName,
          suggestedSubName: subRequest.suggested_sub_name || `${musician?.first_name} ${musician?.last_name}`,
          gigUrl,
        }).catch((err) => console.warn('Failed to send sub declined email:', err))
      } catch (emailError) {
        console.warn('Email sending failed:', emailError)
      }
    }
  }

  // Send confirmation emails (don't block on failure)
  try {
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

    // Send confirmation to musician if they have email
    if (musician?.email) {
      await sendOfferDeclinedEmail({
        to: musician.email,
        musicianName: `${musician.first_name} ${musician.last_name}`,
        organizationName: organization?.name || 'Orchestra',
        projectName: project?.name || 'Project',
        instrument: instrument?.name || 'Instrument',
        chairNumber: position?.chair_number || 1,
        totalChairs,
        declineReason: offer.response_notes,
      }).catch((err) => console.warn('Failed to send musician confirmation:', err))
    }

    // Send notification to organization admins
    if (project?.organization_id) {
      const adminEmails = await getOrgAdminEmails(project.organization_id)

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
          totalChairs,
          status: 'declined',
          responseNotes: offer.response_notes,
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
