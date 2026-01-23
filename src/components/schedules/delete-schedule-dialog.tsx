'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import type { CompetingSchedule } from '@/types'

interface DeleteScheduleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  schedule: CompetingSchedule | null
  onSuccess: () => void
}

export function DeleteScheduleDialog({
  open,
  onOpenChange,
  schedule,
  onSuccess,
}: DeleteScheduleDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open || !schedule) return null

  async function handleDelete() {
    if (!schedule) return
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: deleteError } = await supabase
      .from('competing_schedules')
      .delete()
      .eq('id', schedule.id)

    setLoading(false)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    onOpenChange(false)
    onSuccess()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className="relative bg-background rounded-lg border shadow-lg w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-semibold">Delete Schedule Entry</h3>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete &ldquo;{schedule.title}&rdquo;? This action cannot be undone.
        </p>

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  )
}
