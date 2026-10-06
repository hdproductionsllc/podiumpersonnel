import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Who a gig-wide send (gig details, music) is for: every musician holding a
 * confirmed chair, not only the ones with an email on file. A send counts
 * them all, so "all N confirmed" cannot fire while someone was never reached,
 * and the ones without an email are named instead of silently dropped.
 */
export interface GigMember {
  musicianId: string
  name: string
  hasEmail: boolean
}

interface Chair {
  status: string
  musician_id: string | null
  musician?: { first_name: string; last_name: string; email?: string | null } | null
}

/** One entry per musician (someone on two chairs is one person to reach). */
export function confirmedMembers(positions: readonly Chair[] | null | undefined): GigMember[] {
  const byId = new Map<string, GigMember>()
  for (const p of positions || []) {
    if (p.status !== 'confirmed' || !p.musician_id || !p.musician || byId.has(p.musician_id)) continue
    byId.set(p.musician_id, {
      musicianId: p.musician_id,
      name: `${p.musician.first_name} ${p.musician.last_name}`.trim(),
      hasEmail: !!p.musician.email?.trim(),
    })
  }
  return [...byId.values()]
}

/** Confirmed musicians on the gig who are not on a send: never emailed, or added since. */
export async function membersNotSent(
  supabase: SupabaseClient,
  projectId: string,
  sentMusicianIds: readonly string[]
): Promise<GigMember[]> {
  const { data: positions, error } = await supabase
    .from('project_positions')
    .select('status, musician_id, musician:musicians(first_name, last_name, email)')
    .eq('project_id', projectId)
    .eq('status', 'confirmed')
  if (error) throw error
  const sent = new Set(sentMusicianIds)
  return confirmedMembers(positions as unknown as Chair[]).filter((m) => !sent.has(m.musicianId))
}
