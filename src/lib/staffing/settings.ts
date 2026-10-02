import type { SupabaseClient } from '@supabase/supabase-js'
import { adminActor, logEvent } from './events'
import { isMissingColumn } from './rpc'

/**
 * The organization's staffing switches (migration 096) and the per-chair
 * "don't auto-offer this chair" switch: the one place that reads and writes them.
 *
 *   organizations.auto_cascade               off for everyone until an admin turns it on
 *   organizations.allow_worker_drop          off for music verticals, on for the rest
 *   project_positions.auto_cascade_disabled  per chair, off everywhere
 *
 * 096 is pasted before the code that reads it, but every reader here tolerates
 * the columns being absent (returns null, logs once per call) so a deploy that
 * lands first degrades to "no switches shown" instead of breaking a page.
 */

/**
 * Verticals where the substitute-request flow is the way out of an accepted
 * gig, so a worker may not drop themselves by default. The same list the
 * database uses (096's trigger) and the one 067 seeds the instrument library for.
 */
export const MUSIC_VERTICALS = ['music_contractor', 'orchestra_band'] as const

/** allow_worker_drop's default for an organization of this vertical. */
export function defaultAllowWorkerDrop(vertical: string | null | undefined): boolean {
  return !(MUSIC_VERTICALS as readonly string[]).includes(vertical || 'music_contractor')
}

export interface OrgStaffingSettings {
  autoCascade: boolean
  allowWorkerDrop: boolean
}

const MIGRATION_096_MISSING =
  'migration 096 (scripts/sql/096-auto-cascade-settings.paste.sql) has not been applied'

/**
 * The organization's two switches, or null when they cannot be read (096 not
 * applied, or the row is not visible to this client).
 */
export async function getOrgStaffingSettings(
  supabase: SupabaseClient,
  organizationId: string
): Promise<OrgStaffingSettings | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('auto_cascade, allow_worker_drop')
    .eq('id', organizationId)
    .maybeSingle()
  if (error) {
    console.error(
      `staffing settings for org ${organizationId} unavailable${isMissingColumn(error) ? `: ${MIGRATION_096_MISSING}` : ''}:`,
      error
    )
    return null
  }
  if (!data) return null
  return { autoCascade: data.auto_cascade === true, allowWorkerDrop: data.allow_worker_drop === true }
}

/**
 * Ids of this organization's chairs that are switched out of auto-offer, or
 * null when the switch cannot be read (096 not applied).
 */
export async function getAutoCascadeDisabledChairIds(
  supabase: SupabaseClient,
  organizationId: string
): Promise<string[] | null> {
  const { data, error } = await supabase
    .from('project_positions')
    .select('id, project:projects!inner(organization_id)')
    .eq('project.organization_id', organizationId)
    .eq('auto_cascade_disabled', true)
  if (error) {
    console.error(
      `auto-offer chair switches for org ${organizationId} unavailable${isMissingColumn(error) ? `: ${MIGRATION_096_MISSING}` : ''}:`,
      error
    )
    return null
  }
  return (data || []).map((row: { id: string }) => row.id)
}

export type SetChairAutoCascadeResult =
  | { ok: true; disabled: boolean; changed: boolean }
  | { ok: false; status: number; code: 'not_found' | 'not_ready' | 'failed'; error: string }

/**
 * Switch auto-offer off (disabled = true) or back on for one chair.
 *
 * Written with the admin's own session: project_positions' only write policy
 * is "Admins can manage project positions", so a member's session, or a chair
 * in another organization, updates nothing and reads as not found. The caller
 * checks the role first so a member gets a plain "Permission denied".
 */
export async function setChairAutoCascade(
  supabase: SupabaseClient,
  userId: string,
  positionId: string,
  disabled: boolean
): Promise<SetChairAutoCascadeResult> {
  const { data: before, error: readError } = await supabase
    .from('project_positions')
    .select('id, auto_cascade_disabled, project:projects(organization_id)')
    .eq('id', positionId)
    .maybeSingle()

  if (readError) {
    if (isMissingColumn(readError)) {
      console.error(`chair ${positionId}: auto-offer switch refused: ${MIGRATION_096_MISSING}`)
      return { ok: false, status: 503, code: 'not_ready', error: 'This setting needs a database update first. Nothing was changed.' }
    }
    console.error(`chair ${positionId}: could not read the auto-offer switch:`, readError)
    return { ok: false, status: 500, code: 'failed', error: 'Could not update this chair' }
  }
  if (!before) return { ok: false, status: 404, code: 'not_found', error: 'Position not found' }

  if (before.auto_cascade_disabled === disabled) return { ok: true, disabled, changed: false }

  const { data: updated, error: updateError } = await supabase
    .from('project_positions')
    .update({ auto_cascade_disabled: disabled })
    .eq('id', positionId)
    .select('id')

  if (updateError) {
    console.error(`chair ${positionId}: could not update the auto-offer switch:`, updateError)
    return { ok: false, status: 500, code: 'failed', error: 'Could not update this chair' }
  }
  // RLS: readable (member) but not writable (not an admin of its organization).
  if (!updated || updated.length === 0) return { ok: false, status: 404, code: 'not_found', error: 'Position not found' }

  const project = before.project as unknown as { organization_id?: string } | null
  await logEvent({
    organizationId: project?.organization_id,
    actor: adminActor(userId),
    entityType: 'position',
    entityId: positionId,
    action: 'position.auto_cascade_changed',
    before: { auto_cascade_disabled: before.auto_cascade_disabled },
    after: { auto_cascade_disabled: disabled },
  })

  return { ok: true, disabled, changed: true }
}
