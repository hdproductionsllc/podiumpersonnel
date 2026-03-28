import { createClient } from '@/lib/supabase/server'
import { ProjectsClient, type ProjectWithServices } from '@/components/projects/projects-client'
import type { BookForImport } from '@/components/projects/project-positions'
import type { MusicianForOffer } from '@/components/projects/send-offer-dialog'
import { DEFAULT_TIMEZONE } from '@/lib/utils'

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
      services(*, venue_details:venues(name, address, city, state, zip, google_maps_url, parking_info, directions)),
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

  // Ensure venue_details are attached to services (the nested join may return null
  // due to RLS or PostgREST limitations — fetch venues separately as a fallback)
  if (projects?.length) {
    const venueIds = new Set<string>()
    for (const p of projects as any[]) {
      for (const s of p.services || []) {
        if (s.venue_id && !s.venue_details) venueIds.add(s.venue_id)
      }
    }
    if (venueIds.size > 0) {
      const { data: venues } = await supabase
        .from('venues')
        .select('id, name, address, city, state, zip, google_maps_url, parking_info, directions')
        .in('id', [...venueIds])
      const venueMap = new Map((venues || []).map(v => [v.id, v]))
      for (const p of projects as any[]) {
        for (const s of p.services || []) {
          if (s.venue_id && !s.venue_details) {
            s.venue_details = venueMap.get(s.venue_id) || null
          }
        }
      }
    }
  }

  // Auto-complete active projects whose end_date has passed
  const today = new Date().toISOString().split('T')[0]
  if (projects?.length) {
    const pastActive = projects.filter(
      (p) => p.status === 'active' && p.end_date && p.end_date < today
    )
    if (pastActive.length) {
      await supabase
        .from('projects')
        .update({ status: 'completed' })
        .eq('organization_id', organization!.id)
        .eq('status', 'active')
        .lt('end_date', today)
      // Update local data so the UI reflects the change immediately
      for (const p of pastActive) {
        p.status = 'completed'
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
    />
  )
}
