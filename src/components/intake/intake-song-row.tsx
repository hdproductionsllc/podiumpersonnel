'use client'

/**
 * One editable song row on the intake review screen — the atom of the
 * foolproof human-confirm gate. It shows exactly what the parser proposed
 * (title / artist / ceremony role, all editable) and the repertoire MATCH
 * state, and lets the admin resolve anything the parser wasn't sure about:
 *
 *   green  "Matched"        — a clean single library hit (or an admin pick)
 *   amber  "Needs a choice" — ambiguous: pick from candidates or search
 *   red    "Not in library" — missing: search the library or keep as typed
 *
 * A row counts as RESOLVED when its status is 'matched' or 'manual'. The panel
 * gates Confirm on every row being resolved, so misparses can never be saved
 * silently — they stay visibly red/amber until a human deals with them.
 */

import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { RepertoireSearchResult } from '@/app/api/intake/repertoire/route'

export type IntakeSectionKey =
  | 'prelude'
  | 'ceremony'
  | 'recessional'
  | 'postlude'
  | 'cocktail_hour'
  | 'reception'
  | 'other'

export type RowMatchStatus = 'matched' | 'ambiguous' | 'missing' | 'manual'

export interface RepCandidate {
  repertoireId: string
  title: string
  artist: string | null
  ensemble: string
}

export interface SongRow {
  /** Stable client id for React keys / reordering (not persisted). */
  uid: string
  section: IntakeSectionKey
  role: string | null
  titleRaw: string
  artistRaw: string
  notes: string | null
  matchStatus: RowMatchStatus
  matchedRepertoireId: string | null
  /** Display label for the currently matched/selected work ("Title — Artist"). */
  matchedLabel: string | null
  /** Candidate works for an ambiguous match (empty once resolved or on reload). */
  candidates: RepCandidate[]
  /** Matcher note surfaced to the human (e.g. an artist disagreement). */
  warning: string | null
}

export function workLabel(title: string, artist: string | null): string {
  return artist ? `${title} — ${artist}` : title
}

function candidateLabel(c: RepCandidate): string {
  return workLabel(c.title, c.artist)
}

// --- library search (backs the "Not in library" / "Change match" box) --------

function RepertoireSearch({
  onPick,
  autoFocus,
}: {
  onPick: (r: RepertoireSearchResult) => void
  autoFocus?: boolean
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<RepertoireSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqId = useRef(0)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const query = q.trim()
    if (query.length < 2) {
      setResults([])
      setSearched(false)
      setLoading(false)
      return
    }
    setLoading(true)
    timer.current = setTimeout(async () => {
      const id = ++reqId.current
      try {
        const res = await fetch(`/api/intake/repertoire?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        // Ignore results from a stale request that resolved out of order.
        if (id !== reqId.current) return
        setResults(res.ok && Array.isArray(data.results) ? data.results : [])
      } catch {
        if (id === reqId.current) setResults([])
      } finally {
        if (id === reqId.current) {
          setLoading(false)
          setSearched(true)
        }
      }
    }, 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [q])

  return (
    <div className="space-y-1.5">
      <Input
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search the library by title or composer…"
        className="h-8 text-sm"
      />
      {loading && <p className="text-xs text-muted-foreground px-1">Searching…</p>}
      {!loading && searched && results.length === 0 && (
        <p className="text-xs text-muted-foreground px-1">No library matches for “{q.trim()}”.</p>
      )}
      {results.length > 0 && (
        <ul className="max-h-44 overflow-y-auto rounded-md border bg-background divide-y">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onPick(r)}
                className="w-full text-left px-2.5 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <span className="font-medium">{r.title}</span>
                {r.artist && <span className="text-muted-foreground"> — {r.artist}</span>}
                <span className="ml-1 text-xs text-muted-foreground capitalize">({r.ensemble})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// --- the row -----------------------------------------------------------------

interface IntakeSongRowProps {
  song: SongRow
  positionLabel: number
  readOnly?: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onChange: (patch: Partial<SongRow>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

export function IntakeSongRow({
  song,
  positionLabel,
  readOnly = false,
  canMoveUp,
  canMoveDown,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: IntakeSongRowProps) {
  const [changing, setChanging] = useState(false)
  const resolved = song.matchStatus === 'matched' || song.matchStatus === 'manual'
  const isCeremony = song.section === 'ceremony'

  function pickCandidate(c: RepCandidate) {
    onChange({
      matchStatus: 'manual',
      matchedRepertoireId: c.repertoireId,
      matchedLabel: candidateLabel(c),
      warning: null,
    })
    setChanging(false)
  }

  function pickSearch(r: RepertoireSearchResult) {
    onChange({
      matchStatus: 'manual',
      matchedRepertoireId: r.id,
      matchedLabel: workLabel(r.title, r.artist),
      warning: null,
    })
    setChanging(false)
  }

  function useAsTyped() {
    onChange({
      matchStatus: 'manual',
      matchedRepertoireId: null,
      matchedLabel: null,
      warning: null,
    })
    setChanging(false)
  }

  // Read-only rendering (confirmed state) — compact, no controls.
  if (readOnly) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 border-b last:border-b-0">
        <span className="text-xs text-muted-foreground tabular-nums w-5 shrink-0">{positionLabel}.</span>
        <span className="font-medium">{song.titleRaw || <span className="text-muted-foreground italic">(untitled)</span>}</span>
        {song.artistRaw && <span className="text-muted-foreground text-sm">{song.artistRaw}</span>}
        {isCeremony && song.role && <Badge variant="outline" className="text-xs">{song.role}</Badge>}
        <span className="ml-auto">
          {song.matchStatus === 'matched' && (
            <Badge variant="success" className="text-xs">Matched: {song.matchedLabel}</Badge>
          )}
          {song.matchStatus === 'manual' && song.matchedRepertoireId && (
            <Badge variant="success" className="text-xs">Set: {song.matchedLabel}</Badge>
          )}
          {song.matchStatus === 'manual' && !song.matchedRepertoireId && (
            <Badge variant="secondary" className="text-xs">As typed</Badge>
          )}
        </span>
      </div>
    )
  }

  return (
    <div className="rounded-md border bg-background p-3 space-y-2">
      <div className="flex items-start gap-2">
        <span className="text-xs text-muted-foreground tabular-nums pt-2 w-5 shrink-0">{positionLabel}.</span>

        <div className="flex-1 min-w-0 space-y-2">
          {/* Title + artist */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Title</label>
              <Input
                value={song.titleRaw}
                onChange={(e) => onChange({ titleRaw: e.target.value })}
                placeholder="Song title"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Artist / Composer</label>
              <Input
                value={song.artistRaw}
                onChange={(e) => onChange({ artistRaw: e.target.value })}
                placeholder="(optional)"
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* Ceremony role */}
          {isCeremony && (
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Ceremony role</label>
              <Input
                value={song.role ?? ''}
                onChange={(e) => onChange({ role: e.target.value || null })}
                placeholder="e.g. Processional, Bride Entrance"
                className="h-8 text-sm max-w-xs"
              />
            </div>
          )}

          {/* Match state */}
          <div className="space-y-1.5">
            {/* Resolved */}
            {resolved && !changing && (
              <div className="flex flex-wrap items-center gap-2">
                {song.matchStatus === 'matched' && (
                  <Badge variant="success" className="text-xs">Matched: {song.matchedLabel}</Badge>
                )}
                {song.matchStatus === 'manual' && song.matchedRepertoireId && (
                  <Badge variant="success" className="text-xs">Set: {song.matchedLabel}</Badge>
                )}
                {song.matchStatus === 'manual' && !song.matchedRepertoireId && (
                  <Badge variant="secondary" className="text-xs">Using “{song.titleRaw}” as typed</Badge>
                )}
                <Button type="button" variant="ghost" size="xs" onClick={() => setChanging(true)}>
                  Change
                </Button>
              </div>
            )}

            {/* Ambiguous */}
            {song.matchStatus === 'ambiguous' && !changing && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge variant="warning" className="text-xs">
                    Needs a choice: {song.candidates.length || 'no'} candidate{song.candidates.length === 1 ? '' : 's'}
                  </Badge>
                </div>
                {song.warning && <p className="text-xs text-amber-700 dark:text-amber-400">{song.warning}</p>}
                {song.candidates.length > 0 && (
                  <ul className="rounded-md border bg-background divide-y">
                    {song.candidates.map((c) => (
                      <li key={c.repertoireId}>
                        <button
                          type="button"
                          onClick={() => pickCandidate(c)}
                          className="w-full text-left px-2.5 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                        >
                          <span className="font-medium">{c.title}</span>
                          {c.artist && <span className="text-muted-foreground"> — {c.artist}</span>}
                          <span className="ml-1 text-xs text-muted-foreground capitalize">({c.ensemble})</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <RepertoireSearch onPick={pickSearch} />
                <Button type="button" variant="ghost" size="xs" onClick={useAsTyped}>
                  Use “{song.titleRaw}” as typed
                </Button>
              </div>
            )}

            {/* Missing */}
            {song.matchStatus === 'missing' && !changing && (
              <div className="space-y-1.5">
                <Badge variant="destructive" className="text-xs">Not in library</Badge>
                <RepertoireSearch onPick={pickSearch} />
                <Button type="button" variant="ghost" size="xs" onClick={useAsTyped}>
                  Use “{song.titleRaw}” as typed
                </Button>
              </div>
            )}

            {/* Changing an already-resolved row */}
            {changing && (
              <div className="space-y-1.5 rounded-md border border-dashed p-2">
                <p className="text-xs text-muted-foreground">Pick a different library work, or keep it as typed.</p>
                <RepertoireSearch onPick={pickSearch} autoFocus />
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="xs" onClick={useAsTyped}>
                    Use as typed
                  </Button>
                  <Button type="button" variant="ghost" size="xs" onClick={() => setChanging(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Row controls */}
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            title="Move up"
            aria-label="Move up"
          >
            <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            title="Move down"
            aria-label="Move down"
          >
            <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-destructive hover:text-destructive"
            onClick={onRemove}
            title="Remove song"
            aria-label="Remove song"
          >
            <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </Button>
        </div>
      </div>
    </div>
  )
}
