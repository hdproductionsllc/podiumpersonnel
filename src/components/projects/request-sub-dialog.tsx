'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'
import type { Service } from '@/types'

interface RequestSubDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  positionId: string
  musicianId: string
  musicianName: string
  services: Service[]
  timezone?: string
  onSuccess: () => void
}

export function RequestSubDialog({
  open,
  onOpenChange,
  positionId,
  musicianId,
  musicianName,
  services,
  timezone,
  onSuccess,
}: RequestSubDialogProps) {
  const terms = useTerms()
  const [serviceId, setServiceId] = useState<string>('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function handleSubmit() {
    setLoading(true)
    setError(null)

    const supabase = createClient()

    const { error: insertError } = await supabase.from('substitution_requests').insert({
      project_position_id: positionId,
      requesting_musician_id: musicianId,
      service_id: serviceId || null,
      reason: reason || null,
      status: 'pending_approval',
    })

    setLoading(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setServiceId('')
    setReason('')
    onOpenChange(false)
    onSuccess()
  }

  function handleClose() {
    setServiceId('')
    setReason('')
    setError(null)
    onOpenChange(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-background rounded-lg border shadow-lg w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-semibold">Request Substitute</h3>
        <p className="text-sm text-muted-foreground">
          Create a substitution request for {musicianName}.
        </p>

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{term(terms, 'session')}</label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
            >
              <option value="">All {term(terms, 'session', { plural: true, case: 'lower' })}</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({new Date(s.start_time).toLocaleDateString('en-US', { ...(timezone ? { timeZone: timezone } : {}) })})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Reason</label>
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional reason for the substitution..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Submitting...' : 'Submit Request'}
          </Button>
        </div>
      </div>
    </div>
  )
}
