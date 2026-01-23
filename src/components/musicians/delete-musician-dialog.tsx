'use client'

import { useState } from 'react'
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
import type { MusicianWithInstruments } from './musicians-client'

interface DeleteMusicianDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  musician: MusicianWithInstruments | null
  onSuccess: () => void
}

export function DeleteMusicianDialog({
  open,
  onOpenChange,
  musician,
  onSuccess,
}: DeleteMusicianDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!musician) return
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    const { error: deleteError } = await supabase
      .from('musicians')
      .delete()
      .eq('id', musician.id)

    if (deleteError) {
      setError(deleteError.message)
      setIsLoading(false)
      return
    }

    setIsLoading(false)
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Musician</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete {musician?.first_name} {musician?.last_name}?
            This action cannot be undone.
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
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isLoading}
          >
            {isLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
