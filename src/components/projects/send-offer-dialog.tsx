'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

export type MusicianForOffer = {
  id: string
  first_name: string
  last_name: string
  musician_instruments: { instrument_id: string }[]
}

interface SendOfferDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  positionId: string
  instrumentId: string
  musicians: MusicianForOffer[]
  existingOfferMusicianIds: string[]
  onSuccess: () => void
}

export function SendOfferDialog({
  open,
  onOpenChange,
  positionId,
  instrumentId,
  musicians,
  existingOfferMusicianIds,
  onSuccess,
}: SendOfferDialogProps) {
  const [selectedMusicianId, setSelectedMusicianId] = useState('')
  const [expiresIn, setExpiresIn] = useState<string>('7')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  // Filter musicians who play this instrument and don't already have an offer
  const availableMusicians = musicians.filter(
    (m) =>
      m.musician_instruments.some((mi) => mi.instrument_id === instrumentId) &&
      !existingOfferMusicianIds.includes(m.id)
  )

  async function handleSend() {
    if (!selectedMusicianId) return

    setLoading(true)
    setError(null)

    const supabase = createClient()

    const expiresAt = expiresIn
      ? new Date(Date.now() + parseInt(expiresIn) * 24 * 60 * 60 * 1000).toISOString()
      : null

    const { error: insertError } = await supabase.from('contract_offers').insert({
      project_position_id: positionId,
      musician_id: selectedMusicianId,
      status: 'pending',
      sent_at: new Date().toISOString(),
      expires_at: expiresAt,
    })

    setLoading(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    // Update position status to offered
    await supabase
      .from('project_positions')
      .update({ status: 'offered' })
      .eq('id', positionId)

    setSelectedMusicianId('')
    onOpenChange(false)
    onSuccess()
  }

  function handleClose() {
    setSelectedMusicianId('')
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
