'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'

export type SubRequestJoined = {
  id: string
  project_position_id: string
  requesting_musician_id: string
  service_id: string | null
  reason: string | null
  status: string
  substitute_musician_id: string | null
  suggested_sub_name: string | null
  suggested_sub_email: string | null
  suggested_sub_phone: string | null
  suggested_sub_instrument_id: string | null
  admin_notes: string | null
  offer_id: string | null
  requesting_musician: { id: string; first_name: string; last_name: string }
  substitute_musician: { id: string; first_name: string; last_name: string } | null
  suggested_sub_instrument: { id: string; name: string } | null
  service: { id: string; name: string; start_time: string } | null
  position_instrument: string
  position_chair: number
  position_instrument_id: string
}

interface SubRequestsProps {
  requests: SubRequestJoined[]
  timezone: string
  canManage: boolean
  onRequestChange: () => void
}

const STATUS_COLORS: Record<string, string> = {
  pending_approval: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  approved: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  declined: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  sub_declined: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  filled: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  cancelled: 'bg-gray-50 text-gray-700 dark:bg-gray-950 dark:text-gray-300',
}

const STATUS_LABELS: Record<string, string> = {
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  declined: 'Declined',
  sub_declined: 'Sub Declined',
  filled: 'Filled',
  cancelled: 'Cancelled',
}

export function SubRequests({
  requests,
  timezone,
  canManage,
  onRequestChange,
}: SubRequestsProps) {
  const router = useRouter()
  const terms = useTerms()
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [showDeclineReason, setShowDeclineReason] = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (requests.length === 0) return null

  // Track distinct chairs per instrument to decide whether to show chair number
  const chairsByInstrument: Record<string, Set<number>> = {}
  for (const req of requests) {
    const key = req.position_instrument
    if (!chairsByInstrument[key]) chairsByInstrument[key] = new Set()
    chairsByInstrument[key].add(req.position_chair)
  }

  async function handleApprove(requestId: string) {
    setProcessingId(requestId)
    setError(null)

    try {
      const response = await fetch(`/api/substitutions/${requestId}/approve`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve request')
      }

      onRequestChange()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve request')
    } finally {
      setProcessingId(null)
    }
  }

  async function handleDelete(requestId: string) {
    if (!confirm('Remove this substitution request?')) return

    setProcessingId(requestId)
    setError(null)

    try {
      const supabase = createClient()
      const { error: deleteError } = await supabase
        .from('substitution_requests')
        .delete()
        .eq('id', requestId)

      if (deleteError) throw new Error(deleteError.message)

      onRequestChange()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete request')
    } finally {
      setProcessingId(null)
    }
  }

  async function handleDecline(requestId: string) {
    setProcessingId(requestId)
    setError(null)

    try {
      const response = await fetch(`/api/substitutions/${requestId}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminNotes: declineReason || null }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to decline request')
      }

      setShowDeclineReason(null)
      setDeclineReason('')
      onRequestChange()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline request')
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">Substitution Requests</h4>

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950 p-3 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-xs">Position</th>
              <th className="px-3 py-2 text-left font-medium text-xs">{term(terms, 'person')}</th>
              <th className="px-3 py-2 text-left font-medium text-xs">{term(terms, 'session')}</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Reason</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Suggested Sub</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Status</th>
              {canManage && (
                <th className="px-3 py-2 text-right font-medium text-xs">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {requests.map((req) => (
              <tr key={req.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 text-muted-foreground">
                  {req.position_instrument}{(chairsByInstrument[req.position_instrument]?.size || 0) > 1 ? `, ${term(terms, 'rank')} ${req.position_chair}` : ''}
                </td>
                <td className="px-3 py-2">
                  {req.requesting_musician.first_name} {req.requesting_musician.last_name}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {req.service
                    ? `${req.service.name} (${new Date(req.service.start_time).toLocaleDateString('en-US', { timeZone: timezone })})`
                    : `All ${term(terms, 'session', { plural: true, case: 'lower' })}`}
                </td>
                <td className="px-3 py-2 text-muted-foreground max-w-32 truncate" title={req.reason || undefined}>
                  {req.reason || '—'}
                </td>
                <td className="px-3 py-2">
                  {req.suggested_sub_name ? (
                    <div className="space-y-0.5">
                      <div className="font-medium">{req.suggested_sub_name}</div>
                      {req.suggested_sub_email && (
                        <div className="text-xs text-muted-foreground">{req.suggested_sub_email}</div>
                      )}
                      {req.suggested_sub_phone && (
                        <div className="text-xs text-muted-foreground">{req.suggested_sub_phone}</div>
                      )}
                      {req.suggested_sub_instrument && (
                        <div className="text-xs text-blue-600 dark:text-blue-400">
                          {req.suggested_sub_instrument.name}
                        </div>
                      )}
                    </div>
                  ) : req.substitute_musician ? (
                    `${req.substitute_musician.first_name} ${req.substitute_musician.last_name}`
                  ) : (
                    <span className="text-muted-foreground italic">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[req.status] || ''}`}>
                    {STATUS_LABELS[req.status] || req.status}
                  </span>
                </td>
                {canManage && (
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {req.status === 'pending_approval' && (
                        <>
                          {showDeclineReason === req.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                placeholder="Reason (optional)"
                                value={declineReason}
                                onChange={(e) => setDeclineReason(e.target.value)}
                                className="h-7 w-32 text-xs"
                              />
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDecline(req.id)}
                                disabled={processingId === req.id}
                              >
                                {processingId === req.id ? '...' : 'Confirm'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setShowDeclineReason(null)
                                  setDeclineReason('')
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleApprove(req.id)}
                                disabled={processingId === req.id}
                              >
                                {processingId === req.id ? 'Approving...' : 'Approve'}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setShowDeclineReason(req.id)}
                                disabled={processingId === req.id}
                              >
                                Decline
                              </Button>
                            </>
                          )}
                        </>
                      )}
                      {req.status === 'approved' && !req.substitute_musician_id && (
                        <span className="text-xs text-muted-foreground">Offer sent to sub</span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(req.id)}
                        disabled={processingId === req.id}
                      >
                        Remove
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
