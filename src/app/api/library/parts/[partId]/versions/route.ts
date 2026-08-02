import { NextResponse } from 'next/server'
import { requireIntakeEnabled, apiError, serverError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * Previous arrangements for one part.
 *
 *   GET  — list what this part used to point at, newest first.
 *   POST — put one of them back, archiving whatever is live now.
 *
 * Restoring is the same operation as replacing, just sourced from history rather
 * than an upload: the current file is archived, then the row is repointed. So a
 * mistaken replace is one click to undo, and undoing an undo also works.
 *
 * Nothing here touches R2. Objects are content-addressed and never deleted, so
 * every archived row is still openable — restoring just changes which key the
 * part points at.
 */

const PRIVATE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
  'Referrer-Policy': 'no-referrer',
} as const

/**
 * Migration 079 not applied yet. The rest of the library works fine without it —
 * replacing still swaps the file, it just isn't recorded — so this degrades to
 * "no history" instead of erroring at a user who has done nothing wrong.
 */
function isMissingVersionsTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  const code = err.code ?? ''
  if (code === '42P01' || code === 'PGRST205') return true
  const msg = (err.message ?? '').toLowerCase()
  return msg.includes('repertoire_part_versions') && (msg.includes('does not exist') || msg.includes('could not find'))
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ partId: string }> }
) {
  const { partId } = await params
  const { libraryOrgId, error } = await requireIntakeEnabled()
  if (error || !libraryOrgId) return error ?? apiError('Not found', 404)

  try {
    const service = createServiceClient()
    const { data, error: listError } = await service
      .from('repertoire_part_versions')
      .select('id, storage_path, sha256, bytes, original_filename, replaced_at')
      .eq('part_id', partId)
      .eq('organization_id', libraryOrgId)
      .order('replaced_at', { ascending: false })
      .limit(50)

    if (listError) {
      if (isMissingVersionsTable(listError)) {
        return NextResponse.json({ versions: [], unavailable: true }, { headers: PRIVATE_HEADERS })
      }
      return serverError('Library version list failed', listError)
    }

    return NextResponse.json(
      {
        versions: (data ?? []).map((v) => ({
          id: v.id,
          original_filename: v.original_filename,
          bytes: v.bytes,
          replaced_at: v.replaced_at,
          // A version archived before its bytes ever landed can't be restored.
          restorable: !!v.storage_path,
        })),
      },
      { headers: PRIVATE_HEADERS }
    )
  } catch (err) {
    return serverError('Library version list failed', err)
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ partId: string }> }
) {
  const { partId } = await params
  const { user, libraryOrgId, error } = await requireIntakeEnabled()
  if (error || !libraryOrgId) return error ?? apiError('Not found', 404)

  let body: { versionId?: unknown }
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid JSON body')
  }
  if (typeof body.versionId !== 'string' || !body.versionId) {
    return apiError('versionId is required')
  }

  try {
    const service = createServiceClient()

    // Both scoped to the library org, so neither a part nor a version belonging
    // to another org can be reached.
    const { data: version, error: lookupError } = await service
      .from('repertoire_part_versions')
      .select('id, part_id, storage_path, sha256, bytes, original_filename')
      .eq('id', body.versionId)
      .eq('part_id', partId)
      .eq('organization_id', libraryOrgId)
      .maybeSingle()

    if (lookupError && isMissingVersionsTable(lookupError)) {
      return NextResponse.json(
        { error: 'Version history is not set up on this database yet (migration 079).' },
        { status: 503, headers: PRIVATE_HEADERS }
      )
    }
    if (!version) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: PRIVATE_HEADERS })
    }
    if (!version.storage_path) {
      return NextResponse.json(
        { error: 'That version has no stored file and cannot be restored.' },
        { status: 409, headers: PRIVATE_HEADERS }
      )
    }

    const { data: current } = await service
      .from('repertoire_parts')
      .select('id, repertoire_id, storage_path, sha256, bytes, original_filename')
      .eq('id', partId)
      .eq('organization_id', libraryOrgId)
      .maybeSingle()

    if (!current) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: PRIVATE_HEADERS })
    }

    const { error: updateError } = await service
      .from('repertoire_parts')
      .update({
        storage_path: version.storage_path,
        sha256: version.sha256,
        bytes: version.bytes,
        original_filename: version.original_filename,
        updated_at: new Date().toISOString(),
      })
      .eq('id', partId)
      .eq('organization_id', libraryOrgId)

    if (updateError) return serverError('Library version restore failed', updateError)

    // Archive what was live, so restoring is itself reversible.
    if (current.original_filename && current.storage_path !== version.storage_path) {
      const { error: versionError } = await service.from('repertoire_part_versions').insert({
        part_id: current.id,
        repertoire_id: current.repertoire_id,
        organization_id: libraryOrgId,
        storage_path: current.storage_path,
        sha256: current.sha256,
        bytes: current.bytes,
        original_filename: current.original_filename,
        replaced_by: user?.id ?? null,
      })
      if (versionError) {
        console.error(`Failed to archive superseded file for part ${partId}:`, versionError)
      }
    }

    // The restored row is no longer "previous" — drop its history entry so the
    // list doesn't offer to restore what is already live.
    await service
      .from('repertoire_part_versions')
      .delete()
      .eq('id', version.id)
      .eq('organization_id', libraryOrgId)

    return NextResponse.json(
      { success: true, restored: version.original_filename },
      { headers: PRIVATE_HEADERS }
    )
  } catch (err) {
    return serverError('Library version restore failed', err)
  }
}
