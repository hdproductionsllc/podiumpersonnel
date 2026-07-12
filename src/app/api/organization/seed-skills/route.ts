import { requireOrgAdmin, apiSuccess, apiError, serverError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveVertical } from '@/lib/verticals'

/**
 * Idempotently seed a NEW organization's skill taxonomy (the `instruments`
 * table) for NON-music verticals from the TypeScript registry.
 *
 * Music verticals (music_contractor, orchestra_band) carry skillSeeds === 'sql'
 * — their taxonomy is seeded inside the create_organization_with_owner RPC for
 * deploy-gap safety — so this route no-ops for them.
 *
 * Safe to call more than once: if the org already has any instruments we skip
 * the insert rather than duplicate the taxonomy.
 */
export async function POST() {
  const { membership, error } = await requireOrgAdmin()
  if (error || !membership) return error!

  const organizationId = membership.organization_id
  const service = createServiceClient()

  try {
    // Resolve the org's vertical (RLS-bypass read, explicitly org-scoped).
    const { data: org, error: orgError } = await service
      .from('organizations')
      .select('vertical')
      .eq('id', organizationId)
      .single()

    if (orgError || !org) {
      return apiError('Organization not found', 404)
    }

    const template = resolveVertical(org.vertical)

    // Music verticals are seeded by the DB RPC — nothing to do here.
    if (template.skillSeeds === 'sql') {
      return apiSuccess({ seeded: 0, reason: 'sql' })
    }

    // Idempotency: never duplicate an already-populated taxonomy.
    const { count, error: countError } = await service
      .from('instruments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)

    if (countError) {
      return serverError('seed-skills: count existing instruments', countError)
    }

    if ((count ?? 0) > 0) {
      return apiSuccess({ seeded: 0, reason: 'already-populated' })
    }

    const rows = template.skillSeeds.map((seed) => ({
      organization_id: organizationId,
      name: seed.name,
      abbreviation: seed.abbreviation,
      section: seed.section,
      sort_order: seed.sort_order,
    }))

    const { error: insertError } = await service.from('instruments').insert(rows)
    if (insertError) {
      return serverError('seed-skills: insert taxonomy', insertError)
    }

    return apiSuccess({ seeded: rows.length })
  } catch (err) {
    return serverError('seed-skills', err)
  }
}
