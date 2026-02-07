import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, getOrgAdminEmails } from '@/lib/supabase/server'
import { getNextCandidates } from '@/lib/next-candidate'
import { sendOfferExpiredEmail } from '@/lib/email/send'
import { getAppUrl } from '@/lib/utils'

export async function GET(request: NextRequest) {
  // Verify cron secret — Vercel sets this automatically for cron jobs
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const baseUrl = getAppUrl()

  // Find all offers that have expired but haven't been marked as such
  const { data: expiredOffers, error: fetchError } = await supabase
    .from('contract_offers')
    .select(`
      id,
      project_position_id,
      musician:musicians(
        id,
        first_name,
        last_name,
        email
      ),
      project_position:project_positions(
        id,
        chair_number,
        instrument_id,
        instrument:instruments(id, name),
        project:projects(
          id,
          name,
          organization_id,
          organization:organizations(id, name)
        )
      )
    `)
    .in('status', ['pending', 'viewed'])
    .not('expires_at', 'is', null)
    .lt('expires_at', new Date().toISOString())

  if (fetchError) {
    console.error('Failed to fetch expired offers:', fetchError)
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  if (!expiredOffers || expiredOffers.length === 0) {
    return NextResponse.json({ expired: 0 })
  }

  let processed = 0
  let emailsSent = 0

  for (const offer of expiredOffers) {
    const musician = offer.musician as any
    const position = offer.project_position as any
    const project = position?.project as any
    const organization = project?.organization as any
    const instrument = position?.instrument as any

    if (!musician || !position || !project) {
      console.warn(`Skipping offer ${offer.id} — missing related data`)
      continue
    }

    // 1. Mark offer as expired
    const { error: updateError } = await supabase
      .from('contract_offers')
      .update({ status: 'expired' })
      .eq('id', offer.id)

    if (updateError) {
      console.error(`Failed to expire offer ${offer.id}:`, updateError)
      continue
    }

    processed++

    // 2. Find next candidate
    const { candidates } = await getNextCandidates(supabase, position.id, 1)
    const nextCandidate = candidates.length > 0 && !candidates[0].has_conflict
      ? {
          name: `${candidates[0].first_name} ${candidates[0].last_name}`,
          email: candidates[0].email,
          callOrder: candidates[0].call_order,
        }
      : null

    // 3. Count total chairs for this instrument (for email display)
    let totalChairs = 1
    if (project.id && position.instrument_id) {
      const { count } = await supabase
        .from('project_positions')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('instrument_id', position.instrument_id)
      totalChairs = count || 1
    }

    // 4. Send email to org admins
    try {
      const adminEmails = await getOrgAdminEmails(project.organization_id)

      if (adminEmails.length > 0) {
        await sendOfferExpiredEmail({
          to: adminEmails,
          organizationName: organization?.name || 'Your Organization',
          projectName: project.name,
          musicianName: `${musician.first_name} ${musician.last_name}`,
          instrument: instrument?.name || 'Instrument',
          chairNumber: position.chair_number || 1,
          totalChairs,
          nextCandidate,
          dashboardUrl: `${baseUrl}/dashboard/projects?expand=${project.id}`,
        })
        emailsSent++
      }
    } catch (emailError) {
      console.error(`Failed to send expiration email for offer ${offer.id}:`, emailError)
    }
  }

  console.log(`Cron: expired ${processed} offers, sent ${emailsSent} notification emails`)

  return NextResponse.json({
    expired: processed,
    emailsSent,
  })
}
