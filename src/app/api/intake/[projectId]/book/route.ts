/**
 * GET /api/intake/[projectId]/book — the book manifest for a CONFIRMED intake.
 *
 * Returns everything the browser needs to assemble the per-musician books
 * client-side: the playlist header, the songs in global performance order
 * (numbered — same number in every book), and for each song × instrument the
 * presigned R2 GET URL plus the exact "NN - Title - Artist - part.pdf" name
 * the file should carry inside the zip. The BYTES never touch this route —
 * the browser fetches them straight from R2 (CORS GET is open) and zips them
 * byte-identical.
 *
 * Security: org from the admin's membership; project verified to belong to it;
 * repertoire/parts queries org-scoped; presigned URLs minted only for paths
 * already recorded in this org's repertoire_parts rows.
 */

import { requireOrgAdmin, apiError, apiSuccess, serverError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { getR2Client, isR2Configured } from '@/lib/storage/r2'
import { canonicalEnsemble } from '@/lib/intake/matcher'
import {
  bookParts,
  destFilename,
  orderForBook,
  pickFileForPart,
  stripListNumber,
  type PartFileRow,
} from '@/lib/intake/book-builder'

const SIGNED_GET_TTL_SECONDS = 3600

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const { membership, error } = await requireOrgAdmin()
  if (error || !membership) return error!
  const orgId = membership.organization_id

  if (!isR2Configured()) {
    return apiError('File storage is not configured on this server.', 503)
  }

  const service = createServiceClient()

  // Verify tenant ownership and pull the header fields in one read.
  const { data: project, error: projErr } = await service
    .from('projects')
    .select('id, organization_id, name, client_name, start_date, ensemble_type')
    .eq('id', projectId)
    .maybeSingle()
  if (projErr) return serverError('book: load project', projErr)
  if (!project || project.organization_id !== orgId) {
    return apiError('Project not found', 404)
  }

  const { data: intake, error: intakeErr } = await service
    .from('intakes')
    .select('*')
    .eq('project_id', projectId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (intakeErr) return serverError('book: load intake', intakeErr)
  if (!intake) return apiError('This project has no client selections yet.', 404)
  if (intake.status !== 'confirmed') {
    return apiError('Confirm the client selections first — books are built from the confirmed list.', 409)
  }

  const { data: songRows, error: songsErr } = await service
    .from('intake_songs')
    .select('*')
    .eq('intake_id', intake.id)
    .eq('organization_id', orgId)
    .order('position', { ascending: true })
  if (songsErr) return serverError('book: load songs', songsErr)

  const ordered = orderForBook(songRows ?? [])

  // Load matched works + their part files (org-scoped).
  const workIds = [...new Set(ordered.map((r) => r.matched_repertoire_id).filter((v): v is string => !!v))]
  const partsByWork = new Map<string, PartFileRow[]>()
  if (workIds.length > 0) {
    const { data: partRows, error: partsErr } = await service
      .from('repertoire_parts')
      .select('repertoire_id, part, substitute, played_on, storage_path, original_filename')
      .eq('organization_id', orgId)
      .in('repertoire_id', workIds)
    if (partsErr) return serverError('book: load part files', partsErr)
    for (const p of partRows ?? []) {
      const list = partsByWork.get(p.repertoire_id as string) ?? []
      list.push(p as unknown as PartFileRow)
      partsByWork.set(p.repertoire_id as string, list)
    }
  }

  const gigEnsemble = canonicalEnsemble(project.ensemble_type)
  const parts = bookParts(gigEnsemble)

  const r2 = getR2Client()
  const urlCache = new Map<string, string>()
  const signedUrl = async (path: string): Promise<string> => {
    let u = urlCache.get(path)
    if (!u) {
      u = await r2.getSignedUrl(path, SIGNED_GET_TTL_SECONDS)
      urlCache.set(path, u)
    }
    return u
  }

  const warnings: string[] = []
  const songs = [] as Array<{
    num: number
    section: string
    title: string
    artist: string | null
    role: string | null
    notes: string | null
    specialRequest: boolean
    files: Record<string, { url: string; zipName: string }>
    missingParts: string[]
  }>

  let num = 0
  for (const row of ordered) {
    num += 1
    const title = stripListNumber(row.title_raw ?? '(untitled)')
    const entry = {
      num,
      section: row.section as string,
      title,
      artist: row.artist_raw ?? null,
      role: row.role ?? null,
      notes: row.notes ?? null,
      specialRequest: row.special_request === true,
      files: {} as Record<string, { url: string; zipName: string }>,
      missingParts: [] as string[],
    }

    const fileRows = row.matched_repertoire_id ? partsByWork.get(row.matched_repertoire_id) ?? [] : []
    for (const bp of parts) {
      const picked = row.matched_repertoire_id ? pickFileForPart(fileRows, bp.part, title) : null
      if (picked && picked.row.storage_path) {
        entry.files[bp.part] = {
          url: await signedUrl(picked.row.storage_path),
          zipName: destFilename(num, title, entry.artist, picked.fileLabel),
        }
        if (picked.warning) warnings.push(picked.warning)
      } else {
        entry.missingParts.push(bp.part)
      }
    }

    if (entry.specialRequest) {
      warnings.push(`"${title}" is a special request — no library file; it appears on the playlist only.`)
    } else if (!row.matched_repertoire_id) {
      warnings.push(`"${title}" is not linked to a library work — it appears on the playlist only.`)
    } else if (entry.missingParts.length > 0) {
      warnings.push(`"${title}": no file for ${entry.missingParts.join(', ')}.`)
    }

    songs.push(entry)
  }

  const dateDisplay = project.start_date
    ? new Date(`${project.start_date}T00:00:00`).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : ''

  const { data: org } = await service.from('organizations').select('name').eq('id', orgId).maybeSingle()

  return apiSuccess({
    header: {
      client: project.client_name || project.name,
      dateDisplay,
      venue: intake.venue_note ?? '',
      ensembleLabel: project.ensemble_type || (gigEnsemble ?? ''),
      groupName: org?.name ?? '',
      contact: [intake.contact_name, intake.contact_phone].filter(Boolean).join(' · '),
      spotifyUrl: intake.spotify_url ?? null,
      recessionalCue: intake.recessional_cue ?? null,
      processionalOrder: Array.isArray(intake.processional_order) ? intake.processional_order : [],
      notes: intake.notes ?? null,
    },
    parts,
    songs,
    warnings,
  })
}
