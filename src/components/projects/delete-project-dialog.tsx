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
import type { ProjectWithServices } from './projects-client'

interface DeleteProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: ProjectWithServices | null
  onSuccess: () => void
}

export function DeleteProjectDialog({
  open,
  onOpenChange,
  project,
  onSuccess,
}: DeleteProjectDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentCount, setPaymentCount] = useState<number | null>(null)
  const [checking, setChecking] = useState(false)

  // Deleting a project cascades into its services and (previously) their
  // payments. Check for payment records up front: if any exist, we archive the
  // project (status='cancelled') instead of destroying its financial history.
  useEffect(() => {
    if (!open || !project) {
      setPaymentCount(null)
      setError(null)
      return
    }
    const serviceIds = project.services.map((s) => s.id)
    if (serviceIds.length === 0) {
      setPaymentCount(0)
      return
    }
    let cancelled = false
    setChecking(true)
    const supabase = createClient()
    supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .in('service_id', serviceIds)
      .then(({ count, error: countError }) => {
        if (cancelled) return
        if (countError) setError(countError.message)
        else setPaymentCount(count ?? 0)
        setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, project])

  const hasPayments = (paymentCount ?? 0) > 0
  const serviceCount = project?.services.length ?? 0

  async function handleDelete() {
    if (!project) return
    setIsLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: deleteError } = await supabase
      .from('projects')
      .delete()
      .eq('id', project.id)

    if (deleteError) {
      const friendly = /foreign key|violates|constraint/i.test(deleteError.message)
        ? 'This project has payment records and cannot be deleted. Archive it instead to preserve history.'
        : deleteError.message
      setError(friendly)
      setIsLoading(false)
      return
    }

    setIsLoading(false)
    onSuccess()
  }

  async function handleArchive() {
    if (!project) return
    setIsLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('projects')
      .update({ status: 'cancelled' })
      .eq('id', project.id)

    if (updateError) {
      setError(updateError.message)
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
          <DialogTitle>
            {hasPayments ? 'Archive Project' : 'Delete Project'}
          </DialogTitle>
          <DialogDescription>
            {checking ? (
              <>Checking &quot;{project?.name}&quot; for payment records…</>
            ) : hasPayments ? (
              <>
                &quot;{project?.name}&quot; has {paymentCount} payment record
                {paymentCount === 1 ? '' : 's'} that must be kept for your pay and tax
                history, so it can&apos;t be deleted. You can archive it instead — it will be
                hidden from your active projects (under &quot;Show Archived&quot;) while all
                services and payments stay intact.
              </>
            ) : (
              <>
                Are you sure you want to delete &quot;{project?.name}&quot;?
                {serviceCount > 0 && (
                  <> This will also delete {serviceCount} associated service{serviceCount !== 1 ? 's' : ''}.</>
                )}{' '}
                This action cannot be undone.
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
            Cancel
          </Button>
          {hasPayments ? (
            <Button onClick={handleArchive} disabled={isLoading || checking}>
              {isLoading ? 'Archiving…' : 'Archive Project'}
            </Button>
          ) : (
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
