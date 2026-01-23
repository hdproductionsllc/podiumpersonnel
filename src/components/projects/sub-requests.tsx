'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import type { MusicianForOffer } from './send-offer-dialog'

export type SubRequestJoined = {
  id: string
  project_position_id: string
  requesting_musician_id: string
  service_id: string | null
  reason: string | null
  status: string
  substitute_musician_id: string | null
  requesting_musician: { id: string; first_name: string; last_name: string }
  substitute_musician: { id: string; first_name: string; last_name: string } | null
  service: { id: string; name: string; start_time: string } | null
  position_instrument: string
  position_chair: number
  position_instrument_id: string
}

interface SubRequestsProps {
  requests: SubRequestJoined[]
  musicians: MusicianForOffer[]
  canManage: boolean
  onRequestChange: () => void
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  approved: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  denied: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  filled: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
  filled: 'Filled',
}

export function SubRequests({
  requests,
  musicians,
  canManage,
  onRequestChange,
}: SubRequestsProps) {
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [selectedSubId, setSelectedSubId] = useState('')

  if (requests.length === 0) return null

  async function handleApprove(requestId: string) {
    const supabase = createClient()
    await supabase
      .from('substitution_requests')
      .update({ status: 'approved' })
      .eq('id', requestId)
    onRequestChange()
  }

  async function handleDeny(requestId: string) {
    const supabase = createClient()
    await supabase
      .from('substitution_requests')
      .update({ status: 'denied' })
      .eq('id', requestId)
    onRequestChange()
  }

  async function handleAssignSub(requestId: string) {
    if (!selectedSubId) return
    const supabase = createClient()
    await supabase
      .from('substitution_requests')
      .update({
        substitute_musician_id: selectedSubId,
        status: 'filled',
      })
      .eq('id', requestId)
    setAssigningId(null)
    setSelectedSubId('')
    onRequestChange()
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">Substitution Requests</h4>
      <div className="rounded-md border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-xs">Position</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Musician</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Service</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Reason</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Status</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Substitute</th>
              {canManage && (
                <th className="px-3 py-2 text-right font-medium text-xs">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {requests.map((req) => (
              <tr key={req.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 text-muted-foreground">
                  {req.position_instrument} {req.position_chair}
                </td>
                <td className="px-3 py-2">
                  {req.requesting_musician.first_name} {req.requesting_musician.last_name}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {req.service
                    ? `${req.service.name} (${new Date(req.service.start_time).toLocaleDateString()})`
                    : 'All services'}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {req.reason || '—'}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[req.status] || ''}`}>
                    {STATUS_LABELS[req.status] || req.status}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {assigningId === req.id ? (
                    <div className="flex items-center gap-1">
                      <select
                        className="rounded border bg-background px-2 py-0.5 text-xs w-32"
                        value={selectedSubId}
                        onChange={(e) => setSelectedSubId(e.target.value)}
                      >
                        <option value="">Select...</option>
                        {musicians
                          .filter((m) =>
                            m.musician_instruments.some((mi) => mi.instrument_id === req.position_instrument_id) &&
                            m.id !== req.requesting_musician_id
                          )
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.last_name}, {m.first_name}
                            </option>
                          ))}
                      </select>
                      <Button size="sm" variant="ghost" onClick={() => handleAssignSub(req.id)} disabled={!selectedSubId}>
                        OK
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setAssigningId(null); setSelectedSubId('') }}>
                        X
                      </Button>
                    </div>
                  ) : req.substitute_musician ? (
                    `${req.substitute_musician.first_name} ${req.substitute_musician.last_name}`
                  ) : (
                    <span className="text-muted-foreground italic">—</span>
                  )}
                </td>
                {canManage && (
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {req.status === 'pending' && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => handleApprove(req.id)}>
                            Approve
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeny(req.id)}
                          >
                            Deny
                          </Button>
                        </>
                      )}
                      {(req.status === 'approved' || req.status === 'pending') && !req.substitute_musician_id && (
                        <Button variant="ghost" size="sm" onClick={() => setAssigningId(req.id)}>
                          Assign Sub
                        </Button>
                      )}
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
