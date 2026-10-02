'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'
import { CallChoice, type CallOption } from './call-choice'

interface ChairCallsDialogProps {
  /** The chair being edited, or null when closed. */
  chair: { id: string; label: string; serviceIds: string[] | null } | null
  onClose: () => void
  services: CallOption[]
  timezone?: string
  onSuccess: () => void
}

/**
 * The call picker on one chair: every call, or only some (PUT
 * /api/positions/[positionId]/scope, migration 099). Only offered to an
 * organization with call_scoped_requirements on, and only on a chair nobody
 * holds or is considering (the server refuses otherwise: their offer named
 * its calls).
 */
export function ChairCallsDialog({ chair, onClose, services, timezone, onSuccess }: ChairCallsDialogProps) {
  const terms = useTerms()
  const [selected, setSelected] = useState<string[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!chair) return
    setSelected(chair.serviceIds)
    setError(null)
  }, [chair])

  const sessions = term(terms, 'session', { plural: true, case: 'lower' })
  const ready = (selected === null || selected.length > 0) && !saving

  async function handleSave() {
    if (!chair || !ready) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/positions/${chair.id}/scope`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceIds: selected }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(result.error || `Could not update the ${sessions}`)
        return
      }
      if (result.changed) toast.success(`${chair.label}: ${sessions} updated`)
      onSuccess()
      onClose()
    } catch {
      setError(`Could not update the ${sessions}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={chair !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{term(terms, 'session', { plural: true })}: {chair?.label}</DialogTitle>
          <DialogDescription>
            Which {sessions} this slot works. Its offer, {term(terms, 'work', { case: 'lower' })} page, calendar and pay
            cover only these.
          </DialogDescription>
        </DialogHeader>

        {error && <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">{error}</div>}

        <div className="py-2">
          <CallChoice services={services} selected={selected} onChange={setSelected} timezone={timezone} disabled={saving} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!ready}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
