'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

export type MusicianScheduleEntry = {
  id: string
  title: string
  start_time: string
  end_time: string
}

export type MusicianForOffer = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  musician_instruments: { instrument_id: string }[]
  competing_schedules: MusicianScheduleEntry[]
  zip_code?: string | null
  service_radius_miles?: number | null
  call_order?: number
  is_leader?: boolean
}

interface SendOfferDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  positionId: string
  instrumentId: string
  chairNumber: number
  musicians: MusicianForOffer[]
  existingOfferMusicianIds: string[]
  basePay?: number | null
  leaderFee?: number | null
  onSuccess: () => void
}

export function SendOfferDialog({
  open,
  onOpenChange,
  positionId,
  instrumentId,
  chairNumber,
  musicians,
  existingOfferMusicianIds,
  basePay,
  leaderFee,
  onSuccess,
}: SendOfferDialogProps) {
  const [selectedMusicianId, setSelectedMusicianId] = useState('')
  const [expiresIn, setExpiresIn] = useState<string>('7')
  const [sendEmail, setSendEmail] = useState(true)
  const [customPay, setCustomPay] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get selected musician's email status
  const selectedMusician = musicians.find((m) => m.id === selectedMusicianId)
  const hasEmail = selectedMusician?.email ? true : false

  // Calculate pay - chair 1 gets leader fee
  const isLeaderPosition = chairNumber === 1
  const calculatedPay = basePay != null
    ? basePay + (isLeaderPosition && leaderFee ? leaderFee : 0)
    : null
  const finalPay = customPay ? parseFloat(customPay) : calculatedPay

  if (!open) return null

  // Filter musicians who play this instrument and don't already have an offer
  // Sort by: leaders first (for chair 1), then by call_order
  const availableMusicians = musicians
    .filter(
      (m) =>
        m.musician_instruments.some((mi) => mi.instrument_id === instrumentId) &&
        !existingOfferMusicianIds.includes(m.id)
    )
    .sort((a, b) => {
      // For chair 1, prioritize leaders
      if (isLeaderPosition) {
        if (a.is_leader && !b.is_leader) return -1
        if (!a.is_leader && b.is_leader) return 1
      }
      // Then sort by call order
      return (a.call_order ?? 100) - (b.call_order ?? 100)
    })

  async function handleSend() {
    if (!selectedMusicianId) return

    setLoading(true)
    setError(null)

    const supabase = createClient()

    const expiresAt = expiresIn
      ? new Date(Date.now() + parseInt(expiresIn) * 24 * 60 * 60 * 1000).toISOString()
      : null

    const { data: offerData, error: insertError } = await supabase
      .from('contract_offers')
      .insert({
        project_position_id: positionId,
        musician_id: selectedMusicianId,
        status: 'pending',
        sent_at: new Date().toISOString(),
        expires_at: expiresAt,
        custom_pay: customPay ? parseFloat(customPay) : null,
      })
      .select('id')
      .single()

    if (insertError) {
      setLoading(false)
      setError(insertError.message)
      return
    }

    // Update position status to offered
    await supabase
      .from('project_positions')
      .update({ status: 'offered' })
      .eq('id', positionId)

    // Send email notification if enabled and musician has email
    if (sendEmail && hasEmail && offerData?.id) {
      try {
        const response = await fetch('/api/offers/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offerId: offerData.id }),
        })

        if (!response.ok) {
          const result = await response.json()
          console.warn('Failed to send email:', result.error)
          // Don't block on email failure, offer is already created
        }
      } catch (emailError) {
        console.warn('Failed to send email:', emailError)
        // Don't block on email failure
      }
    }

    setLoading(false)
    setSelectedMusicianId('')
    onOpenChange(false)
    onSuccess()
  }

  function handleClose() {
    setSelectedMusicianId('')
    setCustomPay('')
    setError(null)
    onOpenChange(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-background rounded-lg border shadow-lg w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-semibold">Send Contract Offer</h3>
        <p className="text-sm text-muted-foreground">
          Select a musician to send an offer for this position.
        </p>

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Musician</label>
            {availableMusicians.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No available musicians for this instrument.
              </p>
            ) : (
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={selectedMusicianId}
                onChange={(e) => setSelectedMusicianId(e.target.value)}
              >
                <option value="">Select a musician...</option>
                {availableMusicians.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.last_name}, {m.first_name}
                    {m.call_order && m.call_order < 100 ? ` (#${m.call_order})` : ''}
                    {m.is_leader ? ' ★' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Expires in (days)</label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value)}
            >
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="">No expiration</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Pay</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={calculatedPay != null ? calculatedPay.toString() : 'Enter amount'}
                value={customPay}
                onChange={(e) => setCustomPay(e.target.value)}
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            {calculatedPay != null && (
              <p className="text-xs text-muted-foreground">
                Default: ${basePay}{isLeaderPosition && leaderFee ? ` + $${leaderFee} leader fee` : ''} = ${calculatedPay}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="sendEmail"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              disabled={!hasEmail}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="sendEmail" className="text-sm">
              Send email notification
            </label>
            {selectedMusicianId && !hasEmail && (
              <span className="text-xs text-amber-600">(No email on file)</span>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!selectedMusicianId || loading}>
            {loading ? 'Sending...' : 'Send Offer'}
          </Button>
        </div>
      </div>
    </div>
  )
}
