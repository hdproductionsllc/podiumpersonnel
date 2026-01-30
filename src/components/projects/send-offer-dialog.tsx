'use client'

import { useState, useEffect } from 'react'
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
  suggestedCustomPay?: string
  onSuccess: (applyPayToRemaining?: { customPay: string }) => void
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
  suggestedCustomPay,
  onSuccess,
}: SendOfferDialogProps) {
  const [selectedMusicianId, setSelectedMusicianId] = useState('')
  const [expiresIn, setExpiresIn] = useState<string>('2')
  const [customDeadline, setCustomDeadline] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [customPay, setCustomPay] = useState<string>(suggestedCustomPay || '200')
  const [applyToRemaining, setApplyToRemaining] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize customPay from suggestedCustomPay when dialog opens, default to 200
  useEffect(() => {
    if (open) {
      setCustomPay(suggestedCustomPay || '200')
    }
  }, [open, suggestedCustomPay])

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

    let expiresAt: string | null = null
    if (expiresIn === '0.17') {
      // ASAP = 4 hours
      expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
    } else if (expiresIn === 'custom') {
      expiresAt = customDeadline ? new Date(customDeadline + 'T23:59:59').toISOString() : null
    } else if (expiresIn) {
      expiresAt = new Date(Date.now() + parseInt(expiresIn) * 24 * 60 * 60 * 1000).toISOString()
    }

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

    // Pass pay info to parent if "apply to remaining" is checked
    if (applyToRemaining && customPay) {
      onSuccess({ customPay })
    } else {
      onSuccess()
    }
  }

  function handleClose() {
    setSelectedMusicianId('')
    setCustomPay('')
    setApplyToRemaining(false)
    setShowConfirmation(false)
    setError(null)
    onOpenChange(false)
  }

  function handleProceedToConfirm() {
    if (!selectedMusicianId) return
    setShowConfirmation(true)
  }

  function handleBackToForm() {
    setShowConfirmation(false)
  }

  const formView = (
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
              <>
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
                      {!m.email ? ' ⚠ No email' : ''}
                    </option>
                  ))}
                </select>
                {selectedMusicianId && !hasEmail && (
                  <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200">
                    <strong>Warning:</strong> This musician has no email address on file.
                    The offer will be created but no notification will be sent.
                    You will need to contact them manually.
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Response deadline</label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value)}
            >
              <option value="0.17">ASAP (4 hours)</option>
              <option value="1">24 hours</option>
              <option value="2">48 hours (recommended)</option>
              <option value="7">1 week</option>
              <option value="custom">Custom date</option>
              <option value="">No expiration</option>
            </select>
            {expiresIn === 'custom' && (
              <input
                type="date"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm mt-2"
                value={customDeadline}
                onChange={(e) => setCustomDeadline(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Pay <span className="text-destructive">*</span></label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                placeholder={calculatedPay != null ? calculatedPay.toString() : 'Enter amount'}
                value={customPay}
                onChange={(e) => setCustomPay(e.target.value)}
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            {calculatedPay != null && (
              <div className="rounded-md bg-muted/50 p-2 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base pay:</span>
                  <span>${basePay}</span>
                </div>
                {isLeaderPosition && leaderFee ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Leader fee (Chair 1):</span>
                      <span>+${leaderFee}</span>
                    </div>
                    <div className="flex justify-between font-medium border-t pt-1">
                      <span>Total (includes leader fee):</span>
                      <span>${calculatedPay}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-muted-foreground">
                    <span>No leader fee (Chair {chairNumber})</span>
                    <span>Total: ${calculatedPay}</span>
                  </div>
                )}
              </div>
            )}
            {customPay && (
              <p className="text-xs text-amber-600">
                Custom pay: ${customPay} {isLeaderPosition ? '(overrides calculated total)' : ''}
              </p>
            )}

            {customPay && (
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="applyToRemaining"
                  checked={applyToRemaining}
                  onChange={(e) => setApplyToRemaining(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="applyToRemaining" className="text-sm">
                  Apply this pay to remaining unsent offers
                </label>
              </div>
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
          <Button onClick={handleProceedToConfirm} disabled={!selectedMusicianId || !customPay || loading}>
            Review & Send
          </Button>
        </div>
      </div>
    </div>
  )

  // Confirmation view
  const confirmationView = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-background rounded-lg border shadow-lg w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-semibold">Confirm Offer</h3>

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="rounded-md border bg-muted/30 p-4 space-y-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Musician:</span>
            <span className="font-medium">
              {selectedMusician?.first_name} {selectedMusician?.last_name}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email:</span>
            <span>{selectedMusician?.email || 'No email on file'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pay:</span>
            <span className="font-medium">${finalPay ?? 'Not set'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Expires:</span>
            <span>
              {expiresIn === '0.17' ? '4 hours' :
               expiresIn === 'custom' ? (customDeadline || 'No date selected') :
               expiresIn ? `${expiresIn} day${expiresIn === '1' ? '' : 's'}` :
               'No expiration'}
            </span>
          </div>
          {sendEmail && hasEmail && (
            <div className="pt-2 border-t text-sm text-green-600">
              Email will be sent to {selectedMusician?.email}
            </div>
          )}
          {sendEmail && !hasEmail && (
            <div className="pt-2 border-t text-sm text-amber-600 font-medium">
              ⚠️ No email will be sent - musician has no email on file.
              You must contact them manually.
            </div>
          )}
          {!sendEmail && (
            <div className="pt-2 border-t text-sm text-muted-foreground">
              Email notification disabled
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={previewLoading || loading}
            onClick={async () => {
              setPreviewLoading(true)
              try {
                const res = await fetch('/api/offers/preview-email', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ positionId, musicianId: selectedMusicianId }),
                })
                const data = await res.json()
                if (data.html) {
                  setPreviewHtml(data.html)
                  setShowPreview(true)
                }
              } catch {
                // ignore preview errors
              }
              setPreviewLoading(false)
            }}
          >
            {previewLoading ? 'Loading...' : 'Preview Email'}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleBackToForm} disabled={loading}>
              Back
            </Button>
            <Button onClick={handleSend} disabled={loading}>
              {loading ? 'Sending...' : 'Confirm & Send Offer'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  // Email preview modal
  const previewModal = showPreview && previewHtml ? (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={() => setShowPreview(false)} />
      <div className="relative bg-background rounded-lg border shadow-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Email Preview</h3>
          <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}>
            Close
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <iframe
            srcDoc={previewHtml}
            className="w-full h-[600px] border rounded"
            title="Email Preview"
          />
        </div>
      </div>
    </div>
  ) : null

  return (
    <>
      {showConfirmation ? confirmationView : formView}
      {previewModal}
    </>
  )
}
