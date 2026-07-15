/**
 * /api/intake/[projectId] — load + persist the intake DRAFT for a project.
 *
 *   GET  → the saved intake (header + songs) for this project, or null.
 *   PUT  → upsert the draft: header fields + the full songs array. The songs
 *          array is REPLACED wholesale (delete-then-reinsert) so the review
 *          screen is always the source of truth. Send { status: 'confirmed' }
 *          in the PUT body to mark the intake confirmed in the same call — the
 *          confirm action is just a status flip on the saved draft (also stamps
 *          confirmed_at), so it needs no separate endpoint.
 *
 * Targets migration 069's tables (intakes / intake_songs). Columns and CHECK
 * constraints are matched exactly: song sections are folded to the allowed set
 * (unknown → 'other') and match_status to ('matched'|'ambiguous'|'missing'|
 * 'manual', default 'missing') so a client-supplied value can never violate a
 * CHECK. If 069 hasn't been applied yet the tables are absent; every path
 * returns a clear 503 rather than a raw Postgres error.
 *
 * Security: org derived from the admin's membership; the project is verified to
 * belong to that org BEFORE any read or write (cross-tenant lesson). The service
 * client is scoped by organization_id on every query.
 */

import { requireOrgAdmin, apiError, apiSuccess, serverError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'

type SupabaseError = { code?: string; message?: string } | null

/** A "table/column not created yet" error from PostgREST/Postgres (069/070 unapplied). */
function isMissingTableError(err: SupabaseError): boolean {
  if (!err) return false
  const code = err.code ?? ''
  if (code === '42P01' || code === '42703' || code === 'PGRST205' || code === 'PGRST202') return true
  const msg = (err.message ?? '').toLowerCase()
  return (
    msg.includes('schema cache') ||
    (msg.includes('does not exist') && msg.includes('intake')) ||
    (msg.includes('could not find the table') && msg.includes('intake'))
  )
}

const TABLES_NOT_READY = 'Intake tables not ready — run migrations 069–071'

// 069 CHECK constraints — fold any client value into the allowed set so a write
// can never bounce off a constraint (the review screen is the human gate, but
// the DB stays authoritative).
const ALLOWED_SECTIONS = new Set([
  'prelude', 'ceremony', 'recessional', 'postlude', 'cocktail_hour', 'reception', 'other',
])
const ALLOWED_MATCH_STATUS = new Set(['matched', 'ambiguous', 'missing', 'manual'])

function normalizeSection(section: unknown): string {
  return typeof section === 'string' && ALLOWED_SECTIONS.has(section) ? section : 'other'
}
function normalizeMatchStatus(status: unknown): string {
  return typeof status === 'string' && ALLOWED_MATCH_STATUS.has(status) ? status : 'missing'
}

interface IncomingSong {
  section?: string
  role?: string | null
  titleRaw?: string | null
  artistRaw?: string | null
  notes?: string | null
  matchedRepertoireId?: string | null
  matchStatus?: string | null
  specialRequest?: boolean
}

/** Confirm the project exists AND belongs to the admin's org. Never trust the
 *  path param alone. Returns ok, or an error response to send. */
async function verifyProject(
  service: ReturnType<typeof createServiceClient>,
  projectId: string,
  orgId: string
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const { data: project, error } = await service
    .from('projects')
    .select('id, organization_id')
    .eq('id', projectId)
    .maybeSingle()

  if (error) return { ok: false, response: serverError('intake: verify project', error) }
  if (!project || project.organization_id !== orgId) {
    // Same 404 whether the project is missing or another org's — never confirm
    // existence of a resource outside the caller's tenant.
    return { ok: false, response: apiError('Project not found', 404) }
  }
  return { ok: true }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const { membership, error } = await requireOrgAdmin()
  if (error || !membership) return error!
  const orgId = membership.organization_id

  const service = createServiceClient()

  const verified = await verifyProject(service, projectId, orgId)
  if (!verified.ok) return verified.response

  const { data: intake, error: intakeErr } = await service
    .from('intakes')
    .select('*')
    .eq('project_id', projectId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (intakeErr) {
    if (isMissingTableError(intakeErr)) return apiError(TABLES_NOT_READY, 503)
    return serverError('intake: load intake', intakeErr)
  }

  if (!intake) {
    return apiSuccess({ intake: null, songs: [] })
  }

  const { data: songs, error: songsErr } = await service
    .from('intake_songs')
    .select('*')
    .eq('intake_id', intake.id)
    .eq('organization_id', orgId)
    .order('position', { ascending: true })

  if (songsErr) {
    if (isMissingTableError(songsErr)) return apiError(TABLES_NOT_READY, 503)
    return serverError('intake: load intake songs', songsErr)
  }

  const songRows = songs ?? []

  // Resolve matched repertoire titles so the review screen can render
  // "Matched: <Title — Artist>" on reload. Done as a separate, org-scoped
  // .in() lookup rather than a nested PostgREST embed: the service client
  // bypasses RLS here, but the two-query form sidesteps the embed-nulling
  // gotcha entirely and keeps the tenant scope explicit.
  const matchedIds = Array.from(
    new Set(
      songRows
        .map((s) => s.matched_repertoire_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  )

  let repById = new Map<string, { id: string; title: string; artist: string | null; ensemble: string }>()
  if (matchedIds.length > 0) {
    const { data: repRows, error: repErr } = await service
      .from('repertoire')
      .select('id,title,artist,ensemble')
      .eq('organization_id', orgId)
      .in('id', matchedIds)

    if (repErr) return serverError('intake: load matched repertoire', repErr)
    repById = new Map((repRows ?? []).map((r) => [r.id as string, r as { id: string; title: string; artist: string | null; ensemble: string }]))
  }

  const songsWithMatch = songRows.map((s) => ({
    ...s,
    matched_repertoire: s.matched_repertoire_id ? repById.get(s.matched_repertoire_id) ?? null : null,
  }))

  return apiSuccess({ intake, songs: songsWithMatch })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const { membership, error } = await requireOrgAdmin()
  if (error || !membership) return error!
  const orgId = membership.organization_id

  let body: {
    status?: unknown
    rawText?: unknown
    contactName?: unknown
    contactPhone?: unknown
    venueNote?: unknown
    venue?: unknown
    spotifyUrl?: unknown
    notes?: unknown
    recessionalCue?: unknown
    processionalOrder?: unknown
    songs?: unknown
    allowUnresolved?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid JSON body', 400)
  }

  const wantsConfirm = body.status === 'confirmed'
  const songsInput: IncomingSong[] = Array.isArray(body.songs) ? (body.songs as IncomingSong[]) : []
  // `venueNote` is the 069 column; accept `venue` as a friendly alias.
  const venueNote =
    typeof body.venueNote === 'string' ? body.venueNote
      : typeof body.venue === 'string' ? body.venue
        : null

  const service = createServiceClient()

  // Verify tenant ownership BEFORE any write.
  const verified = await verifyProject(service, projectId, orgId)
  if (!verified.ok) return verified.response

  // Build the song rows up front so every validation runs BEFORE any write.
  const rows = songsInput.map((s, position) => ({
    intake_id: '', // filled in after the header upsert
    organization_id: orgId,
    section: normalizeSection(s.section),
    position,
    title_raw: typeof s.titleRaw === 'string' ? s.titleRaw : null,
    artist_raw: typeof s.artistRaw === 'string' ? s.artistRaw : null,
    role: typeof s.role === 'string' ? s.role : null,
    matched_repertoire_id: typeof s.matchedRepertoireId === 'string' ? s.matchedRepertoireId : null,
    match_status: normalizeMatchStatus(s.matchStatus),
    notes: typeof s.notes === 'string' ? s.notes : null,
    special_request: s.specialRequest === true,
  }))

  // Never trust caller-supplied repertoire ids (house rule; two past cross-tenant
  // leaks): every matched_repertoire_id must belong to THIS org's repertoire.
  const claimedIds = [...new Set(rows.map((r) => r.matched_repertoire_id).filter((v): v is string => !!v))]
  if (claimedIds.length > 0) {
    const { data: owned, error: ownErr } = await service
      .from('repertoire')
      .select('id')
      .eq('organization_id', orgId)
      .in('id', claimedIds)
    if (ownErr) return serverError('intake: verify repertoire ownership', ownErr)
    const ownedSet = new Set((owned ?? []).map((r) => r.id as string))
    const foreign = claimedIds.filter((id) => !ownedSet.has(id))
    if (foreign.length > 0) {
      return apiError(
        `Some matched songs reference repertoire that isn't in your library (${foreign.length}). Re-match them and try again.`,
        400
      )
    }
  }

  // The confirm gate lives HERE, not in the browser: a confirmed intake may only
  // contain resolved songs (matched with a verified work, or explicitly manual) —
  // UNLESS the caller explicitly overrides with allowUnresolved (the review UI
  // sends it only after the admin has acknowledged an in-your-face warning).
  // The override is a deliberate flag, never a default, so a plain confirm can
  // still never slip unresolved songs through silently.
  if (wantsConfirm && body.allowUnresolved !== true) {
    const unresolved = rows.filter(
      (r) =>
        !(r.match_status === 'manual' || (r.match_status === 'matched' && r.matched_repertoire_id))
    )
    if (unresolved.length > 0) {
      return apiError(
        `Cannot confirm: ${unresolved.length} song(s) are not resolved (matched or manual). Resolve them, or confirm with the unresolved-songs warning.`,
        400
      )
    }
  }

  // 1. Upsert the header as a DRAFT first — even when confirming. Confirmation is
  //    stamped only AFTER the songs land, so a mid-sequence failure can never
  //    produce a confirmed-but-empty intake (raw_text keeps drafts recoverable).
  const intakeRow = {
    organization_id: orgId,
    project_id: projectId,
    status: 'draft',
    raw_text: typeof body.rawText === 'string' ? body.rawText : null,
    contact_name: typeof body.contactName === 'string' ? body.contactName : null,
    contact_phone: typeof body.contactPhone === 'string' ? body.contactPhone : null,
    venue_note: venueNote,
    spotify_url: typeof body.spotifyUrl === 'string' ? body.spotifyUrl : null,
    notes: typeof body.notes === 'string' ? body.notes : null,
    // VERBATIM: stored exactly as received — no trim, no case/quote transforms.
    recessional_cue: typeof body.recessionalCue === 'string' ? body.recessionalCue : null,
    processional_order: Array.isArray(body.processionalOrder) ? body.processionalOrder : [],
    confirmed_at: null,
    // Books approval blesses ONE exact list — any save invalidates it and the
    // assembled books must be reviewed and approved again (071).
    books_approved_at: null,
  }

  const { data: intake, error: upsertErr } = await service
    .from('intakes')
    .upsert(intakeRow, { onConflict: 'project_id' })
    .select('id')
    .single()

  if (upsertErr) {
    if (isMissingTableError(upsertErr)) return apiError(TABLES_NOT_READY, 503)
    return serverError('intake: upsert intake', upsertErr)
  }
  if (!intake) return serverError('intake: upsert intake', new Error('no row returned'))

  const intakeId = intake.id as string
  for (const r of rows) r.intake_id = intakeId

  // 2. Replace the songs wholesale (Supabase REST has no cross-statement
  //    transaction). Failure at any step leaves the intake in DRAFT with
  //    raw_text intact — recoverable, never confirmed-and-broken.
  const { error: delErr } = await service
    .from('intake_songs')
    .delete()
    .eq('intake_id', intakeId)
    .eq('organization_id', orgId)

  if (delErr) {
    if (isMissingTableError(delErr)) return apiError(TABLES_NOT_READY, 503)
    return serverError('intake: clear intake songs', delErr)
  }

  if (rows.length > 0) {
    const { error: insErr } = await service.from('intake_songs').insert(rows)
    if (insErr) {
      if (isMissingTableError(insErr)) return apiError(TABLES_NOT_READY, 503)
      return serverError('intake: insert intake songs', insErr)
    }
  }

  // 3. Only now — with every song safely persisted — promote to confirmed.
  let finalStatus: 'draft' | 'confirmed' = 'draft'
  if (wantsConfirm) {
    const { error: confirmErr } = await service
      .from('intakes')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', intakeId)
      .eq('organization_id', orgId)
    if (confirmErr) return serverError('intake: confirm intake', confirmErr)
    finalStatus = 'confirmed'
  }

  return apiSuccess({ intakeId, status: finalStatus, songCount: rows.length })
}
