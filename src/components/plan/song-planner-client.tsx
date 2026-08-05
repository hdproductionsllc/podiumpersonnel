'use client'

/**
 * The client song planner (082) — the page a couple actually uses.
 *
 * Three states, one component:
 *   EDITING   — lanes of songs, drag or arrow to reorder, autosaves as they type
 *   LOCKED    — read-only after submit, with one button that asks us to reopen it
 *   (either)  — never shows a repertoire match, a library title, or a hint about
 *               what we do and don't already have arranged
 *
 * Built for a phone on a sofa. That drives most of the choices here: big touch
 * targets, one column, no modal dialogs in the editing path, arrow buttons
 * alongside drag (dragging inside a scrolling page on a phone is genuinely
 * awkward, and reorder is the thing clients fiddle with most).
 *
 * Autosave is deliberate about its promises: the "Saved" state only appears
 * after the server confirms, and Submit is disabled until every change is in.
 * A client who taps Submit believing their last edit landed, when it didn't, is
 * the one failure this screen must never produce.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronUp, GripVertical, Loader2, Plus, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  PLANNER_SECTION_LABELS,
  PLANNER_SECTION_HINTS,
  PLANNER_MAX_SONGS,
  PLANNER_MAX_FIELD_CHARS,
  PLANNER_MAX_NOTE_CHARS,
  PLANNER_MAX_PROCESSIONAL,
  CEREMONY_ROLES,
} from '@/lib/intake/planner'
import type { IntakeSection } from '@/lib/intake/types'

export interface PlannerSongDraft {
  uid: string
  section: IntakeSection
  titleRaw: string
  artistRaw: string
  role: string
  notes: string
}

interface SongPlannerClientProps {
  token: string
  organizationName: string
  clientName: string | null
  eventName: string
  eventDate: string | null
  dueAt: string | null
  sections: IntakeSection[]
  showProcessional: boolean
  locked: boolean
  submittedAt: string | null
  initialSongs: PlannerSongDraft[]
  initialProcessional: string[]
  initialContactName: string
  initialContactPhone: string
  initialRecessionalCue: string
  initialNotes: string
}

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

const AUTOSAVE_DELAY_MS = 1500

let uidSeq = 0
function nextUid(): string {
  uidSeq += 1
  return `row-${uidSeq}-${Math.random().toString(36).slice(2, 8)}`
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function SongPlannerClient(props: SongPlannerClientProps) {
  const {
    token,
    organizationName,
    clientName,
    eventName,
    eventDate,
    dueAt,
    sections,
    showProcessional,
    initialSongs,
    initialProcessional,
  } = props

  const [locked, setLocked] = useState(props.locked)
  const [songs, setSongs] = useState<PlannerSongDraft[]>(initialSongs)
  const [processional, setProcessional] = useState<string[]>(initialProcessional)
  const [contactName, setContactName] = useState(props.initialContactName)
  const [contactPhone, setContactPhone] = useState(props.initialContactPhone)
  const [recessionalCue, setRecessionalCue] = useState(props.initialRecessionalCue)
  const [notes, setNotes] = useState(props.initialNotes)

  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmingSubmit, setConfirmingSubmit] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Long-press before a drag starts, so scrolling the page with a thumb does
    // not pick a song up by accident.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // --- autosave ---------------------------------------------------------------

  const firstRender = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)
  const pending = useRef(false)

  const save = useCallback(async () => {
    if (locked) return
    if (inFlight.current) {
      // A save is already going; remember that the newest state hasn't been sent.
      pending.current = true
      return
    }
    inFlight.current = true
    setSaveState('saving')
    setSaveError(null)

    try {
      const res = await fetch(`/api/plan/${token}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songs: songs.map((s) => ({
            section: s.section,
            titleRaw: s.titleRaw,
            artistRaw: s.artistRaw,
            role: s.role,
            notes: s.notes,
          })),
          processionalOrder: processional,
          contactName,
          contactPhone,
          recessionalCue,
          notes,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (res.status === 409) {
        // The operator locked it (or we submitted in another tab). Stop editing
        // rather than letting them keep typing into a void.
        setLocked(true)
        setSaveState('idle')
        return
      }
      if (!res.ok) {
        setSaveState('error')
        setSaveError(data?.error || 'We could not save that just now.')
        return
      }
      setSaveState('saved')
    } catch {
      setSaveState('error')
      setSaveError('We could not reach the server. Your list is still on this page — try again in a moment.')
    } finally {
      inFlight.current = false
      if (pending.current) {
        pending.current = false
        void save()
      }
    }
  }, [locked, token, songs, processional, contactName, contactPhone, recessionalCue, notes])

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (locked) return

    setSaveState('dirty')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), AUTOSAVE_DELAY_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [songs, processional, contactName, contactPhone, recessionalCue, notes, locked, save])

  // Last line of defence: if they close the tab mid-edit, say so.
  useEffect(() => {
    if (saveState !== 'dirty' && saveState !== 'saving') return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [saveState])

  // --- song list operations ----------------------------------------------------

  const sectionSongs = (section: IntakeSection) => songs.filter((s) => s.section === section)

  const total = songs.filter((s) => s.titleRaw.trim() !== '').length
  const atCap = songs.length >= PLANNER_MAX_SONGS

  function addSong(section: IntakeSection) {
    if (atCap) return
    setSongs((prev) => [
      ...prev,
      { uid: nextUid(), section, titleRaw: '', artistRaw: '', role: '', notes: '' },
    ])
  }

  function updateSong(uid: string, patch: Partial<PlannerSongDraft>) {
    setSongs((prev) => prev.map((s) => (s.uid === uid ? { ...s, ...patch } : s)))
  }

  function removeSong(uid: string) {
    setSongs((prev) => prev.filter((s) => s.uid !== uid))
  }

  /** Reorder within one lane, then splice the lane back into the flat list. */
  function reorderSection(section: IntakeSection, from: number, to: number) {
    setSongs((prev) => {
      const lane = prev.filter((s) => s.section === section)
      if (to < 0 || to >= lane.length) return prev
      const moved = arrayMove(lane, from, to)
      let i = 0
      return prev.map((s) => (s.section === section ? moved[i++] : s))
    })
  }

  function handleDragEnd(section: IntakeSection, event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const lane = sectionSongs(section)
    reorderSection(
      section,
      lane.findIndex((s) => s.uid === active.id),
      lane.findIndex((s) => s.uid === over.id)
    )
  }

  // --- submit ------------------------------------------------------------------

  async function handleSubmit() {
    setSubmitting(true)
    try {
      // Flush anything outstanding first — submitting a list that is missing the
      // last thing they typed would be the worst possible bug on this page.
      if (timer.current) clearTimeout(timer.current)
      await save()

      const res = await fetch(`/api/plan/${token}/submit`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSaveError(data?.error || 'We could not send that just now. Please try again.')
        return
      }
      setLocked(true)
      setConfirmingSubmit(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSubmitting(false)
    }
  }

  const eventOn = formatDate(eventDate)
  const dueOn = formatDate(dueAt)

  if (locked) {
    return (
      <LockedView
        token={token}
        organizationName={organizationName}
        eventName={eventName}
        eventOn={eventOn}
        songs={songs}
        sections={sections}
        processional={processional}
        showProcessional={showProcessional}
      />
    )
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-32">
      <header className="border-b bg-background">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {organizationName}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            {clientName ? `${clientName}'s music` : 'Your music'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {eventName}
            {eventOn ? ` · ${eventOn}` : ''}
          </p>
          {dueOn && (
            <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
              Please have your list in by <strong>{dueOn}</strong>.
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <p className="text-sm text-muted-foreground">
          Add anything you&apos;d like us to play and put it in the order you want to hear it.
          Nothing is too obscure to ask for — if you want something we haven&apos;t played
          before, we&apos;ll arrange it. Your list saves as you go, so you can close this and
          come back any time.
        </p>

        {sections.map((section) => (
          <section key={section} className="rounded-lg border bg-background p-4">
            <h2 className="text-lg font-semibold">{PLANNER_SECTION_LABELS[section]}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {PLANNER_SECTION_HINTS[section]}
            </p>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handleDragEnd(section, e)}
            >
              <SortableContext
                items={sectionSongs(section).map((s) => s.uid)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="mt-4 space-y-3">
                  {sectionSongs(section).map((song, index, lane) => (
                    <SongRow
                      key={song.uid}
                      song={song}
                      index={index}
                      count={lane.length}
                      onChange={(patch) => updateSong(song.uid, patch)}
                      onRemove={() => removeSong(song.uid)}
                      onMove={(delta) => reorderSection(section, index, index + delta)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>

            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full"
              onClick={() => addSong(section)}
              disabled={atCap}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add a song
            </Button>

            {section === 'recessional' && (
              <div className="mt-4">
                <Label htmlFor="recessional-cue" className="text-sm">
                  Anything we should watch for as you walk back out?
                </Label>
                <Textarea
                  id="recessional-cue"
                  value={recessionalCue}
                  maxLength={PLANNER_MAX_NOTE_CHARS}
                  onChange={(e) => setRecessionalCue(e.target.value)}
                  placeholder="e.g. Start the moment we kiss — don't wait for the officiant"
                  className="mt-1.5"
                  rows={2}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  We&apos;ll pass this on word for word.
                </p>
              </div>
            )}
          </section>
        ))}

        {atCap && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            That&apos;s {PLANNER_MAX_SONGS} songs — plenty for any event. If you genuinely need
            more, get in touch and we&apos;ll sort it out.
          </p>
        )}

        {showProcessional && (
          <ProcessionalEditor value={processional} onChange={setProcessional} />
        )}

        <section className="rounded-lg border bg-background p-4">
          <h2 className="text-lg font-semibold">How we reach you on the day</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Who should we call if we need something — you, or someone who isn&apos;t getting
            married that morning?
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="contact-name">Name</Label>
              <Input
                id="contact-name"
                value={contactName}
                maxLength={PLANNER_MAX_FIELD_CHARS}
                onChange={(e) => setContactName(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="contact-phone">Phone</Label>
              <Input
                id="contact-phone"
                type="tel"
                value={contactPhone}
                maxLength={PLANNER_MAX_FIELD_CHARS}
                onChange={(e) => setContactPhone(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="mt-4">
            <Label htmlFor="planner-notes">Anything else we should know?</Label>
            <Textarea
              id="planner-notes"
              value={notes}
              maxLength={PLANNER_MAX_NOTE_CHARS}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Songs to avoid, a surprise we should keep quiet about, anything at all"
              className="mt-1.5"
              rows={3}
            />
          </div>
        </section>

        {saveError && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {saveError}
          </p>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <SaveIndicator state={saveState} count={total} />
          {confirmingSubmit ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setConfirmingSubmit(false)} disabled={submitting}>
                Not yet
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Yes, send it
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => setConfirmingSubmit(true)}
              disabled={total === 0 || saveState === 'saving' || saveState === 'dirty'}
            >
              Send us the list
            </Button>
          )}
        </div>
        {confirmingSubmit && (
          <div className="mx-auto max-w-2xl px-4 pb-3 text-sm text-muted-foreground">
            Once you send it, the list locks so we can start preparing. Need a change after
            that? Just ask and we&apos;ll reopen it.
          </div>
        )}
      </div>
    </div>
  )
}

// --- save indicator -----------------------------------------------------------

function SaveIndicator({ state, count }: { state: SaveState; count: number }) {
  const songLabel = `${count} song${count === 1 ? '' : 's'}`

  if (state === 'saving') {
    return (
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
      </span>
    )
  }
  if (state === 'dirty') {
    return <span className="text-sm text-muted-foreground">Unsaved changes…</span>
  }
  if (state === 'error') {
    return <span className="text-sm text-destructive">Not saved</span>
  }
  return (
    <span className="flex items-center gap-2 text-sm text-muted-foreground">
      {state === 'saved' && <Check className="h-3.5 w-3.5 text-emerald-600" />}
      {state === 'saved' ? 'All changes saved' : songLabel}
    </span>
  )
}

// --- one song ------------------------------------------------------------------

function SongRow({
  song,
  index,
  count,
  onChange,
  onRemove,
  onMove,
}: {
  song: PlannerSongDraft
  index: number
  count: number
  onChange: (patch: Partial<PlannerSongDraft>) => void
  onRemove: () => void
  onMove: (delta: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: song.uid,
  })
  const [showNote, setShowNote] = useState(song.notes.trim() !== '')

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-md border bg-background p-3 ${isDragging ? 'z-50 shadow-lg ring-2 ring-primary/20' : ''}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-2 hidden cursor-grab touch-none text-muted-foreground active:cursor-grabbing sm:block"
          aria-label={`Reorder ${song.titleRaw || 'this song'}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="flex-1 space-y-2">
          <Input
            value={song.titleRaw}
            maxLength={PLANNER_MAX_FIELD_CHARS}
            onChange={(e) => onChange({ titleRaw: e.target.value })}
            placeholder="Song title"
            aria-label="Song title"
          />
          <Input
            value={song.artistRaw}
            maxLength={PLANNER_MAX_FIELD_CHARS}
            onChange={(e) => onChange({ artistRaw: e.target.value })}
            placeholder="Artist or composer (if you know it)"
            aria-label="Artist or composer"
          />

          {song.section === 'ceremony' && (
            <>
              <Input
                value={song.role}
                maxLength={PLANNER_MAX_FIELD_CHARS}
                onChange={(e) => onChange({ role: e.target.value })}
                placeholder="What's happening then? e.g. Bride's Entrance"
                aria-label="Moment in the ceremony"
                list="ceremony-roles"
              />
              <datalist id="ceremony-roles">
                {CEREMONY_ROLES.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </>
          )}

          {showNote ? (
            <Textarea
              value={song.notes}
              maxLength={PLANNER_MAX_NOTE_CHARS}
              onChange={(e) => onChange({ notes: e.target.value })}
              placeholder="Anything about this one — a version you love, where it should start…"
              aria-label="Note about this song"
              rows={2}
            />
          ) : (
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-2"
              onClick={() => setShowNote(true)}
            >
              Add a note
            </button>
          )}
        </div>

        <div className="flex flex-col items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Move up"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Move down"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            aria-label="Remove this song"
            onClick={onRemove}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </li>
  )
}

// --- walking order -------------------------------------------------------------

function ProcessionalEditor({
  value,
  onChange,
}: {
  value: string[]
  onChange: (next: string[]) => void
}) {
  const atCap = value.length >= PLANNER_MAX_PROCESSIONAL

  return (
    <section className="rounded-lg border bg-background p-4">
      <h2 className="text-lg font-semibold">Walking order</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Who walks in, in the order they walk. This tells us when to change songs.
      </p>

      <ul className="mt-4 space-y-2">
        {value.map((entry, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-5 text-center text-sm text-muted-foreground">{i + 1}</span>
            <Input
              value={entry}
              maxLength={PLANNER_MAX_FIELD_CHARS}
              onChange={(e) => {
                const next = [...value]
                next[i] = e.target.value
                onChange(next)
              }}
              placeholder="e.g. Grandparents"
              aria-label={`Walking order position ${i + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Move up"
              disabled={i === 0}
              onClick={() => onChange(arrayMove(value, i, i - 1))}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Move down"
              disabled={i === value.length - 1}
              onClick={() => onChange(arrayMove(value, i, i + 1))}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              aria-label="Remove"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              <X className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>

      <Button
        type="button"
        variant="outline"
        className="mt-3 w-full"
        disabled={atCap}
        onClick={() => onChange([...value, ''])}
      >
        <Plus className="mr-2 h-4 w-4" />
        Add someone
      </Button>
    </section>
  )
}

// --- after submit ---------------------------------------------------------------

function LockedView({
  token,
  organizationName,
  eventName,
  eventOn,
  songs,
  sections,
  processional,
  showProcessional,
}: {
  token: string
  organizationName: string
  eventName: string
  eventOn: string | null
  songs: PlannerSongDraft[]
  sections: IntakeSection[]
  processional: string[]
  showProcessional: boolean
}) {
  const [asking, setAsking] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function requestChanges() {
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/plan/${token}/request-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'We could not send that. Please get in touch with us directly.')
        return
      }
      setSent(true)
      setAsking(false)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-16">
      <header className="border-b bg-background">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {organizationName}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Thank you — we have your music</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {eventName}
            {eventOn ? ` · ${eventOn}` : ''}
          </p>
          <p className="mt-3 text-sm">
            We&apos;re preparing everything below. There&apos;s nothing else you need to do.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        {sections.map((section) => {
          const lane = songs.filter((s) => s.section === section && s.titleRaw.trim() !== '')
          if (lane.length === 0) return null
          return (
            <section key={section} className="rounded-lg border bg-background p-4">
              <h2 className="text-base font-semibold">{PLANNER_SECTION_LABELS[section]}</h2>
              <ol className="mt-2 space-y-1.5">
                {lane.map((s) => (
                  <li key={s.uid} className="text-sm">
                    <span className="font-medium">{s.titleRaw}</span>
                    {s.artistRaw && <span className="text-muted-foreground"> — {s.artistRaw}</span>}
                    {s.role && (
                      <span className="block text-xs text-muted-foreground">{s.role}</span>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )
        })}

        {showProcessional && processional.length > 0 && (
          <section className="rounded-lg border bg-background p-4">
            <h2 className="text-base font-semibold">Walking order</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
              {processional.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          </section>
        )}

        <section className="rounded-lg border bg-background p-4">
          {sent ? (
            <p className="text-sm">
              Thanks — we&apos;ve passed that on and someone will be in touch shortly.
            </p>
          ) : asking ? (
            <>
              <Label htmlFor="change-message">What would you like to change?</Label>
              <Textarea
                id="change-message"
                value={message}
                maxLength={PLANNER_MAX_NOTE_CHARS}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what needs changing and we'll take it from there."
                className="mt-1.5"
                rows={3}
              />
              <div className="mt-3 flex gap-2">
                <Button onClick={requestChanges} disabled={sending}>
                  {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Send
                </Button>
                <Button variant="ghost" onClick={() => setAsking(false)} disabled={sending}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-base font-semibold">Changed your mind?</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Ask us and we&apos;ll open your list back up.
              </p>
              <Button variant="outline" className="mt-3" onClick={() => setAsking(true)}>
                Something needs changing
              </Button>
            </>
          )}
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </section>
      </main>
    </div>
  )
}
