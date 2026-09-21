import { normTitle } from '@/lib/intake/normalize'

/**
 * What the library page may change about a work after import.
 *
 * A work's identity is (norm_title, artist, ensemble) — see the unique index
 * in migration 068. Title and artist are user-facing text that arrived from a
 * filename, so a typo in the folder ("Glass Animals - Glass Animals") becomes
 * a wrong title in every book until someone edits it. That edit has to keep
 * the stored `norm_title` in step with the display title, or matching would
 * keep finding the OLD name and miss the new one; this module is the one place
 * that rule lives.
 *
 * Ensemble is deliberately NOT editable here: the parts under a work only make
 * sense for the ensemble they were engraved for.
 */

export interface WorkPatchBody {
  title?: unknown
  artist?: unknown
  archived?: unknown
}

export interface WorkPatch {
  title?: string
  norm_title?: string
  artist?: string | null
  is_active?: boolean
}

export type WorkPatchResult =
  | { ok: true; patch: WorkPatch }
  | { ok: false; error: string }

const MAX_LEN = 200

function cleanText(value: unknown, field: string): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: `${field} must be text` }
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (trimmed.length > MAX_LEN) return { ok: false, error: `${field} is too long (max ${MAX_LEN} characters)` }
  return { ok: true, value: trimmed }
}

/**
 * Turn a request body into a column patch, or say why it can't be one.
 * Only the fields present in the body land in the patch, so `{ archived }`
 * from the Archive button and `{ title, artist }` from Rename share one route
 * without either touching the other's columns.
 */
export function buildWorkPatch(body: WorkPatchBody): WorkPatchResult {
  const patch: WorkPatch = {}

  if ('archived' in body && body.archived !== undefined) {
    if (typeof body.archived !== 'boolean') return { ok: false, error: 'archived must be true or false' }
    patch.is_active = !body.archived
  }

  if ('title' in body && body.title !== undefined) {
    const t = cleanText(body.title, 'title')
    if (!t.ok) return t
    if (!t.value) return { ok: false, error: 'title cannot be empty' }
    const norm = normTitle(t.value)
    if (!norm) {
      return { ok: false, error: 'title needs at least one letter or number' }
    }
    patch.title = t.value
    patch.norm_title = norm
  }

  if ('artist' in body && body.artist !== undefined) {
    if (body.artist === null) {
      patch.artist = null
    } else {
      const a = cleanText(body.artist, 'artist')
      if (!a.ok) return a
      patch.artist = a.value || null
    }
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'Nothing to change: send title, artist, or archived' }
  }

  return { ok: true, patch }
}
