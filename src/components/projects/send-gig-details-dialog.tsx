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

interface ServiceWithVenue extends Service {
  venue_details?: {
    name: string
    address?: string | null
    city?: string | null
    state?: string | null
    zip?: string | null
    parking_info?: string | null
    directions?: string | null
  } | null
}

interface SendGigDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  positions: PositionJoined[]
  services: ServiceWithVenue[]
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
  const [showConfirmSend, setShowConfirmSend] = useState(false)

  // Get filled positions with musicians who have emails
  const filledPositions = positions.filter(
    (p) => p.status === 'confirmed' && p.musician_id && p.musician
  )

  // Check for existing sends when dialog opens
  useEffect(() => {
    if (open) {
      checkExistingSends()
      setShowConfirmSend(false)
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

      if (data.skipped > 0) {
        toast.success(`Reminder sent to ${data.reminded} of ${data.total} musicians (${data.skipped} failed — may be missing email)`)
      } else {
        toast.success(`Reminder sent to ${data.reminded} musician${data.reminded !== 1 ? 's' : ''}`)
      }

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

  // Build venue display string (matching what the email will show)
  function getVenueDisplay(service: ServiceWithVenue): string | null {
    if (service.venue_details) {
      const v = service.venue_details
      return [v.name, v.address, v.city, v.state, v.zip].filter(Boolean).join(', ')
    }
    return service.venue || null
  }

  const formattedServices = services
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .map((s) => ({
      name: s.name,
      date: new Date(s.start_time).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: timezone,
      }),
      callTime: s.call_time
        ? new Date(s.call_time).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: timezone,
          })
        : null,
      startTime: new Date(s.start_time).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: timezone,
      }),
      endTime: s.end_time
        ? new Date(s.end_time).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: timezone,
          })
        : null,
      venue: getVenueDisplay(s),
      parkingInfo: s.venue_details?.parking_info || null,
      directions: s.venue_details?.directions || null,
    }))

  // Sort roster by instrument then chair number (matching the email)
  const sortedRoster = [...filledPositions].sort((a, b) => {
    const instrA = a.instrument?.name || ''
    const instrB = b.instrument?.name || ''
    if (instrA !== instrB) return instrA.localeCompare(instrB)
    return (a.chair_number || 0) - (b.chair_number || 0)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {sent ? 'Gig Details Status' : showConfirmSend ? 'Confirm & Send' : 'Email Preview — Gig Details'}
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
        ) : showConfirmSend ? (
          /* Confirm Send Step */
          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                You are about to send a gig details email to {filledPositions.length} musician{filledPositions.length !== 1 ? 's' : ''}.
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Each musician will receive the full schedule, venue details, roster with contact info, and a confirmation link.
                {notes.trim() ? ' Your additional notes will also be included.' : ''}
              </p>
            </div>

            <div className="space-y-1">
              <h4 className="text-sm font-semibold mb-2">Recipients:</h4>
              {sortedRoster.map((pos) => (
                <div key={pos.id} className="text-sm flex items-center gap-2 py-1">
                  <span className="font-medium">
                    {pos.musician?.first_name} {pos.musician?.last_name}
                  </span>
                  <span className="text-muted-foreground">— {pos.instrument?.name}</span>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConfirmSend(false)}>
                Back to Preview
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending}
              >
                {sending ? 'Sending...' : `Send Now to ${filledPositions.length} Musician${filledPositions.length !== 1 ? 's' : ''}`}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* Preview View */
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Preview what each musician will receive. Review all details below, add any notes, then proceed to send.
            </p>

            {/* Email Preview Card */}
            <div className="border rounded-lg overflow-hidden">
              {/* Email header */}
              <div className="bg-primary/10 px-4 py-3">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Email Subject</p>
                <p className="text-sm font-semibold">Gig Details — {projectName}</p>
              </div>

              <div className="p-4 space-y-4">
                {/* Schedule Section */}
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <span className="inline-block w-1 h-4 bg-primary rounded-full" />
                    Schedule
                  </h4>
                  <div className="space-y-3">
                    {formattedServices.map((s, i) => (
                      <div key={i} className="bg-muted/40 rounded-lg p-3 space-y-1.5">
                        <p className="text-sm font-semibold">{s.name}</p>
                        <p className="text-sm text-muted-foreground">{s.date}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                          {s.callTime && (
                            <span className="text-muted-foreground">
                              <span className="font-medium text-foreground">Call:</span> {s.callTime}
                            </span>
                          )}
                          <span className="text-muted-foreground">
                            <span className="font-medium text-foreground">Start:</span> {s.startTime}
                          </span>
                          {s.endTime && (
                            <span className="text-muted-foreground">
                              <span className="font-medium text-foreground">End:</span> {s.endTime}
                            </span>
                          )}
                        </div>
                        {s.venue && (
                          <p className="text-sm">
                            <span className="font-medium">Venue:</span>{' '}
                            <span className="text-muted-foreground">{s.venue}</span>
                          </p>
                        )}
                        {s.parkingInfo && (
                          <p className="text-sm">
                            <span className="font-medium">Parking:</span>{' '}
                            <span className="text-muted-foreground">{s.parkingInfo}</span>
                          </p>
                        )}
                        {s.directions && (
                          <p className="text-sm">
                            <span className="font-medium">Access:</span>{' '}
                            <span className="text-muted-foreground">{s.directions}</span>
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Roster Section */}
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <span className="inline-block w-1 h-4 bg-primary rounded-full" />
                    Ensemble Roster
                  </h4>
                  <div className="space-y-1.5">
                    {sortedRoster.map((pos) => (
                      <div key={pos.id} className="flex items-center justify-between py-1.5 px-3 rounded-md bg-muted/30 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {pos.musician?.first_name} {pos.musician?.last_name}
                          </span>
                          <span className="text-muted-foreground">— {pos.instrument?.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {pos.musician?.phone ? 'Email + Phone' : 'Email only'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Each musician&apos;s email and phone number will be shown in the roster so they can contact each other.
                  </p>
                </div>

                <Separator />

                {/* Notes Section */}
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <span className="inline-block w-1 h-4 bg-primary rounded-full" />
                    Additional Notes
                    <span className="font-normal text-muted-foreground text-xs">(optional)</span>
                  </h4>
                  <textarea
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[120px] resize-y"
                    placeholder="Attire, what to bring, on-site contact, special instructions, repertoire notes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                {/* Confirmation note */}
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3">
                  <p className="text-xs text-green-700 dark:text-green-300">
                    Each musician will also see a &quot;I&apos;ve Read All Details&quot; confirmation button. You can track who has confirmed from this dialog.
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => setShowConfirmSend(true)}
                disabled={filledPositions.length === 0}
              >
                Review & Send to {filledPositions.length} Musician{filledPositions.length !== 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
