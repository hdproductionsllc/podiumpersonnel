'use client'

/**
 * Client Selections — the admin-facing intake import + review screen, attached
 * to a project on the Projects page.
 *
 * Three states, one component:
 *   EMPTY     — paste the 17hats questionnaire, Parse (PROPOSE-only: POST
 *               /api/intake/parse writes nothing).
 *   REVIEW    — the FOOLPROOF human-confirm gate. Parser warnings up top (amber),
 *               songs grouped by section, each row editable with a repertoire
 *               match badge (green/amber/red). Header fields, processional order,
 *               and the VERBATIM recessional cue are all editable. Save Draft
 *               anytime; Confirm only when every row is resolved (matched/manual).
 *   CONFIRMED — read-only summary + counts, with "Reopen as draft".
 *
 * Nothing the parser proposes is trusted until an admin Confirms — misparses stay
 * visibly red/amber until a human resolves them, and can never be saved silently.
 *
 * Security is enforced server-side (org derived from membership; project verified
 * to belong to the org before any read/write). This component is a thin editor
 * over /api/intake/[projectId] (GET load, PUT save/confirm/reopen).
 */

import { useState } from 'react'
import { parseQuestionnaire } from '@/lib/intake/parser'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  IntakeSongRow,
  workLabel,
  type SongRow,
  type IntakeSectionKey,
  type RepCandidate,
  type RowMatchStatus,
} from './intake-song-row'
import type { ProposedSong } from '@/app/api/intake/parse/route'
import type { IntakeRecord, IntakeSong } from '@/lib/intake/types'
import { canonicalEnsemble, type MatchCandidate } from '@/lib/intake/matcher'

// --- section vocabulary (matches migration 069's CHECK set) ------------------

const SECTION_ORDER: IntakeSectionKey[] = [
  'prelude', 'ceremony', 'recessional', 'postlude', 'cocktail_hour', 'reception', 'other',
]

const SECTION_LABELS: Record<IntakeSectionKey, string> = {
  prelude: 'Prelude',
  ceremony: 'Ceremony',
  recessional: 'Recessional',
  postlude: 'Postlude',
  cocktail_hour: 'Cocktail Hour',
  reception: 'Reception',
  other: 'Other',
}

/**
 * Fold a parser section (which stays granular — dinner/special/set_N — so nothing
 * is lost before review) onto migration 069's allowed set. Done at parse time so
 * what the admin sees == what's saved == what reloads (no post-save surprise).
 */
function foldSection(s: string): IntakeSectionKey {
  return (SECTION_ORDER as string[]).includes(s) ? (s as IntakeSectionKey) : 'other'
}

let uidSeq = 0
function nextUid(): string {
  uidSeq += 1
  return `row-${Date.now()}-${uidSeq}`
}

// --- state models ------------------------------------------------------------

interface HeaderState {
  contactName: string
  contactPhone: string
  venueNote: string
  spotifyUrl: string
  recessionalCue: string
  processionalOrder: string[]
}

const EMPTY_HEADER: HeaderState = {
  contactName: '',
  contactPhone: '',
  venueNote: '',
  spotifyUrl: '',
  recessionalCue: '',
  processionalOrder: [],
}

type Phase = 'empty' | 'review' | 'confirmed'

// --- proposal / saved → SongRow ---------------------------------------------

function candidateOf(c: MatchCandidate): RepCandidate {
  return { repertoireId: c.repertoireId, title: c.title, artist: c.artist, ensemble: c.ensemble, parts: c.parts }
}

function rowFromProposed(p: ProposedSong): SongRow {
  const base = {
    uid: nextUid(),
    section: foldSection(p.section),
    role: p.role,
    titleRaw: p.titleRaw,
    artistRaw: p.artistRaw ?? '',
    notes: p.notes ?? null,
    rememberAlias: false,
    // The parser only SUGGESTS special requests; the admin decides on the row.
    specialRequest: false,
    suggestedSpecial: p.specialRequest === true,
  }
  if (p.match.status === 'matched') {
    const chosen = p.match.candidates.find((c) => !c.artistMismatch) ?? p.match.candidates[0]
    return {
      ...base,
      matchStatus: 'matched',
      matchedRepertoireId: chosen?.repertoireId ?? null,
      matchedLabel: chosen ? workLabel(chosen.title, chosen.artist) : null,
      matchedParts: chosen?.parts ?? null,
      candidates: [],
      warning: null,
    }
  }
  if (p.match.status === 'ambiguous') {
    return {
      ...base,
      matchStatus: 'ambiguous',
      matchedRepertoireId: null,
      matchedLabel: null,
      matchedParts: null,
      candidates: p.match.candidates.map(candidateOf),
      warning: p.match.warning ?? null,
    }
  }
  // Missing — carry any similarity best-guesses as "did you mean" suggestions.
  return {
    ...base,
    matchStatus: 'missing',
    matchedRepertoireId: null,
    matchedLabel: null,
    matchedParts: null,
    candidates: p.match.candidates.map(candidateOf),
    warning: null,
  }
}

type SavedSong = IntakeSong & {
  matched_repertoire?: { id: string; title: string; artist: string | null; ensemble: string } | null
}

function rowFromSaved(s: SavedSong): SongRow {
  const rep = s.matched_repertoire ?? null
  return {
    uid: nextUid(),
    section: foldSection(s.section),
    role: s.role,
    titleRaw: s.title_raw ?? '',
    artistRaw: s.artist_raw ?? '',
    notes: s.notes ?? null,
    matchStatus: s.match_status as RowMatchStatus,
    matchedRepertoireId: s.matched_repertoire_id,
    matchedLabel: rep ? workLabel(rep.title, rep.artist) : null,
    matchedParts: null,
    candidates: [],
    warning: null,
    rememberAlias: false,
    specialRequest: s.special_request === true,
    suggestedSpecial: false,
  }
}

/** Reorder rows into canonical section order (positions become contiguous per
 *  section on save, and grouping is stable across reload). */
function groupedOrder(rows: SongRow[]): SongRow[] {
  const out: SongRow[] = []
  for (const sec of SECTION_ORDER) {
    for (const r of rows) if (r.section === sec) out.push(r)
  }
  // Safety net: include any row whose (folded) section somehow isn't in the order.
  for (const r of rows) if (!out.includes(r)) out.push(r)
  return out
}

function isResolved(r: SongRow): boolean {
  return r.matchStatus === 'matched' || r.matchStatus === 'manual'
}

// --- component ---------------------------------------------------------------

interface IntakePanelProps {
  projectId: string
  /** The project's ensemble label ("String Quartet", …) if known — used to rank
   *  matches toward the right arrangement and to badge part gaps. Optional. */
  ensembleType?: string | null
}

export function IntakePanel({ projectId, ensembleType }: IntakePanelProps) {
  // Fold the project's free-text ensemble label to the repertoire canon once.
  const gigEnsemble = canonicalEnsemble(ensembleType)
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [phase, setPhase] = useState<Phase>('empty')
  const [rawText, setRawText] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [reparsing, setReparsing] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState<null | 'draft' | 'confirmed' | 'reopen'>(null)

  const [header, setHeader] = useState<HeaderState>(EMPTY_HEADER)
  const [songs, setSongs] = useState<SongRow[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [warningsAck, setWarningsAck] = useState(false)
  const [addSection, setAddSection] = useState<IntakeSectionKey>('ceremony')
  // The confirm-anyway warning step: first Confirm click with unresolved items
  // shows the warning; only the explicit "Confirm anyway" sends the override.
  const [confirmOverride, setConfirmOverride] = useState(false)

  async function handleOpen() {
    const next = !open
    setOpen(next)
    if (next && !loaded && !loading) {
      void load()
    }
  }

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/intake/${projectId}`)
      if (res.status === 503) {
        setUnavailable(true)
        setLoaded(true)
        return
      }
      const data = await res.json()
      if (!res.ok) {
        setLoadError(data.error || 'Could not load client selections.')
        return
      }
      const intake = data.intake as IntakeRecord | null
      const savedSongs = (data.songs ?? []) as SavedSong[]
      if (!intake) {
        setPhase('empty')
        setLoaded(true)
        return
      }
      applyIntake(intake, savedSongs)
      setPhase(intake.status === 'confirmed' ? 'confirmed' : 'review')
      setLoaded(true)
    } catch {
      setLoadError('Could not load client selections.')
    } finally {
      setLoading(false)
    }
  }

  function applyIntake(intake: IntakeRecord, savedSongs: SavedSong[]) {
    setRawText(intake.raw_text ?? '')
    setHeader({
      contactName: intake.contact_name ?? '',
      contactPhone: intake.contact_phone ?? '',
      venueNote: intake.venue_note ?? '',
      spotifyUrl: intake.spotify_url ?? '',
      recessionalCue: intake.recessional_cue ?? '',
      processionalOrder: Array.isArray(intake.processional_order) ? intake.processional_order : [],
    })
    setSongs(groupedOrder(savedSongs.map(rowFromSaved)))
    // Warnings are DERIVED from the immutable raw_text (pure client-side parse),
    // so unplaced-line signals survive reloads instead of vanishing (review F5).
    setWarnings(intake.raw_text ? parseQuestionnaire(intake.raw_text).warnings : [])
    setWarningsAck(false)
  }

  async function runParse(text: string) {
    const trimmed = text.trim()
    if (!trimmed) {
      toast.error('Paste the questionnaire text first.')
      return
    }
    setParsing(true)
    try {
      const res = await fetch('/api/intake/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: trimmed, gigEnsemble }),
      })
      const data = await res.json()
      if (res.status === 503) {
        setUnavailable(true)
        return
      }
      if (!res.ok) {
        toast.error(data.error || 'Parsing failed.')
        return
      }
      setRawText(trimmed)
      setHeader({
        contactName: data.header?.contactName ?? '',
        contactPhone: data.header?.contactPhone ?? '',
        venueNote: data.header?.venueNote ?? '',
        spotifyUrl: data.header?.spotifyUrl ?? '',
        recessionalCue: data.header?.recessionalCue ?? '',
        processionalOrder: Array.isArray(data.header?.processionalOrder) ? data.header.processionalOrder : [],
      })
      setSongs(groupedOrder((data.songs as ProposedSong[]).map(rowFromProposed)))
      setWarnings(Array.isArray(data.warnings) ? data.warnings : [])
      setWarningsAck(false)
      setPhase('review')
      setReparsing(false)
      const stats = data.stats
      if (stats) {
        const specialNote = stats.special > 0
          ? ` ${stats.special} special request${stats.special === 1 ? '' : 's'} flagged.`
          : ''
        toast.success(`Parsed ${stats.total} song${stats.total === 1 ? '' : 's'} — ${stats.matched} matched, ${stats.ambiguous + stats.missing} to review.${specialNote}`)
      }
    } catch {
      toast.error('Parsing failed. Please try again.')
    } finally {
      setParsing(false)
    }
  }

  function buildPayload(status: 'draft' | 'confirmed') {
    const ordered = groupedOrder(songs)
    return {
      status,
      rawText: rawText || null,
      contactName: header.contactName.trim() || null,
      contactPhone: header.contactPhone.trim() || null,
      venueNote: header.venueNote.trim() || null,
      spotifyUrl: header.spotifyUrl.trim() || null,
      // VERBATIM: the cue is sent exactly as typed/parsed — no trim, ever.
      recessionalCue: header.recessionalCue === '' ? null : header.recessionalCue,
      processionalOrder: header.processionalOrder.map((s) => s.trim()).filter(Boolean),
      songs: ordered.map((r) => ({
        section: r.section,
        role: r.role,
        titleRaw: r.titleRaw,
        artistRaw: r.artistRaw,
        notes: r.notes,
        matchedRepertoireId: r.matchedRepertoireId,
        matchStatus: r.matchStatus,
        specialRequest: r.specialRequest,
      })),
    }
  }

  async function save(
    status: 'draft' | 'confirmed',
    which: 'draft' | 'confirmed' | 'reopen',
    allowUnresolved = false
  ) {
    setSaving(which)
    try {
      const res = await fetch(`/api/intake/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // allowUnresolved is only ever sent after the admin acknowledged the
        // unresolved-items warning — the server rejects a plain confirm.
        body: JSON.stringify({ ...buildPayload(status), ...(allowUnresolved ? { allowUnresolved: true } : {}) }),
      })
      const data = await res.json()
      if (res.status === 503) {
        setUnavailable(true)
        return
      }
      if (!res.ok) {
        toast.error(data.error || 'Save failed.')
        return
      }
      if (which === 'draft') toast.success('Draft saved.')
      else if (which === 'confirmed') { toast.success('Client selections confirmed.'); setPhase('confirmed'); setConfirmOverride(false) }
      else { toast.success('Reopened as draft.'); setPhase('review') }
      // Learning loop: teach the library every remembered correction. Best-effort
      // and idempotent — it runs after the save succeeds and never blocks it.
      void teachAliases()
    } catch {
      toast.error('Save failed. Please try again.')
    } finally {
      setSaving(null)
    }
  }

  /** POST each "remember this match" row to /api/intake/alias, then clear its
   *  flag so re-saves don't re-teach. Failures are swallowed (learning is a
   *  bonus, not part of the save contract). */
  async function teachAliases() {
    const toTeach = songs.filter(
      (r) => r.rememberAlias && r.matchStatus === 'manual' && r.matchedRepertoireId && r.titleRaw.trim()
    )
    if (toTeach.length === 0) return
    let taught = 0
    await Promise.all(
      toTeach.map(async (r) => {
        try {
          const res = await fetch('/api/intake/alias', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aliasText: r.titleRaw, repertoireId: r.matchedRepertoireId }),
          })
          if (res.ok) taught++
        } catch {
          /* best-effort */
        }
      })
    )
    // Clear the flag on the rows we just taught so a later save won't repeat them.
    const taughtUids = new Set(toTeach.map((r) => r.uid))
    setSongs((prev) => prev.map((r) => (taughtUids.has(r.uid) ? { ...r, rememberAlias: false } : r)))
    if (taught > 0) {
      toast.success(`Remembered ${taught} title${taught === 1 ? '' : 's'} for next time.`)
    }
  }

  // --- row mutation helpers ---
  function patchRow(uid: string, patch: Partial<SongRow>) {
    setSongs((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))
  }
  function removeRow(uid: string) {
    setSongs((prev) => prev.filter((r) => r.uid !== uid))
  }
  function moveRow(uid: string, dir: -1 | 1) {
    setSongs((prev) => {
      const idx = prev.findIndex((r) => r.uid === uid)
      if (idx < 0) return prev
      const section = prev[idx].section
      // Find the adjacent row in the SAME section to swap with.
      let j = idx + dir
      while (j >= 0 && j < prev.length && prev[j].section !== section) j += dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }
  function addRow(section: IntakeSectionKey) {
    const row: SongRow = {
      uid: nextUid(),
      section,
      role: section === 'ceremony' ? '' : null,
      titleRaw: '',
      artistRaw: '',
      notes: null,
      matchStatus: 'missing',
      matchedRepertoireId: null,
      matchedLabel: null,
      matchedParts: null,
      candidates: [],
      warning: null,
      rememberAlias: false,
      specialRequest: false,
      suggestedSpecial: false,
    }
    setSongs((prev) => groupedOrder([...prev, row]))
  }

  // --- processional order helpers ---
  function setProcStep(i: number, value: string) {
    setHeader((h) => ({ ...h, processionalOrder: h.processionalOrder.map((s, k) => (k === i ? value : s)) }))
  }
  function removeProcStep(i: number) {
    setHeader((h) => ({ ...h, processionalOrder: h.processionalOrder.filter((_, k) => k !== i) }))
  }
  function moveProcStep(i: number, dir: -1 | 1) {
    setHeader((h) => {
      const j = i + dir
      if (j < 0 || j >= h.processionalOrder.length) return h
      const next = [...h.processionalOrder]
      ;[next[i], next[j]] = [next[j], next[i]]
      return { ...h, processionalOrder: next }
    })
  }
  function addProcStep() {
    setHeader((h) => ({ ...h, processionalOrder: [...h.processionalOrder, ''] }))
  }

  const unresolvedCount = songs.filter((r) => !isResolved(r)).length
  const matchedCount = songs.filter((r) => r.matchStatus === 'matched').length
  const specialCount = songs.filter((r) => r.specialRequest).length
  const readOnly = phase === 'confirmed'

  // What still stands between this draft and a clean confirm. Confirm is never
  // hard-blocked by these — they surface as an explicit warning step instead.
  const confirmBlockers: string[] = []
  if (unresolvedCount > 0) {
    confirmBlockers.push(
      `${unresolvedCount} song${unresolvedCount === 1 ? ' is' : 's are'} not matched to the library (red/amber rows)`
    )
  }
  if (warnings.length > 0 && !warningsAck) {
    confirmBlockers.push(
      `${warnings.length} unplaced questionnaire line${warnings.length === 1 ? '' : 's'} (top of this panel) not yet reviewed`
    )
  }

  function handleConfirmClick() {
    if (confirmBlockers.length > 0 && !confirmOverride) {
      setConfirmOverride(true)
      return
    }
    void save('confirmed', 'confirmed', confirmBlockers.length > 0)
  }

  // Sections that currently have songs, in canonical order.
  const activeSections = SECTION_ORDER.filter((sec) => songs.some((r) => r.section === sec))

  // --- header chip (section-level status; card chip intentionally skipped) ---
  function StatusChip() {
    if (unavailable) return null
    if (!loaded) return null
    if (phase === 'confirmed') return <Badge variant="success" className="text-xs ml-2">Confirmed</Badge>
    if (phase === 'review') {
      return unresolvedCount > 0
        ? <Badge variant="warning" className="text-xs ml-2">Draft · {unresolvedCount} to review</Badge>
        : <Badge variant="secondary" className="text-xs ml-2">Draft · ready</Badge>
    }
    return null
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleOpen}
        className="flex w-full items-center gap-2 text-sm font-semibold"
      >
        <svg className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
        </svg>
        Client Selections
        <StatusChip />
      </button>

      {open && (
        <div className="pl-6 space-y-4">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

          {!loading && unavailable && (
            <p className="text-sm text-muted-foreground">
              Client Selections import isn’t available yet — it turns on once the intake tables (migration 069) are applied.
            </p>
          )}

          {!loading && loadError && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button size="sm" variant="outline" onClick={() => load()}>Retry</Button>
            </div>
          )}

          {/* EMPTY */}
          {!loading && !unavailable && !loadError && phase === 'empty' && (
            <div className="space-y-3 max-w-2xl">
              <p className="text-sm text-muted-foreground">
                Paste the client’s 17hats questionnaire below. Podium will parse it into sections and songs and match each song against your library — you’ll review and fix everything before it’s saved.
              </p>
              <Textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste the 17hats questionnaire…"
                className="min-h-40 text-sm font-mono"
              />
              <Button onClick={() => runParse(pasteText)} disabled={parsing || !pasteText.trim()}>
                {parsing ? 'Parsing…' : 'Parse Questionnaire'}
              </Button>
            </div>
          )}

          {/* REVIEW */}
          {!loading && !unavailable && !loadError && phase === 'review' && (
            <div className="space-y-5">
              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-3">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
                    Review these — the parser couldn’t place {warnings.length} line{warnings.length === 1 ? '' : 's'}:
                  </p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {warnings.map((w, i) => (
                      <li key={i} className="text-xs text-amber-800 dark:text-amber-300">{w}</li>
                    ))}
                  </ul>
                  <label className="mt-2 flex items-center gap-2 text-xs font-medium text-amber-900 dark:text-amber-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={warningsAck}
                      onChange={(e) => setWarningsAck(e.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    I&apos;ve reviewed these lines — none of them are missing songs or cues
                  </label>
                </div>
              )}

              {/* Header fields */}
              <div className="rounded-md border bg-background p-3 space-y-3">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Event details</h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Contact name</label>
                    <Input value={header.contactName} onChange={(e) => setHeader({ ...header, contactName: e.target.value })} className="h-8 text-sm" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Contact phone</label>
                    <Input value={header.contactPhone} onChange={(e) => setHeader({ ...header, contactPhone: e.target.value })} className="h-8 text-sm" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Venue note</label>
                    <Input value={header.venueNote} onChange={(e) => setHeader({ ...header, venueNote: e.target.value })} className="h-8 text-sm" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Spotify playlist</label>
                    <Input value={header.spotifyUrl} onChange={(e) => setHeader({ ...header, spotifyUrl: e.target.value })} placeholder="https://open.spotify.com/…" className="h-8 text-sm" />
                  </div>
                </div>
              </div>

              {/* Songs grouped by section */}
              {activeSections.length === 0 ? (
                <p className="text-sm text-muted-foreground">No songs yet. Add one below, or re-parse the questionnaire.</p>
              ) : (
                activeSections.map((sec) => {
                  const sectionRows = songs.filter((r) => r.section === sec)
                  return (
                    <div key={sec} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h5 className="text-sm font-semibold">{SECTION_LABELS[sec]}</h5>
                        <span className="text-xs text-muted-foreground">({sectionRows.length})</span>
                      </div>
                      <div className="space-y-2">
                        {sectionRows.map((row, i) => (
                          <IntakeSongRow
                            key={row.uid}
                            song={row}
                            positionLabel={i + 1}
                            gigEnsemble={gigEnsemble}
                            canMoveUp={i > 0}
                            canMoveDown={i < sectionRows.length - 1}
                            onChange={(patch) => patchRow(row.uid, patch)}
                            onRemove={() => removeRow(row.uid)}
                            onMoveUp={() => moveRow(row.uid, -1)}
                            onMoveDown={() => moveRow(row.uid, 1)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })
              )}

              {/* Add a song */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Add a song to</span>
                <Select value={addSection} onValueChange={(v) => setAddSection(v as IntakeSectionKey)}>
                  <SelectTrigger className="h-8 w-44 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SECTION_ORDER.map((sec) => (
                      <SelectItem key={sec} value={sec}>{SECTION_LABELS[sec]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => addRow(addSection)}>Add song</Button>
              </div>

              {/* Processional order */}
              <div className="rounded-md border bg-background p-3 space-y-2">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Processional walking order</h5>
                {header.processionalOrder.length === 0 ? (
                  <p className="text-xs text-muted-foreground">None specified.</p>
                ) : (
                  <ol className="space-y-1.5">
                    {header.processionalOrder.map((step, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground tabular-nums w-5 shrink-0">{i + 1}.</span>
                        <Input value={step} onChange={(e) => setProcStep(i, e.target.value)} className="h-8 text-sm" />
                        <Button type="button" variant="ghost" size="icon-xs" onClick={() => moveProcStep(i, -1)} disabled={i === 0} title="Move up" aria-label="Move up">
                          <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                        </Button>
                        <Button type="button" variant="ghost" size="icon-xs" onClick={() => moveProcStep(i, 1)} disabled={i === header.processionalOrder.length - 1} title="Move down" aria-label="Move down">
                          <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                        </Button>
                        <Button type="button" variant="ghost" size="icon-xs" className="text-destructive hover:text-destructive" onClick={() => removeProcStep(i)} title="Remove" aria-label="Remove">
                          <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                        </Button>
                      </li>
                    ))}
                  </ol>
                )}
                <Button type="button" size="sm" variant="outline" onClick={addProcStep}>Add step</Button>
              </div>

              {/* Recessional cue — VERBATIM */}
              <div className="rounded-md border bg-background p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recessional cue</h5>
                  <Badge variant="outline" className="text-[10px]">verbatim — copied exactly</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">The officiant’s exact words. Keep it word-for-word — don’t reword it.</p>
                <Textarea
                  value={header.recessionalCue}
                  onChange={(e) => setHeader({ ...header, recessionalCue: e.target.value })}
                  placeholder="e.g. “I now pronounce you married. You may kiss…”"
                  className="min-h-16 text-sm"
                />
              </div>

              {/* Re-parse */}
              <div className="rounded-md border border-dashed p-3 space-y-2">
                {!reparsing ? (
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-muted-foreground">Need to start over from the questionnaire text?</p>
                    <Button size="sm" variant="outline" onClick={() => { setPasteText(rawText); setReparsing(true) }}>Re-parse text</Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-amber-700 dark:text-amber-400">Re-parsing replaces the songs and details below with a fresh parse. Your manual edits here will be discarded.</p>
                    <Textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} className="min-h-32 text-sm font-mono" />
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => runParse(pasteText)} disabled={parsing || !pasteText.trim()}>{parsing ? 'Parsing…' : 'Re-parse'}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setReparsing(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                <Button variant="outline" onClick={() => save('draft', 'draft')} disabled={saving !== null}>
                  {saving === 'draft' ? 'Saving…' : 'Save Draft'}
                </Button>
                <Button onClick={handleConfirmClick} disabled={saving !== null || songs.length === 0}>
                  {saving === 'confirmed' ? 'Confirming…' : 'Confirm Selections'}
                </Button>
                {songs.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {unresolvedCount > 0
                      ? `${unresolvedCount} of ${songs.length} unmatched — you can still confirm; you'll get a warning`
                      : `All ${songs.length} song${songs.length === 1 ? '' : 's'} resolved`}
                  </span>
                )}
              </div>

              {/* Confirm-anyway warning step */}
              {confirmOverride && confirmBlockers.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-3 space-y-2">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    Confirm with unresolved items?
                  </p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {confirmBlockers.map((b, i) => (
                      <li key={i} className="text-xs text-amber-800 dark:text-amber-300">{b}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    Everything is saved exactly as it stands — you can reopen the draft and fix these any time.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" onClick={() => save('confirmed', 'confirmed', true)} disabled={saving !== null}>
                      {saving === 'confirmed' ? 'Confirming…' : 'Confirm anyway'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmOverride(false)} disabled={saving !== null}>
                      Keep reviewing
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CONFIRMED */}
          {!loading && !unavailable && !loadError && phase === 'confirmed' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success">Confirmed</Badge>
                <span className="text-sm text-muted-foreground">
                  {songs.length} song{songs.length === 1 ? '' : 's'} · {matchedCount} matched to the library
                  {specialCount > 0 && <> · {specialCount} special request{specialCount === 1 ? '' : 's'}</>}
                </span>
              </div>

              {(header.contactName || header.venueNote || header.spotifyUrl) && (
                <div className="text-sm text-muted-foreground space-y-0.5">
                  {header.contactName && <div>Contact: {header.contactName}{header.contactPhone ? ` · ${header.contactPhone}` : ''}</div>}
                  {header.venueNote && <div>Venue: {header.venueNote}</div>}
                  {header.spotifyUrl && <div>Playlist: <a href={header.spotifyUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline break-all">{header.spotifyUrl}</a></div>}
                </div>
              )}

              {SECTION_ORDER.filter((sec) => songs.some((r) => r.section === sec)).map((sec) => {
                const sectionRows = songs.filter((r) => r.section === sec)
                return (
                  <div key={sec} className="space-y-1">
                    <h5 className="text-sm font-semibold">{SECTION_LABELS[sec]}</h5>
                    <div>
                      {sectionRows.map((row, i) => (
                        <IntakeSongRow
                          key={row.uid}
                          song={row}
                          positionLabel={i + 1}
                          readOnly
                          canMoveUp={false}
                          canMoveDown={false}
                          onChange={() => {}}
                          onRemove={() => {}}
                          onMoveUp={() => {}}
                          onMoveDown={() => {}}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}

              {header.processionalOrder.length > 0 && (
                <div className="space-y-1">
                  <h5 className="text-sm font-semibold">Processional walking order</h5>
                  <ol className="list-decimal pl-6 text-sm text-muted-foreground">
                    {header.processionalOrder.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                </div>
              )}

              {header.recessionalCue && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h5 className="text-sm font-semibold">Recessional cue</h5>
                    <Badge variant="outline" className="text-[10px]">verbatim</Badge>
                  </div>
                  <p className="text-sm italic text-muted-foreground">“{header.recessionalCue}”</p>
                </div>
              )}

              <div className="border-t pt-4">
                <Button variant="outline" onClick={() => save('draft', 'reopen')} disabled={saving !== null}>
                  {saving === 'reopen' ? 'Reopening…' : 'Reopen as Draft'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
