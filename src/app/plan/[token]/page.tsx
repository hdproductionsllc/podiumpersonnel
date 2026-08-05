import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { resolvePlannerToken } from '@/lib/intake/planner-token'
import { SongPlannerClient } from '@/components/plan/song-planner-client'
import type { PlannerSongDraft } from '@/components/plan/song-planner-client'

/**
 * The client song planner (082). Public, tokenized, no login — the couple has no
 * account, so this reads with the service client after the token resolves.
 *
 * What it shows: their own names, their event, and the song list they entered.
 * What it never shows: the org's repertoire, what we can or can't play, prices,
 * musician names, internal notes, or any match result. The whole design rests on
 * the client typing freely rather than picking from our catalogue (spec §4).
 */

export const metadata: Metadata = {
  title: 'Your music',
  // A wedding song list should never turn up in a search result.
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
}

export const dynamic = 'force-dynamic'

export default async function SongPlannerPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const ctx = await resolvePlannerToken(token)
  // Unknown, expired, revoked, cancelled, feature off — all the same 404.
  if (!ctx) notFound()

  const service = createServiceClient()

  // ONLY the columns the client typed themselves. matched_repertoire_id and
  // match_status are deliberately absent from this select: they are the
  // operator's view of the list, and nothing about the library may reach this
  // page (criterion 4).
  const { data: songs } = await service
    .from('intake_songs')
    .select('section, position, title_raw, artist_raw, role, notes')
    .eq('intake_id', ctx.intakeId)
    .eq('organization_id', ctx.organizationId)
    .order('position', { ascending: true })

  const { data: intake } = await service
    .from('intakes')
    .select('contact_name, contact_phone, recessional_cue, notes')
    .eq('id', ctx.intakeId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  const drafts: PlannerSongDraft[] = (songs ?? []).map((s, i) => ({
    uid: `saved-${i}`,
    section: s.section as PlannerSongDraft['section'],
    titleRaw: (s.title_raw as string | null) ?? '',
    artistRaw: (s.artist_raw as string | null) ?? '',
    role: (s.role as string | null) ?? '',
    notes: (s.notes as string | null) ?? '',
  }))

  return (
    <SongPlannerClient
      token={token}
      organizationName={ctx.organizationName}
      clientName={ctx.project.clientName}
      eventName={ctx.project.name}
      eventDate={ctx.project.startDate}
      dueAt={ctx.dueAt}
      sections={ctx.sections}
      showProcessional={ctx.showProcessional}
      locked={!!ctx.submittedAt}
      submittedAt={ctx.submittedAt}
      initialSongs={drafts}
      initialProcessional={ctx.processionalOrder}
      initialContactName={intake?.contact_name ?? ''}
      initialContactPhone={intake?.contact_phone ?? ''}
      initialRecessionalCue={intake?.recessional_cue ?? ''}
      initialNotes={intake?.notes ?? ''}
    />
  )
}
