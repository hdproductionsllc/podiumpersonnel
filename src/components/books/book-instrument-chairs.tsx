'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useVertical, useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'
import type { BookEntryJoined, InstrumentOption, MusicianForDropdown } from './books-client'

interface BookInstrumentChairsProps {
  instrument: InstrumentOption
  entries: BookEntryJoined[]
  ensembleSize: number
  musicians: MusicianForDropdown[]
  bookId: string
  canManage: boolean
  onEntryChange: () => void
}

export function BookInstrumentChairs({
  instrument,
  entries,
  ensembleSize,
  musicians,
  bookId,
  canManage,
  onEntryChange,
}: BookInstrumentChairsProps) {
  const { titleRules } = useVertical()
  const { getPositionTitle } = titleRules
  const terms = useTerms()
  const [pendingChair, setPendingChair] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const assignedMusicianIds = new Set(entries.map((e) => e.musician_id).filter(Boolean))

  const availableMusicians = musicians.filter((m) =>
    m.musician_instruments.some((mi) => mi.instrument_id === instrument.id)
  )

  function getDropdownMusicians(currentMusicianId?: string) {
    return availableMusicians.filter(
      (m) => m.id === currentMusicianId || !assignedMusicianIds.has(m.id)
    )
  }

  function handleAddChair() {
    const nextChair = entries.length > 0
      ? Math.max(...entries.map((e) => e.chair_number ?? 0)) + 1
      : 1
    setPendingChair(nextChair)
  }

  async function handleAssignMusician(musicianId: string, chairNumber: number) {
    if (!musicianId) return
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    const { error: insertError } = await supabase
      .from('book_entries')
      .insert({
        book_id: bookId,
        musician_id: musicianId,
        instrument_id: instrument.id,
        chair_number: chairNumber,
        priority: 0,
      })

    if (insertError) {
      if (insertError.code === '23505') {
        setError(`This ${term(terms, 'person', { case: 'lower' })} is already assigned to this ${term(terms, 'skill', { case: 'lower' })}.`)
      } else {
        setError(insertError.message)
      }
      setIsLoading(false)
      return
    }

    setPendingChair(null)
    setIsLoading(false)
    onEntryChange()
  }

  async function handleMusicianChange(entryId: string, newMusicianId: string) {
    if (!newMusicianId) return
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    const { error: updateError } = await supabase
      .from('book_entries')
      .update({ musician_id: newMusicianId })
      .eq('id', entryId)

    if (updateError) {
      if (updateError.code === '23505') {
        setError(`This ${term(terms, 'person', { case: 'lower' })} is already assigned to this ${term(terms, 'skill', { case: 'lower' })}.`)
      } else {
        setError(updateError.message)
      }
      setIsLoading(false)
      return
    }

    setIsLoading(false)
    onEntryChange()
  }

  async function handleRemoveChair(entryId: string) {
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    const { error: deleteError } = await supabase
      .from('book_entries')
      .delete()
      .eq('id', entryId)

    if (deleteError) {
      setError(deleteError.message)
      setIsLoading(false)
      return
    }

    setIsLoading(false)
    onEntryChange()
  }

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {instrument.name}
          {instrument.abbreviation && (
            <span className="text-muted-foreground ml-1">({instrument.abbreviation})</span>
          )}
        </span>
        {canManage && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddChair}
              disabled={isLoading || pendingChair !== null}
            >
              {`Add ${term(terms, 'rank')}`}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              title={`Remove this ${term(terms, 'skill', { case: 'lower' })} from the ensemble`}
              onClick={async () => {
                if (!confirm(`Remove ${instrument.name} and all its ${term(terms, 'rank', { plural: true, case: 'lower' })} from this ensemble?`)) return
                setIsLoading(true)
                setError(null)
                const supabase = createClient()
                const { error: removeError } = await supabase
                  .from('book_entries')
                  .delete()
                  .eq('book_id', bookId)
                  .eq('instrument_id', instrument.id)
                if (removeError) {
                  setError(removeError.message)
                  setIsLoading(false)
                  return
                }
                setIsLoading(false)
                onEntryChange()
              }}
              disabled={isLoading}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {entries.length === 0 && pendingChair === null && (
        <p className="text-xs text-muted-foreground">{`No ${term(terms, 'rank', { plural: true, case: 'lower' })} assigned.`}</p>
      )}

      <div className="space-y-1">
        {entries.map((entry) => {
          const dropdownMusicians = getDropdownMusicians(entry.musician_id ?? undefined)
          const position = getPositionTitle(instrument.name, entry.chair_number ?? 1, instrument.section, entries.length, ensembleSize)
          return (
            <div key={entry.id} className="flex items-center gap-3">
              <span className={`text-xs w-28 ${position.isLeadership ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                {position.title}
              </span>
              {canManage ? (
                <select
                  className="flex h-8 w-full max-w-xs rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={entry.musician_id || ''}
                  onChange={(e) => handleMusicianChange(entry.id, e.target.value)}
                  disabled={isLoading}
                >
                  {!entry.musician_id && (
                    <option value="">{`-- Select ${term(terms, 'person', { case: 'lower' })} --`}</option>
                  )}
                  {dropdownMusicians.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.last_name}, {m.first_name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm">
                  {entry.musician
                    ? `${entry.musician.last_name}, ${entry.musician.first_name}`
                    : <span className="text-muted-foreground italic">Unassigned</span>}
                </span>
              )}
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive h-8 px-2"
                  onClick={() => handleRemoveChair(entry.id)}
                  disabled={isLoading}
                >
                  Remove
                </Button>
              )}
            </div>
          )
        })}

        {pendingChair !== null && (
          <div className="flex items-center gap-3">
            <span className={`text-xs w-28 ${getPositionTitle(instrument.name, pendingChair, instrument.section, entries.length + 1, ensembleSize + 1).isLeadership ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
              {getPositionTitle(instrument.name, pendingChair, instrument.section, entries.length + 1, ensembleSize + 1).title}
            </span>
            <select
              className="flex h-8 w-full max-w-xs rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value=""
              onChange={(e) => handleAssignMusician(e.target.value, pendingChair)}
              disabled={isLoading}
            >
              <option value="">{`-- Select ${term(terms, 'person', { case: 'lower' })} --`}</option>
              {getDropdownMusicians().map((m) => (
                <option key={m.id} value={m.id}>
                  {m.last_name}, {m.first_name}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => setPendingChair(null)}
              disabled={isLoading}
            >
              Cancel
            </Button>
          </div>
        )}

        {availableMusicians.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            {`No ${term(terms, 'person', { plural: true, case: 'lower' })} play this ${term(terms, 'skill', { case: 'lower' })}.`}
          </p>
        )}
      </div>
    </div>
  )
}
