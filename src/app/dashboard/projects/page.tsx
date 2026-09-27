import { createClient } from '@/lib/supabase/server'
import { ProjectsClient, type ProjectWithServices } from '@/components/projects/projects-client'
import type { BookForImport } from '@/components/projects/project-positions'
import type { MusicianForOffer } from '@/components/projects/send-offer-dialog'
import { DEFAULT_TIMEZONE } from '@/lib/utils'
import { isReadyToComplete } from '@/lib/projects/archive'
import type { GigReportRow } from '@/components/projects/gig-report-panel'
import { attachVenueDetails } from '@/lib/venue-attach'

export default async function ProjectsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('organization_members')
    .select(`
      role,
      organization:organizations(
        id,
        name,
        slug,
        timezone
      )
    `)
    .eq('user_id', user!.id)
    .single()

  const organization = membership?.organization as unknown as {
    id: string
    name: string
    slug: string
    timezone: string | null
  } | null

  const timezone = organization?.timezone || DEFAULT_TIMEZONE

  // Fetch projects with their services, positions, and offers
  const { data: projects } = await supabase
    .from('projects')
    .select(`
      *,
      services(*),
      gig_detail_sends(id, sent_at, musician_count, gig_detail_confirmations(id, musician_id, confirmed_at)),
      project_files(id, file_name, file_size, scope, uploaded_at, project_file_instruments(instrument_id, instrument:instruments(id, name))),
      music_sends(id, sent_at, musician_count, music_confirmations(id, musician_id, confirmed_at)),
      project_positions(
        id,
        project_id,
        instrument_id,
        chair_number,
        musician_id,
        status,
        notes,
        instrument:instruments(id, name, section, sort_order),
        musician:musicians(id, first_name, last_name, phone),
        contract_offers(id, musician_id, status, sent_at, expires_at, responded_at, token, custom_pay, personal_message, musician:musicians(id, first_name, last_name, email)),
        substitution_requests(id, requesting_musician_id, service_id, reason, status, substitute_musician_id, suggested_sub_name, suggested_sub_email, suggested_sub_phone, suggested_sub_instrument_id, admin_notes, offer_id, requesting_musician:musicians!substitution_requests_requesting_musician_id_fkey(id, first_name, last_name), substitute_musician:musicians!substitution_requests_substitute_musician_id_fkey(id, first_name, last_name), suggested_sub_instrument:instruments(id, name), service:services(id, name, start_time))
      )
    `)
    .eq('organization_id', organization!.id)
    .order('start_date', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })

  // Attach each service's venue record (name, address, map link, parking) with the
  // service role, so the project rows and the gig-details preview show the same
  // venue the email will carry.
  if (projects?.length) {
    await attachVenueDetails(projects.flatMap((p) => p.services || []))
  }

  // Auto-complete active projects once the day after their end_date is over, in
  // the org's own time zone (the same rule the complete-projects cron uses).
  if (projects?.length) {
    const now = new Date()
    const pastActive = projects.filter(
      (p) => p.status === 'active' && isReadyToComplete(p.end_date, now, timezone)
    )
    if (pastActive.length) {
      const { error: completeError } = await supabase
        .from('projects')
        .update({ status: 'completed' })
        .eq('organization_id', organization!.id)
        .eq('status', 'active')
        .in('id', pastActive.map((p) => p.id))

      if (completeError) {
        // Leave the local rows as "active" so the page shows what the database
        // actually holds; the next load will try again.
        console.error(`Failed to auto-complete past projects for org ${organization!.id}:`, completeError)
      } else {
        // Update local data so the UI reflects the change immediately
        for (const p of pastActive) {
          p.status = 'completed'
        }
      }
    }
  }

  // Fetch books with entries for import dialog
  const { data: books } = await supabase
    .from('books')
    .select(`
      id,
      name,
      book_entries(instrument_id, chair_number, musician_id)
    `)
    .eq('organization_id', organization!.id)
    .order('name', { ascending: true })

  // Fetch active musicians with instrument assignments and schedules for offer dialog + conflict detection
  const { data: musicians } = await supabase
    .from('musicians')
    .select(`
      id, first_name, last_name, email,
      musician_instruments(instrument_id),
      competing_schedules(id, title, start_time, end_time)
    `)
    .eq('organization_id', organization!.id)
    .eq('is_active', true)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  // Gig reports from lead musicians (089) and who counts as a lead (the roster
  // leader flag). Read separately and tolerantly: gig_reports is admin-only
  // under RLS, and a failed read must never take the Projects page down with it.
  const [{ data: gigReports, error: gigReportsError }, { data: leaders }] = await Promise.all([
    supabase
      .from('gig_reports')
      .select(`
        id, project_id, musician_id, requested_at, opened_at, submitted_at,
        overall, all_on_time, late_notes, hiccups, client_follow_up, arrangement_notes, other_notes,
        musician:musicians(first_name, last_name)
      `)
      .eq('organization_id', organization!.id)
      .order('requested_at', { ascending: true }),
    supabase
      .from('musicians')
      .select('id')
      .eq('organization_id', organization!.id)
      .eq('is_leader', true),
  ])
  if (gigReportsError) console.error('Projects page: could not read gig reports:', gigReportsError.message)

  // Fetch tutorial state for tooltips
  const { data: tutorialState } = await supabase
    .from('user_tutorial_state')
    .select('dismissed_tooltips')
    .eq('user_id', user!.id)
    .eq('organization_id', organization!.id)
    .maybeSingle()

  return (
    <ProjectsClient
      projects={(projects as unknown as ProjectWithServices[]) ?? []}
      books={(books as unknown as BookForImport[]) ?? []}
      musicians={(musicians as unknown as MusicianForOffer[]) ?? []}
      organizationId={organization!.id}
      organizationName={organization!.name}
      timezone={timezone}
      userRole={membership!.role}
      userId={user!.id}
      dismissedTooltips={tutorialState?.dismissed_tooltips ?? []}
      gigReports={(gigReports as unknown as GigReportRow[]) ?? []}
      leaderIds={(leaders ?? []).map((l) => l.id)}
    />
  )
}
