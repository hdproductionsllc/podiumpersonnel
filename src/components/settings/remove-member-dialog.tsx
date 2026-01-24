'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface RemoveMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: { id: string; email: string } | null
  onSuccess: () => void
}

export function RemoveMemberDialog({ open, onOpenChange, member, onSuccess }: RemoveMemberDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRemove() {
    if (!member) return
    setIsLoading(true)
    setError(null)

    const response = await fetch(`/api/settings/members/${member.id}`, {
      method: 'DELETE',
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Failed to remove member')
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
          <DialogTitle>Remove Member</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove {member?.email} from the organization? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleRemove} disabled={isLoading}>
            {isLoading ? 'Removing...' : 'Remove'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
