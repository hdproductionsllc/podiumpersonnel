'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import type { Service } from '@/types'
import type { PositionJoined } from './project-positions'

interface GigDetailConfirmationStatus {
  id: string
  musician_id: string
  confirmed_at: string | null
  musician: {
    id: string
    first_name: string
    last_name: string
  }
}

interface SendGigDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  positions: PositionJoined[]
  services: Service[]
  organizationId: string
  timezone: string
}

export function SendGigDetailsDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  positions,
  services,
  organizationId,
  timezone,
}: SendGigDetailsDialogProps) {
  const [sending, setSending] = useState(false)
  const [sendingReminder, setSendingReminder] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendId, setSendId] = useState<string | null>(null)
  const [confirmations, setConfirmations] = useState<GigDetailConfirmationStatus[]>([])
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [notes, setNotes] = useState('')

  // Get filled positions with musicians who have emails
  const filledPositions = positions.filter(
    (p) => p.status === 'confirmed' && p.musician_id && p.musician
  )

  const musiciansWithEmail = filledPositions.filter((p) => {
    // Check if musician has email via the offers data or basic info
    return p.musician != null
  })

  const musiciansWithoutEmail = filledPositions.filter((p) => !p.musician)

  // Check for existing sends when dialog opens
  useEffect(() => {
    if (open) {
      checkExistingSends()
    }
  }, [open])

  async function checkExistingSends() {
    setLoadingStatus(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/gig-details-status`)
      if (res.ok) {
        const data = await res.json()
        if (data.sendId) {
          setSendId(data.sendId)
          setSent(true)
          setConfirmations(data.confirmations || [])
        }
      }
    } catch {
      // No existing sends — that's fine
    } finally {
      setLoadingStatus(false)
    }
  }

  async function handleSend() {
    setSending(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/send-gig-details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes.trim() || undefined }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send')
      }

      setSent(true)
      setSendId(data.sendId)
      toast.success(`Gig details sent to ${data.sent} musician${data.sent !== 1 ? 's' : ''}`)

      // Refresh status
      await checkExistingSends()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send gig details')
    } finally {
      setSending(false)
    }
  }

  async function handleSendReminder() {
    if (!sendId) return
    setSendingReminder(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/send-gig-details-reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendId }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send reminders')
      }

      toast.success(`Reminder sent to ${data.reminded} musician${data.reminded !== 1 ? 's' : ''}`)

      // Refresh status
      await checkExistingSends()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reminders')
    } finally {
      setSendingReminder(false)
    }
  }

  const confirmedCount = confirmations.filter((c) => c.confirmed_at).length
  const totalCount = confirmations.length
  const unconfirmedCount = totalCount - confirmedCount
  const allConfirmed = totalCount > 0 && confirmedCount === totalCount

  const formattedServices = services
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .map((s) => ({
      name: s.name,
      date: new Date(s.start_time).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: timezone,
      }),
      venue: s.venue || null,
    }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {sent ? 'Gig Details Status' : 'Send Gig Details'}
          </DialogTitle>
        </DialogHeader>

        {loadingStatus ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : sent ? (
          /* Status View */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {allConfirmed
                  ? 'Everyone has confirmed!'
                  : `${confirmedCount} of ${totalCount} confirmed`}
              </span>
              {allConfirmed ? (
                <Badge variant="success">All Confirmed</Badge>
              ) : (
                <Badge variant="warning">{unconfirmedCount} pending</Badge>
              )}
            </div>

            <Separator />

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {confirmations.map((conf) => (
                <div
                  key={conf.id}
                  className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30"
                >
                  <span className="text-sm font-medium">
                    {conf.musician.first_name} {conf.musician.last_name}
                  </span>
                  {conf.confirmed_at ? (
                    <Badge variant="success" className="text-xs">
                      Confirmed {new Date(conf.confirmed_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZone: timezone,
                      })}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">Pending</Badge>
                  )}
                </div>
              ))}
            </div>

            {unconfirmedCount > 0 && (
              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                <Button
                  onClick={handleSendReminder}
                  disabled={sendingReminder}
                >
                  {sendingReminder
                    ? 'Sending...'
                    : `Send Reminder to ${unconfirmedCount} Musician${unconfirmedCount !== 1 ? 's' : ''}`}
                </Button>
              </DialogFooter>
            )}

            {allConfirmed && (
              <DialogFooter>
                <Button onClick={() => onOpenChange(false)}>Done</Button>
              </DialogFooter>
            )}
          </div>
        ) : (
          /* Preview + Send View */
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Send a detailed gig email to all confirmed musicians with schedule, venue, roster, and contact info. Each musician gets a unique confirmation link.
            </p>

            <div className="bg-muted/30 rounded-lg p-4 space-y-3">
              <h4 className="font-semibold text-sm">{projectName}</h4>
              {formattedServices.map((s, i) => (
                <div key={i} className="text-sm border-l-2 border-muted-foreground/30 pl-3">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-muted-foreground">{s.date}{s.venue ? ` — ${s.venue}` : ''}</p>
                </div>
              ))}
            </div>

            <Separator />

            <div>
              <h4 className="text-sm font-semibold mb-2">
                Will be sent to {filledPositions.length} musician{filledPositions.length !== 1 ? 's' : ''}:
              </h4>
              <div className="space-y-1">
                {filledPositions.map((pos) => (
                  <div key={pos.id} className="text-sm flex items-center gap-2">
                    <span className="font-medium">
                      {pos.musician?.first_name} {pos.musician?.last_name}
                    </span>
                    <span className="text-muted-foreground">— {pos.instrument?.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <label className="text-sm font-semibold block mb-2">
                Additional Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
                placeholder="Attire, what to bring, on-site contact, special instructions..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending || filledPositions.length === 0}
              >
                {sending ? 'Sending...' : `Send to ${filledPositions.length} Musician${filledPositions.length !== 1 ? 's' : ''}`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
