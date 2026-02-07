'use client'

import { useState, useEffect, Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export type OfferJoined = {
  id: string
  project_position_id: string
  musician_id: string
  token: string
  status: string
  sent_at: string | null
  expires_at: string | null
  responded_at: string | null
  musician: { id: string; first_name: string; last_name: string; email?: string | null }
  position_instrument: string
  position_chair: number
}

type WaterfallCandidate = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  call_order: number
  is_leader: boolean
  has_conflict: boolean
}

interface ProjectOffersProps {
  offers: OfferJoined[]
  canManage: boolean
  onOfferChange: () => void
}

const OFFER_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  viewed: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  accepted: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  declined: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  expired: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

const OFFER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  viewed: 'Viewed',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
}

export function ProjectOffers({
  offers,
  canManage,
  onOfferChange,
}: ProjectOffersProps) {
  const [sendingReminder, setSendingReminder] = useState<string | null>(null)
  const [waterfallCandidates, setWaterfallCandidates] = useState<Record<string, WaterfallCandidate[]>>({})
  const [loadingWaterfall, setLoadingWaterfall] = useState<string | null>(null)
  const [sendingWaterfall, setSendingWaterfall] = useState<string | null>(null)

  // Confirmation dialog state
  const [confirmReminder, setConfirmReminder] = useState<OfferJoined | null>(null)
  const [confirmWaterfall, setConfirmWaterfall] = useState<{ positionId: string; candidate: WaterfallCandidate; offer: OfferJoined } | null>(null)

  // Find declined offers and load waterfall candidates
  const declinedOffers = offers.filter(o => o.status === 'declined')

  useEffect(() => {
    async function loadWaterfallCandidates() {
      for (const offer of declinedOffers) {
        if (!waterfallCandidates[offer.project_position_id]) {
          try {
            const response = await fetch(`/api/positions/${offer.project_position_id}/next-candidates`)
            if (response.ok) {
              const data = await response.json()
              setWaterfallCandidates(prev => ({
                ...prev,
                [offer.project_position_id]: data.candidates || []
              }))
            }
          } catch (err) {
            console.error('Failed to load waterfall candidates:', err)
          }
        }
      }
    }
    if (canManage && declinedOffers.length > 0) {
      loadWaterfallCandidates()
    }
  }, [declinedOffers.map(o => o.id).join(','), canManage])

  function handleWaterfallSend(positionId: string, candidate: WaterfallCandidate, offer: OfferJoined) {
    setConfirmWaterfall({ positionId, candidate, offer })
  }

  async function confirmWaterfallSend() {
    if (!confirmWaterfall) return
    const { positionId, candidate } = confirmWaterfall
    const musicianId = candidate.id
    setConfirmWaterfall(null)
    setSendingWaterfall(musicianId)
    try {
      const supabase = createClient()

      // Create new offer
      const { data: offerData, error } = await supabase
        .from('contract_offers')
        .insert({
          project_position_id: positionId,
          musician_id: musicianId,
          status: 'pending',
          sent_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select('id')
        .single()

      if (error) throw error

      // Update position status
      await supabase
        .from('project_positions')
        .update({ status: 'offered' })
        .eq('id', positionId)

      // Send email if offer created
      if (offerData?.id) {
        try {
          await fetch('/api/offers/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ offerId: offerData.id }),
          })
        } catch {
          // Don't fail if email fails
        }
      }

      toast.success('Offer sent to next candidate')
      onOfferChange()
    } catch (err) {
      toast.error('Failed to send offer')
    } finally {
      setSendingWaterfall(null)
    }
  }

  if (offers.length === 0) return null

  async function handleRevoke(offerId: string) {
    if (!confirm('Revoke this offer?')) return
    const supabase = createClient()
    const { error } = await supabase.from('contract_offers').delete().eq('id', offerId)
    if (error) {
      toast.error('Failed to revoke offer')
      return
    }
    onOfferChange()
  }

  function handleSendReminder(offer: OfferJoined) {
    setConfirmReminder(offer)
  }

  async function confirmSendReminder() {
    if (!confirmReminder) return
    const offerId = confirmReminder.id
    setConfirmReminder(null)
    setSendingReminder(offerId)
    try {
      const response = await fetch('/api/offers/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId }),
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || 'Failed to send reminder')
        return
      }

      toast.success('Reminder email sent')
    } catch {
      toast.error('Failed to send reminder')
    } finally {
      setSendingReminder(null)
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString()
  }

  function isExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return false
    return new Date(expiresAt) < new Date()
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">Contract Offers</h4>
      <div className="overflow-x-auto rounded-md border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-xs">Musician</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Position</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Status</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Sent</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Expires</th>
              {canManage && (
                <th className="px-3 py-2 text-right font-medium text-xs">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {(() => {
              // Count unique chairs per instrument to determine if we should show chair numbers
              const chairCountByInstrument = offers.reduce((acc, o) => {
                if (!acc[o.position_instrument]) acc[o.position_instrument] = new Set()
                acc[o.position_instrument].add(o.position_chair)
                return acc
              }, {} as Record<string, Set<number>>)

              return offers.map((offer) => {
                const expired = isExpired(offer.expires_at)
                const displayStatus = expired && (offer.status === 'pending' || offer.status === 'viewed')
                  ? 'expired'
                  : offer.status
                const hasMultipleChairs = (chairCountByInstrument[offer.position_instrument]?.size || 0) > 1
                return (
                  <Fragment key={offer.id}>
                  <tr className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      {offer.musician.first_name} {offer.musician.last_name}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {offer.position_instrument}{hasMultipleChairs ? `, Chair ${offer.position_chair}` : ''}
                    </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${OFFER_STATUS_COLORS[displayStatus] || ''}`}>
                      {OFFER_STATUS_LABELS[displayStatus] || displayStatus}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDate(offer.sent_at)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDate(offer.expires_at)}
                  </td>
                  {canManage && (
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {(offer.status === 'pending' || offer.status === 'viewed') && !expired && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSendReminder(offer)}
                            disabled={sendingReminder === offer.id}
                          >
                            {sendingReminder === offer.id ? 'Sending...' : 'Remind'}
                          </Button>
                        )}
                        {(offer.status === 'pending' || offer.status === 'viewed') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleRevoke(offer.id)}
                          >
                            Revoke
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
                {/* Waterfall suggestion for declined offers */}
                {canManage && offer.status === 'declined' && waterfallCandidates[offer.project_position_id]?.length > 0 && (
                  <tr className="bg-amber-50/50 dark:bg-amber-950/20">
                    <td colSpan={canManage ? 6 : 5} className="px-3 py-2">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-amber-700 dark:text-amber-300 font-medium">
                          Next in line:
                        </span>
                        {waterfallCandidates[offer.project_position_id].map((candidate, idx) => (
                          <div key={candidate.id} className="flex items-center gap-2">
                            {idx > 0 && <span className="text-muted-foreground">or</span>}
                            <span className={candidate.has_conflict ? 'text-muted-foreground line-through' : ''}>
                              {candidate.first_name} {candidate.last_name}
                              {candidate.is_leader && ' ★'}
                              {candidate.call_order < 100 && ` (#${candidate.call_order})`}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={sendingWaterfall === candidate.id || candidate.has_conflict}
                              onClick={() => handleWaterfallSend(offer.project_position_id, candidate, offer)}
                            >
                              {sendingWaterfall === candidate.id ? 'Sending...' : 'Send Offer'}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                  </Fragment>
                )
              })
            })()}
          </tbody>
        </table>
      </div>

      {/* Reminder Confirmation Dialog */}
      {confirmReminder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Confirm Reminder Email</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Review the reminder email that will be sent.
            </p>

            {/* Email Preview */}
            <div className="mt-4 rounded-lg border bg-white dark:bg-gray-900">
              <div className="border-b bg-muted/30 px-4 py-2">
                <p className="text-xs text-muted-foreground">To:</p>
                <p className="text-sm">{confirmReminder.musician.email || 'No email on file'}</p>
              </div>
              <div className="border-b bg-muted/30 px-4 py-2">
                <p className="text-xs text-muted-foreground">Subject:</p>
                <p className="text-sm font-medium">Reminder: Contract Offer for {confirmReminder.position_instrument}</p>
              </div>
              <div className="p-4 space-y-3 text-sm">
                <p>Dear {confirmReminder.musician.first_name} {confirmReminder.musician.last_name},</p>
                <p className="text-muted-foreground">
                  This is a friendly reminder that you have a pending contract offer for{' '}
                  <strong>{confirmReminder.position_instrument}</strong>.
                </p>
                <p className="text-muted-foreground">
                  {confirmReminder.expires_at
                    ? `This offer expires on ${new Date(confirmReminder.expires_at).toLocaleDateString()}.`
                    : 'This offer has no expiration date.'}
                </p>
                <p className="text-xs text-muted-foreground italic">
                  [A link to respond to the offer will be included]
                </p>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmReminder(null)}>
                Cancel
              </Button>
              <Button onClick={confirmSendReminder}>
                Confirm & Send Reminder
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Waterfall Send Confirmation Dialog */}
      {confirmWaterfall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Confirm Contract Offer Email</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Review the contract offer email that will be sent.
            </p>

            {/* Email Preview */}
            <div className="mt-4 rounded-lg border bg-white dark:bg-gray-900">
              <div className="border-b bg-muted/30 px-4 py-2">
                <p className="text-xs text-muted-foreground">To:</p>
                <p className="text-sm">{confirmWaterfall.candidate.email || 'No email on file'}</p>
              </div>
              <div className="border-b bg-muted/30 px-4 py-2">
                <p className="text-xs text-muted-foreground">Subject:</p>
                <p className="text-sm font-medium">Contract Offer: {confirmWaterfall.offer.position_instrument}</p>
              </div>
              <div className="p-4 space-y-3 text-sm">
                <p>Dear {confirmWaterfall.candidate.first_name} {confirmWaterfall.candidate.last_name},</p>
                <p className="text-muted-foreground">
                  We are pleased to offer you a position as{' '}
                  <strong>{confirmWaterfall.offer.position_instrument}</strong>.
                </p>
                <p className="text-muted-foreground">
                  Please review the details and respond to this offer within 7 days.
                </p>
                <p className="text-xs text-muted-foreground italic">
                  [Full project details and response link will be included]
                </p>
              </div>
            </div>

            {!confirmWaterfall.candidate.email && (
              <div className="mt-3 rounded bg-amber-100 dark:bg-amber-900/50 p-3 text-sm text-amber-700 dark:text-amber-300">
                Warning: This musician has no email on file. The offer will be created but no email will be sent.
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmWaterfall(null)}>
                Cancel
              </Button>
              <Button onClick={confirmWaterfallSend}>
                Confirm & Send Offer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
