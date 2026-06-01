'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { Instrument } from '@/types'

interface DeleteInstrumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instrument: Instrument | null
  onSuccess: () => void
}

export function DeleteInstrumentDialog({
  open,
  onOpenChange,
  instrument,
  onSuccess,
}: DeleteInstrumentDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [positionCount, setPositionCount] = useState<number | null>(null)
  const [confirmedCount, setConfirmedCount] = useState(0)
  const [musicianCount, setMusicianCount] = useState(0)

  // Deleting an instrument cascades into project_positions (including confirmed
  // staffing) and musician_instruments. Only allow deletion when the instrument
  // is completely unused — otherwise removing a duplicate would silently wipe
  // booked chairs and roster data.
  useEffect(() => {
    if (!open || !instrument) {
      setPositionCount(null)
      setError(null)
      return
    }
    let cancelled = false
    setChecking(true)
    const supabase = createClient()
    Promise.all([
      supabase
        .from('project_positions')
        .select('id', { count: 'exact', head: true })
        .eq('instrument_id', instrument.id),
      supabase
        .from('project_positions')
        .select('id', { count: 'exact', head: true })
        .eq('instrument_id', instrument.id)
        .eq('status', 'confirmed'),
      supabase
        .from('musician_instruments')
        .select('musician_id', { count: 'exact', head: true })
        .eq('instrument_id', instrument.id),
    ]).then(([positions, confirmed, musicians]) => {
      if (cancelled) return
      const firstError = positions.error || confirmed.error || musicians.error
      if (firstError) setError(firstError.message)
      setPositionCount(positions.count ?? 0)
      setConfirmedCount(confirmed.count ?? 0)
      setMusicianCount(musicians.count ?? 0)
      setChecking(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, instrument])

  const inUse = (positionCount ?? 0) > 0 || musicianCount > 0

  async function handleDelete() {
    if (!instrument) return
    setIsLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: deleteError } = await supabase
      .from('instruments')
      .delete()
      .eq('id', instrument.id)

    if (deleteError) {
      setError(deleteError.message)
      setIsLoading(false)
      return
    }

    setIsLoading(false)
    onSuccess()
  }

  const usageParts: string[] = []
  if ((positionCount ?? 0) > 0) {
    usageParts.push(
      `${positionCount} project position${positionCount === 1 ? '' : 's'}` +
        (confirmedCount > 0 ? ` (${confirmedCount} confirmed)` : '')
    )
  }
  if (musicianCount > 0) {
    usageParts.push(`${musicianCount} musician${musicianCount === 1 ? '' : 's'}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Instrument</DialogTitle>
          <DialogDescription>
            {checking ? (
              <>Checking where &quot;{instrument?.name}&quot; is used…</>
            ) : inUse ? (
              <>
                &quot;{instrument?.name}&quot; is currently used by {usageParts.join(' and ')}.
                Deleting it would remove those positions and any confirmed staffing. Reassign
                or remove them first, then delete the instrument.
              </>
            ) : (
              <>
                Are you sure you want to delete &quot;{instrument?.name}&quot;? This action
                cannot be undone.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {inUse ? 'Close' : 'Cancel'}
          </Button>
          {!inUse && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isLoading || checking}
            >
              {isLoading ? 'Deleting…' : 'Delete'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
