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
import type { Venue } from '@/types'

interface DeleteVenueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  venue: Venue | null
  onSuccess: () => void
}

export function DeleteVenueDialog({
  open,
  onOpenChange,
  venue,
  onSuccess,
}: DeleteVenueDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!venue) return
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    const { error: deleteError } = await supabase
      .from('venues')
      .delete()
      .eq('id', venue.id)

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
          <DialogTitle>Delete Venue</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{venue?.name}"? This action cannot be undone.
            Services that reference this venue will keep their venue name but lose the linked details.
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
