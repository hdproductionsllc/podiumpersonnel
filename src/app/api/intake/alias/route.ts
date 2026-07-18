/**
 * POST /api/intake/alias — teach the library a title synonym (the learning loop).
 *
 * When a reviewer resolves an ambiguous/missing song by hand — picking a
 * candidate or searching the library — the client's typed title is a synonym the
 * matcher couldn't reach on its own ("Quando m'en vo" → "Musetta's Waltz"). This
 * route records that correction as a title_alias so the SAME typed title matches
 * automatically next time. The system gets smarter with every fix.
 *
 * Body: { aliasText: string, repertoireId: string }. The alias is stored
 * normalized (alias_norm = normTitle(aliasText)) — the exact fold the Phase A
 * indexer used — so a future parse hits it via the alias tier.
 *
 * Idempotent: re-teaching the same (org, alias_norm) is a no-op success, not an
 * error (the review UI may re-send on every save). A 23505 unique violation is
 * folded to 200 skipped.
 *
 * Security: org derived from the admin's membership (requireOrgAdmin), never the
 * body. repertoireId is verified to belong to THAT org before any write (house
 * rule; two past cross-tenant leaks came from trusting caller-supplied ids).
 */

import { requireIntakeEnabled, apiError, apiSuccess, serverError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { normTitle } from '@/lib/intake/normalize'

type SupabaseError = { code?: string; message?: string } | null

/** "Intake/repertoire tables not created yet" (migration 068/069 unapplied). */
function isMissingTableError(err: SupabaseError): boolean {
  if (!err) return false
  const code = err.code ?? ''
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST202') return true
  const msg = (err.message ?? '').toLowerCase()
  return msg.includes('schema cache') || msg.includes('could not find the table')
}

export async function POST(request: Request) {
  const { membership, libraryOrgId, error } = await requireIntakeEnabled()
  if (error || !membership || !libraryOrgId) return error ?? apiError('Not found', 404)
  // A learned synonym belongs to the (possibly SHARED) library it teaches, so
  // every brand sharing that library benefits from the correction. Verify + write
  // against libraryOrgId.
  const orgId = libraryOrgId

  let body: { aliasText?: unknown; repertoireId?: unknown }
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid JSON body', 400)
  }

  const aliasText = typeof body.aliasText === 'string' ? body.aliasText : ''
  const repertoireId = typeof body.repertoireId === 'string' ? body.repertoireId : ''
  if (!repertoireId) {
    return apiError('repertoireId is required.', 400)
  }

  const aliasNorm = normTitle(aliasText)
  if (!aliasNorm) {
    // Nothing meaningful to key on once folded — reject rather than store a blank
    // alias that would collide with the org's unique (org, alias_norm) index.
    return apiError('The title to remember is empty after normalization.', 400)
  }

  const service = createServiceClient()

  // Never trust a caller-supplied repertoire id: it must belong to THIS org.
  const { data: work, error: workErr } = await service
    .from('repertoire')
    .select('id, norm_title')
    .eq('id', repertoireId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (workErr) {
    if (isMissingTableError(workErr)) return apiError('Library tables not ready — run migrations 068/069', 503)
    return serverError('intake/alias: verify repertoire', workErr)
  }
  if (!work) {
    return apiError('That work is not in your library.', 404)
  }

  // No-op when the alias already equals the work's stored norm — an exact match
  // would reach it anyway, so there is nothing to learn.
  if ((work.norm_title as string) === aliasNorm) {
    return apiSuccess({ status: 'skipped', reason: 'already-exact', aliasNorm })
  }

  const { error: insErr } = await service.from('title_aliases').insert({
    organization_id: orgId,
    alias_norm: aliasNorm,
    repertoire_id: repertoireId,
  })

  if (insErr) {
    // Idempotent: the (org, alias_norm) pair is already taught — success, not error.
    if ((insErr as SupabaseError)?.code === '23505') {
      return apiSuccess({ status: 'skipped', reason: 'exists', aliasNorm })
    }
    if (isMissingTableError(insErr)) return apiError('Library tables not ready — run migrations 068/069', 503)
    return serverError('intake/alias: insert alias', insErr)
  }

  return apiSuccess({ status: 'created', aliasNorm })
}
