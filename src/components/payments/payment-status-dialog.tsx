'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface PaymentStatusDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  paymentIds: string[]
  totalAmount: number
  onSuccess: () => void
}

export function PaymentStatusDialog({
  open,
  onOpenChange,
  paymentIds,
  totalAmount,
  onSuccess,
}: PaymentStatusDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [notes, setNotes] = useState('')

  if (!open) return null

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/payments/bulk-update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIds,
          updates: {
            status: 'paid',
            payment_date: paymentDate || null,
            payment_method: paymentMethod || null,
            payment_reference: paymentReference || null,
            notes: notes || null,
          },
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || 'Failed to update payments')
        return
      }

      toast.success(`Marked ${result.updated} payment${result.updated !== 1 ? 's' : ''} as paid`)
      onOpenChange(false)
      onSuccess()

      // Reset form
      setPaymentDate(new Date().toISOString().split('T')[0])
      setPaymentMethod('')
      setPaymentReference('')
      setNotes('')
    } catch {
      toast.error('Failed to update payments')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <h3 className="text-lg font-semibold">Mark Payments as Paid</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Recording payment for {paymentIds.length} item{paymentIds.length !== 1 ? 's' : ''} totaling {formatCurrency(totalAmount)}.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium">Payment Date</label>
            <input
              type="date"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Payment Method</label>
            <select
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="">Select method...</option>
              <option value="Zelle">Zelle</option>
              <option value="Check">Check</option>
              <option value="ACH">ACH / Direct Deposit</option>
              <option value="Venmo">Venmo</option>
              <option value="PayPal">PayPal</option>
              <option value="Cash">Cash</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Reference / Check Number</label>
            <input
              type="text"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="e.g., Check #1234 or Transaction ID"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Notes</label>
            <textarea
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              rows={2}
              placeholder="Optional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Mark as Paid'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
