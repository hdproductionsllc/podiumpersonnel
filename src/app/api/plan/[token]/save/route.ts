/**
 * POST /api/plan/[token]/save — the client's autosave (082).
 *
 * Public by design: the couple has no account, and the token in their email is
 * the credential. resolvePlannerToken IS the authorization, and every id used
 * below comes from it — the request body carries song text and order, nothing
 * else. A client may never set a repertoire id, a match status, an org id or an
 * intake id.
 *
 * THE RESPONSE CARRIES NO LIBRARY DATA. Not a repertoire id, not a work title,
 * not a match count, not a "we have this one!". Matching runs here so the
 * operator opens a mostly-resolved list, and its output is visible only to them
 * (spec §4, acceptance criterion 4). The whole point of the free-text box is
 * that the client never learns the shape of the catalogue.
 */

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveLibraryOrgId } from '@/lib/api-helpers'
import { resolvePlannerToken } from '@/lib/intake/planner-token'
import {
  normalizePlannerSongs,
  normalizeProcessionalOrder,
  PLANNER_MAX_NOTE_CHARS,
  PLANNER_MAX_FIELD_CHARS,
} from '@/lib/intake/planner'
import { loadMatchIndex } from '@/lib/intake/match-index'
import { matchSong, canonicalEnsemble } from '@/lib/intake/matcher'
import { rateLimit } from '@/lib/rate-limit'
import { normTitle } from '@/lib/intake/normalize'

/** Generous for a debounced autosave, tight enough to stop a stuck retry loop. */
const SAVE_LIMIT = 60
const SAVE_WINDOW_MS = 60_000

/** One request body cannot exceed this. 120 songs of bounded fields fit easily. */
const MAX_BODY_BYTES = 256 * 1024

const PUBLIC_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
  'Referrer-Policy': 'no-referrer',
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...PUBLIC_HEADERS, ...extra } })
}

/** Unknown, expired, revoked, cancelled — one indistinguishable answer. */
function notFound() {
  return json({ error: 'This link is not valid.' }, 404)
}

/** Identity for carrying an operator's manual decision across a client save. */
function rowKey(section: string, title: string | null, artist: string | null): string {
  return `${section}|${normTitle(title || '')}|${normTitle(artist || '')}`
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const limited = rateLimit(`plan-save:${token}`, SAVE_LIMIT, SAVE_WINDOW_MS)
  if (!limited.allowed) {
    return json({ error: 'Saving too quickly — please wait a moment.' }, 429, {
      'Retry-After': String(limited.retryAfter),
    })
  }

  const ctx = await resolvePlannerToken(token)
  if (!ctx) return notFound()

  // Locked. The list the client submitted is the list we prepare from; changing
  // it needs the operator to reopen (criterion 5).
  if (ctx.submittedAt) {
    return json(
      { error: 'Your list has already been sent to us and is locked. Get in touch and we can reopen it.', locked: true },
      409
    )
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: 'That list is too large to save.' }, 413)
  }

  let body: {
    songs?: unknown
    processionalOrder?: unknown
    contactName?: unknown
    contactPhone?: unknown
    recessionalCue?: unknown
    notes?: unknown
  }
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'We could not read that request.' }, 400)
  }

  const songs = normalizePlannerSongs(body.songs)
  if (!songs.ok) return json({ error: songs.error }, 400)

  const processional = normalizeProcessionalOrder(body.processionalOrder)
  if (!processional.ok) return json({ error: processional.error }, 400)

  const text = (value: unknown, max: number): string | null => {
    if (typeof value !== 'string') return null
    if (value.length > max) return null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }

  const service = createServiceClient()

  // The library may belong to another brand of the same owner. Resolve it the
  // same way every operator-side read does.
  const libraryOrgId = await resolveLibraryOrgId(ctx.organizationId)

  const loaded = await loadMatchIndex(service, libraryOrgId)
  if (!loaded.ok) {
    console.error(`${loaded.context}:`, loaded.error)
    return json({ error: 'We could not save that just now. Please try again.' }, 500)
  }

  // Ranking hint only — the project's ensemble, read server-side. Never a gate,
  // and never supplied by the client.
  const { data: projectRow } = await service
    .from('projects')
    .select('ensemble_type')
    .eq('id', ctx.projectId)
    .maybeSingle()
  const gigEnsemble = canonicalEnsemble(projectRow?.ensemble_type ?? undefined)

  // Carry forward decisions a HUMAN already made. If the operator reviewed this
  // list, marked a row 'manual' (or a special request) and then reopened it for
  // the client, an unchanged row must not silently revert to a fresh guess —
  // that would quietly undo the operator's work every time the client typed.
  const { data: priorRows } = await service
    .from('intake_songs')
    .select('section, title_raw, artist_raw, match_status, matched_repertoire_id, special_request')
    .eq('intake_id', ctx.intakeId)
    .eq('organization_id', ctx.organizationId)

  const priorManual = new Map<
    string,
    { matched_repertoire_id: string | null; special_request: boolean }
  >()
  for (const p of priorRows ?? []) {
    if (p.match_status !== 'manual') continue
    priorManual.set(rowKey(p.section as string, p.title_raw as string, p.artist_raw as string), {
      matched_repertoire_id: (p.matched_repertoire_id as string | null) ?? null,
      special_request: p.special_request === true,
    })
  }

  const rows = songs.songs.map((s) => {
    const kept = priorManual.get(rowKey(s.section, s.title_raw, s.artist_raw))
    if (kept) {
      return {
        intake_id: ctx.intakeId,
        organization_id: ctx.organizationId,
        ...s,
        matched_repertoire_id: kept.matched_repertoire_id,
        match_status: 'manual' as const,
        special_request: kept.special_request,
      }
    }

    const match = matchSong(
      { titleRaw: s.title_raw, artistRaw: s.artist_raw },
      loaded.data.index,
      gigEnsemble
    )
    return {
      intake_id: ctx.intakeId,
      organization_id: ctx.organizationId,
      ...s,
      // Only a clean single hit auto-attaches a work. Ambiguous and missing rows
      // stay unattached so the operator's review screen shows them amber/red.
      matched_repertoire_id:
        match.status === 'matched' ? match.candidates[0]?.repertoireId ?? null : null,
      match_status: match.status,
      special_request: false,
    }
  })

  // Replace the client's list wholesale (Supabase REST has no cross-statement
  // transaction). A failure between the two leaves the songs empty but the
  // intake intact and unlocked — the client's next autosave, seconds later,
  // rewrites them from what is still on their screen.
  const { error: delErr } = await service
    .from('intake_songs')
    .delete()
    .eq('intake_id', ctx.intakeId)
    .eq('organization_id', ctx.organizationId)

  if (delErr) {
    console.error('plan/save: clear songs', delErr)
    return json({ error: 'We could not save that just now. Please try again.' }, 500)
  }

  if (rows.length > 0) {
    const { error: insErr } = await service.from('intake_songs').insert(rows)
    if (insErr) {
      console.error('plan/save: insert songs', insErr)
      return json({ error: 'We could not save that just now. Please try again.' }, 500)
    }
  }

  const header: Record<string, unknown> = {
    processional_order: ctx.showProcessional ? processional.order : ctx.processionalOrder,
    contact_name: text(body.contactName, PLANNER_MAX_FIELD_CHARS),
    contact_phone: text(body.contactPhone, PLANNER_MAX_FIELD_CHARS),
    notes: text(body.notes, PLANNER_MAX_NOTE_CHARS),
    // VERBATIM (069): stored exactly as the client wrote it — no trim, no case
    // or quote transforms. Bounded, but never rewritten.
    recessional_cue:
      typeof body.recessionalCue === 'string' && body.recessionalCue.length <= PLANNER_MAX_NOTE_CHARS
        ? body.recessionalCue
        : null,
    // The list changed, so any sign-off on the OLD list is void:
    //   books_approved_at — 071's "these exact books may be sent"
    //   status/confirmed_at — the operator's "this exact list is ready"
    // Both bless one specific list. Leaving either standing would let a book be
    // built from songs no human has looked at since.
    books_approved_at: null,
    status: 'draft',
    confirmed_at: null,
  }
  if (!ctx.openedAt) header.client_opened_at = new Date().toISOString()

  const { error: headErr } = await service
    .from('intakes')
    .update(header)
    .eq('id', ctx.intakeId)
    .eq('organization_id', ctx.organizationId)

  if (headErr) {
    console.error('plan/save: update intake', headErr)
    return json({ error: 'We could not save that just now. Please try again.' }, 500)
  }

  // Everything the client is allowed to know: it saved, and when.
  return json({ ok: true, savedAt: new Date().toISOString() })
}
