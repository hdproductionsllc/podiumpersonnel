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
import { useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'
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
  const terms = useTerms()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentCount, setPaymentCount] = useState<number | null>(null)
  const [checking, setChecking] = useState(false)

  // When the dialog opens, check whether this musician has any payment history.
  // If they do, we must never hard-delete (it would erase 1099/tax records) —
  // we deactivate instead, which keeps the history but removes them from staffing.
  useEffect(() => {
    if (!open || !musician) {
      setPaymentCount(null)
      setError(null)
      return
    }
    let cancelled = false
    setChecking(true)
    const supabase = createClient()
    supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('musician_id', musician.id)
      .then(({ count, error: countError }) => {
        if (cancelled) return
        if (countError) setError(countError.message)
        else setPaymentCount(count ?? 0)
        setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, musician])

  const hasPayments = (paymentCount ?? 0) > 0

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
      // The DB also enforces this via ON DELETE RESTRICT on payments — surface
      // a human-readable message instead of a raw constraint violation.
      const friendly = /foreign key|violates|constraint/i.test(deleteError.message)
        ? `This ${term(terms, 'person', { case: 'lower' })} has linked records (e.g. payments) and cannot be deleted. Deactivate them instead to preserve history.`
        : deleteError.message
      setError(friendly)
      setIsLoading(false)
      return
    }

    setIsLoading(false)
    onSuccess()
  }

  async function handleDeactivate() {
    if (!musician) return
    setIsLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('musicians')
      .update({ is_active: false })
      .eq('id', musician.id)

    if (updateError) {
      setError(updateError.message)
      setIsLoading(false)
      return
    }

    setIsLoading(false)
    onSuccess()
  }

  const name = `${musician?.first_name ?? ''} ${musician?.last_name ?? ''}`.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {hasPayments ? `Deactivate ${term(terms, 'person')}` : `Delete ${term(terms, 'person')}`}
          </DialogTitle>
          <DialogDescription>
            {checking ? (
              <>Checking {name}&apos;s records…</>
            ) : hasPayments ? (
              <>
                {name} has {paymentCount} payment record{paymentCount === 1 ? '' : 's'} that
                must be kept for your pay and tax (1099) history, so they can&apos;t be deleted.
                You can deactivate them instead — they&apos;ll be hidden from staffing and
                rosters, but all their history stays intact. You can reactivate them anytime
                from their profile.
              </>
            ) : (
              <>
                Are you sure you want to delete {name}? This action cannot be undone.
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
            <Button onClick={handleDeactivate} disabled={isLoading || checking}>
              {isLoading ? 'Deactivating…' : 'Deactivate'}
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
