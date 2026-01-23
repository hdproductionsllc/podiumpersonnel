'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import type { BookEntryJoined, InstrumentOption, MusicianForDropdown } from './books-client'

interface BookInstrumentChairsProps {
  instrument: InstrumentOption
  entries: BookEntryJoined[]
  musicians: MusicianForDropdown[]
  bookId: string
  canManage: boolean
  onEntryChange: () => void
}

export function BookInstrumentChairs({
  instrument,
  entries,
  musicians,
  bookId,
  canManage,
  onEntryChange,
}: BookInstrumentChairsProps) {
  const [pendingChair, setPendingChair] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const assignedMusicianIds = new Set(entries.map((e) => e.musician_id))

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
        setError('This musician is already assigned to this instrument.')
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
        setError('This musician is already assigned to this instrument.')
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddChair}
            disabled={isLoading || pendingChair !== null}
          >
            Add Chair
          </Button>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {entries.length === 0 && pendingChair === null && (
        <p className="text-xs text-muted-foreground">No chairs assigned.</p>
      )}

      <div className="space-y-1">
        {entries.map((entry) => {
          const dropdownMusicians = getDropdownMusicians(entry.musician_id)
          return (
            <div key={entry.id} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-14">
                Chair {entry.chair_number ?? '—'}
              </span>
              {canManage ? (
                <select
                  className="flex h-8 w-full max-w-xs rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={entry.musician_id}
                  onChange={(e) => handleMusicianChange(entry.id, e.target.value)}
                  disabled={isLoading}
                >
                  {dropdownMusicians.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.last_name}, {m.first_name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm">
                  {entry.musician.last_name}, {entry.musician.first_name}
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
            <span className="text-xs text-muted-foreground w-14">
              Chair {pendingChair}
            </span>
            <select
              className="flex h-8 w-full max-w-xs rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value=""
              onChange={(e) => handleAssignMusician(e.target.value, pendingChair)}
              disabled={isLoading}
            >
              <option value="">-- Select musician --</option>
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
            No musicians play this instrument.
          </p>
        )}
      </div>
    </div>
  )
}
