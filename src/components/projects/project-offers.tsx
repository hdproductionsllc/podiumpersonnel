'use client'

import { useState, useEffect, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PaymentStatusDialog } from '@/components/payments/payment-status-dialog'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'

type PositionPayment = {
  id: string
  project_position_id: string
  musician_id: string
  amount: number
  status: string
}

export type OfferJoined = {
  id: string
  project_position_id: string
  musician_id: string
  token: string
  status: string
  sent_at: string | null
  expires_at: string | null
  responded_at: string | null
  custom_pay: number | null
  personal_message: string | null
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
  conflict_reason?: string | null
}

interface ProjectOffersProps {
  offers: OfferJoined[]
  organizationName: string
  timezone: string
  canManage: boolean
  onOfferChange: () => void
  onSendWaterfall?: (positionId: string, musicianId: string, customPay: number | null, isFollowUp?: boolean) => void
}

const OFFER_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  viewed: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  accepted: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  declined: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  rescinded: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  released: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  expired: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

const OFFER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  viewed: 'Viewed',
  accepted: 'Accepted',
  declined: 'Declined',
  rescinded: 'Rescinded',
  released: 'Released',
  expired: 'Expired',
}

export function ProjectOffers({
  offers,
  organizationName,
  timezone,
  canManage,
  onOfferChange,
  onSendWaterfall,
}: ProjectOffersProps) {
  const router = useRouter()
  const terms = useTerms()
  const [sendingReminder, setSendingReminder] = useState<string | null>(null)
  const [waterfallCandidates, setWaterfallCandidates] = useState<Record<string, WaterfallCandidate[]>>({})
  const [loadingWaterfall, setLoadingWaterfall] = useState<string | null>(null)
  const [sendingWaterfall, setSendingWaterfall] = useState<string | null>(null)
  const [showExpiredSummary, setShowExpiredSummary] = useState(false)
  const [selectedExpired, setSelectedExpired] = useState<Set<string>>(new Set())
  const [sendingFollowUp, setSendingFollowUp] = useState(false)

  // Payment tracking state
  const [payments, setPayments] = useState<PositionPayment[]>([])
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payDialogIds, setPayDialogIds] = useState<string[]>([])
  const [payDialogAmount, setPayDialogAmount] = useState(0)

  // Fetch payments for accepted offers' positions
  const acceptedPositionIds = offers
    .filter((o) => o.status === 'accepted')
    .map((o) => o.project_position_id)

  useEffect(() => {
    if (acceptedPositionIds.length === 0) return
    async function loadPayments() {
      const supabase = createClient()
      const { data } = await supabase
        .from('payments')
        .select('id, project_position_id, musician_id, amount, status')
        .in('project_position_id', acceptedPositionIds)
      setPayments(data || [])
    }
    loadPayments()
  }, [acceptedPositionIds.join(',')])

  function getPaymentForPosition(positionId: string): PositionPayment | undefined {
    return payments.find((p) => p.project_position_id === positionId)
  }

  async function handleMarkPaid(offer: OfferJoined) {
    const payment = getPaymentForPosition(offer.project_position_id)
    if (payment) {
      // Payment exists — open the dialog with this payment ID
      setPayDialogIds([payment.id])
      setPayDialogAmount(payment.amount)
      setPayDialogOpen(true)
    } else {
      // No payment record yet — generate one first
      try {
        // Get project ID from any position
        const supabase = createClient()
        const { data: position } = await supabase
          .from('project_positions')
          .select('project_id')
          .eq('id', offer.project_position_id)
          .single()
        if (!position) {
          toast.error('Could not find position')
          return
        }
        const response = await fetch('/api/payments/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: position.project_id }),
        })
        if (!response.ok) {
          toast.error('Failed to generate payment record')
          return
        }
        // Re-fetch payments to get the new one
        const { data: updatedPayments } = await supabase
          .from('payments')
          .select('id, project_position_id, musician_id, amount, status')
          .in('project_position_id', acceptedPositionIds)
        setPayments(updatedPayments || [])
        const newPayment = (updatedPayments || []).find(
          (p) => p.project_position_id === offer.project_position_id
        )
        if (newPayment) {
          setPayDialogIds([newPayment.id])
          setPayDialogAmount(newPayment.amount)
          setPayDialogOpen(true)
        } else {
          toast.error('Payment record not found after generation')
        }
      } catch {
        toast.error('Failed to generate payment')
      }
    }
  }

  // Confirmation dialog state
  const [confirmReminder, setConfirmReminder] = useState<OfferJoined | null>(null)
  const [confirmWaterfall, setConfirmWaterfall] = useState<{ positionId: string; candidate: WaterfallCandidate; offer: OfferJoined } | null>(null)

  // Find declined/expired offers and load waterfall candidates
  const waterfallOffers = offers.filter(o => o.status === 'declined' || o.status === 'expired')

  useEffect(() => {
    async function loadWaterfallCandidates() {
      for (const offer of waterfallOffers) {
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
    if (canManage && waterfallOffers.length > 0) {
      loadWaterfallCandidates()
    }
  }, [waterfallOffers.map(o => o.id).join(','), canManage])

  function handleWaterfallSend(positionId: string, candidate: WaterfallCandidate, offer: OfferJoined) {
    if (onSendWaterfall) {
      // Route through the full SendOfferDialog for review/editing
      onSendWaterfall(positionId, candidate.id, offer.custom_pay)
    } else {
      // Fallback to inline confirmation
      setConfirmWaterfall({ positionId, candidate, offer })
    }
  }

  async function confirmWaterfallSend() {
    if (!confirmWaterfall) return
    const { positionId, candidate } = confirmWaterfall
    const musicianId = candidate.id
    setConfirmWaterfall(null)
    setSendingWaterfall(musicianId)
    try {
      const supabase = createClient()

      // Check if musician already has an active offer for another position in this project
      const { data: position } = await supabase
        .from('project_positions')
        .select('project_id')
        .eq('id', positionId)
        .single()

      if (position) {
        const { data: projectPositions } = await supabase
          .from('project_positions')
          .select('id')
          .eq('project_id', position.project_id)

        const allPosIds = (projectPositions || []).map(p => p.id)
        const { data: existingOffers } = await supabase
          .from('contract_offers')
          .select('id')
          .eq('musician_id', musicianId)
          .in('project_position_id', allPosIds)
          .in('status', ['pending', 'viewed', 'accepted'])
          .limit(1)

        if (existingOffers && existingOffers.length > 0) {
          toast.error(`${candidate.first_name} ${candidate.last_name} already has an active offer for another position in this ${term(terms, 'work', { case: 'lower' })}.`)
          setSendingWaterfall(null)
          return
        }
      }

      // Create new offer, carrying forward payment from the declined offer
      const { data: offerData, error } = await supabase
        .from('contract_offers')
        .insert({
          project_position_id: positionId,
          musician_id: musicianId,
          status: 'pending',
          sent_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          custom_pay: confirmWaterfall.offer.custom_pay ?? null,
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
            body: JSON.stringify({
              offerId: offerData.id,
              includeLeaderFee: false,
              leaderFeeAmount: 0,
            }),
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
    return new Date(dateStr).toLocaleDateString('en-US', { timeZone: timezone })
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
              <th className="px-3 py-2 text-left font-medium text-xs">{term(terms, 'person')}</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Position</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Status</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Pay</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Sent</th>
              <th className="px-3 py-2 text-left font-medium text-xs">Expires</th>
              {canManage && (
                <th className="px-3 py-2 text-center font-medium text-xs">Paid</th>
              )}
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
                      {offer.position_instrument}{hasMultipleChairs ? `, ${term(terms, 'rank')} ${offer.position_chair}` : ''}
                    </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${OFFER_STATUS_COLORS[displayStatus] || ''}`}>
                      {OFFER_STATUS_LABELS[displayStatus] || displayStatus}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">
                    {offer.custom_pay != null ? `$${offer.custom_pay}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDate(offer.sent_at)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDate(offer.expires_at)}
                  </td>
                  {canManage && (
                    <td className="px-3 py-2 text-center">
                      {offer.status === 'accepted' ? (() => {
                        const payment = getPaymentForPosition(offer.project_position_id)
                        if (payment?.status === 'paid') {
                          return (
                            <svg className="h-5 w-5 text-green-600 dark:text-green-400 mx-auto" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                          )
                        }
                        return (
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-md border border-dashed border-gray-300 dark:border-gray-600 h-6 w-6 hover:bg-muted/50 hover:border-primary/50 transition-colors mx-auto"
                            title="Mark as paid"
                            onClick={() => handleMarkPaid(offer)}
                          >
                            <svg className="h-3.5 w-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                          </button>
                        )
                      })() : '—'}
                    </td>
                  )}
                  {canManage && (
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(`/gig/${offer.token}`, '_blank')}
                          title={`View offer as ${term(terms, 'person', { case: 'lower' })} sees it`}
                        >
                          View
                        </Button>
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
                        {(offer.status === 'expired' || displayStatus === 'expired') && onSendWaterfall && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onSendWaterfall(offer.project_position_id, offer.musician_id, offer.custom_pay, true)}
                            title="Send this musician a new offer with a fresh link and deadline"
                          >
                            Re-offer
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
                {/* Waterfall suggestion for declined/expired offers */}
                {canManage && (offer.status === 'declined' || offer.status === 'expired' || displayStatus === 'expired') && waterfallCandidates[offer.project_position_id]?.length > 0 && (
                  <tr className="bg-amber-50/50 dark:bg-amber-950/20">
                    <td colSpan={canManage ? 9 : 7} className="px-3 py-2">
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-amber-700 dark:text-amber-300 font-medium">
                          Next in line:
                        </span>
                        {waterfallCandidates[offer.project_position_id].map((candidate, idx) => (
                          <div key={candidate.id} className="flex items-center gap-2">
                            {idx > 0 && <span className="text-muted-foreground">or</span>}
                            <span
                              className={candidate.has_conflict ? 'text-muted-foreground line-through' : ''}
                              title={candidate.conflict_reason || undefined}
                            >
                              {candidate.first_name} {candidate.last_name}
                              {candidate.is_leader && ' ★'}
                              {candidate.call_order != null && ` (#${candidate.call_order})`}
                            </span>
                            {candidate.has_conflict && candidate.conflict_reason && (
                              <span className="text-xs text-red-600 dark:text-red-400">
                                {candidate.conflict_reason}
                              </span>
                            )}
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

      {/* Expired Offers Summary */}
      {canManage && (() => {
        const expiredOffers = offers.filter(o => o.status === 'expired' || (isExpired(o.expires_at) && (o.status === 'pending' || o.status === 'viewed')))
        if (expiredOffers.length === 0) return null

        // Group by musician (deduplicate — a musician may have expired on multiple positions)
        const byMusician = new Map<string, { musician: OfferJoined['musician']; offers: OfferJoined[] }>()
        for (const offer of expiredOffers) {
          const existing = byMusician.get(offer.musician_id)
          if (existing) {
            existing.offers.push(offer)
          } else {
            byMusician.set(offer.musician_id, { musician: offer.musician, offers: [offer] })
          }
        }

        const allSelected = selectedExpired.size === byMusician.size && byMusician.size > 0
        const someSelected = selectedExpired.size > 0

        function toggleAll() {
          if (allSelected) {
            setSelectedExpired(new Set())
          } else {
            setSelectedExpired(new Set(byMusician.keys()))
          }
        }

        function toggleOne(musicianId: string) {
          setSelectedExpired(prev => {
            const next = new Set(prev)
            if (next.has(musicianId)) {
              next.delete(musicianId)
            } else {
              next.add(musicianId)
            }
            return next
          })
        }

        async function handleBatchFollowUp() {
          if (selectedExpired.size === 0) return
          setSendingFollowUp(true)
          let sent = 0
          let failed = 0

          for (const musicianId of selectedExpired) {
            const entry = byMusician.get(musicianId)
            if (!entry) continue

            // Follow up: create a new offer for each expired position
            for (const expiredOffer of entry.offers) {
              try {
                if (onSendWaterfall) {
                  onSendWaterfall(expiredOffer.project_position_id, musicianId, expiredOffer.custom_pay, true)
                  sent++
                  break // Open dialog for the first one — user can review
                }
              } catch {
                failed++
              }
            }
          }

          setSendingFollowUp(false)
          if (sent > 0) {
            setSelectedExpired(new Set())
          }
        }

        return (
          <div className="mt-3">
            <button
              type="button"
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowExpiredSummary(!showExpiredSummary)}
            >
              <svg
                className={`h-4 w-4 transition-transform ${showExpiredSummary ? 'rotate-90' : ''}`}
                fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
              Expired Offers ({expiredOffers.length})
              <span className="text-xs text-muted-foreground font-normal">
                — {byMusician.size} {term(terms, 'person', { plural: byMusician.size !== 1, case: 'lower' })} didn&apos;t respond
              </span>
            </button>

            {showExpiredSummary && (
              <div className="mt-2 rounded-md border bg-background">
                {/* Header with batch actions */}
                <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="rounded border-gray-300"
                    />
                    Select all
                  </label>
                  {someSelected && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={sendingFollowUp}
                      onClick={handleBatchFollowUp}
                    >
                      {sendingFollowUp ? 'Sending...' : `Re-offer ${selectedExpired.size} selected`}
                    </Button>
                  )}
                </div>

                {/* Musician list */}
                <div className="divide-y">
                  {Array.from(byMusician.entries()).map(([musicianId, { musician, offers: mOffers }]) => (
                    <div key={musicianId} className="flex items-center justify-between px-3 py-2 hover:bg-muted/30">
                      <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedExpired.has(musicianId)}
                          onChange={() => toggleOne(musicianId)}
                          className="rounded border-gray-300 shrink-0"
                        />
                        <div className="min-w-0">
                          <span className="text-sm font-medium">
                            {musician.first_name} {musician.last_name}
                          </span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {mOffers.map(o => o.position_instrument).join(', ')}
                          </span>
                          <div className="text-xs text-muted-foreground">
                            Expired {mOffers.map(o => formatDate(o.expires_at)).join(', ')}
                            {musician.email && (
                              <span className="ml-2">{musician.email}</span>
                            )}
                          </div>
                        </div>
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs shrink-0"
                        onClick={() => {
                          if (onSendWaterfall) {
                            onSendWaterfall(mOffers[0].project_position_id, musicianId, mOffers[0].custom_pay, true)
                          }
                        }}
                      >
                        Re-offer
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}

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
                    ? `This offer expires on ${new Date(confirmReminder.expires_at).toLocaleDateString('en-US', { timeZone: timezone })}.`
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
                  You have been called to perform with{' '}
                  <strong>{organizationName}</strong> for the following {term(terms, 'work', { case: 'lower' })}:
                </p>
                <p className="text-xs text-muted-foreground italic">
                  [Full {term(terms, 'work', { case: 'lower' })} details and response link will be included]
                </p>
              </div>
            </div>

            {!confirmWaterfall.candidate.email && (
              <div className="mt-3 rounded bg-amber-100 dark:bg-amber-900/50 p-3 text-sm text-amber-700 dark:text-amber-300">
                Warning: This {term(terms, 'person', { case: 'lower' })} has no email on file. The offer will be created but no email will be sent.
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

      {/* Payment Status Dialog */}
      <PaymentStatusDialog
        open={payDialogOpen}
        onOpenChange={setPayDialogOpen}
        paymentIds={payDialogIds}
        totalAmount={payDialogAmount}
        onSuccess={() => {
          // Refresh payment data
          const supabase = createClient()
          supabase
            .from('payments')
            .select('id, project_position_id, musician_id, amount, status')
            .in('project_position_id', acceptedPositionIds)
            .then(({ data }) => setPayments(data || []))
          router.refresh()
        }}
      />
    </div>
  )
}
