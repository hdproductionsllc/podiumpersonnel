'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTerms, useVertical } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'
import { SECTION_LABELS } from '@/lib/validations/instruments'
import { MAX_REQUIREMENT_QUANTITY } from '@/lib/staffing/requirement-rules'
import { CallChoice, type CallOption } from './call-choice'

interface Role {
  id: string
  name: string
  section: string | null
}

interface AddRequirementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  organizationId: string
  services: CallOption[]
  timezone?: string
  onSuccess: () => void
}

/**
 * "Add crew": one line ("Stagehand x 8, load-in only, $200 each") becomes that
 * many chairs at once (POST /api/projects/[projectId]/requirements, migration
 * 099). Only offered to an organization with call_scoped_requirements on.
 *
 * The request carries an id for exactly what it asks, so a double click or a
 * retry after a dropped connection returns the chairs the first one made
 * instead of making a second set. Changing any field after a failed attempt
 * makes a new id: the edited request is a new request, never answered with
 * the chairs of the one before it.
 */
export function AddRequirementDialog({
  open,
  onOpenChange,
  projectId,
  organizationId,
  services,
  timezone,
  onSuccess,
}: AddRequirementDialogProps) {
  const terms = useTerms()
  // The sections this vertical groups its skills under (music: strings..other)
  const sections = useVertical().sections
  const [roles, setRoles] = useState<Role[]>([])
  const [roleId, setRoleId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [calls, setCalls] = useState<string[] | null>(null)
  const [pay, setPay] = useState('')
  const [notes, setNotes] = useState('')
  /** The last request sent: its id, and exactly what it asked (to reuse the id only for the same ask). */
  const [sent, setSent] = useState<{ id: string; ask: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const skill = term(terms, 'skill')
  const session = term(terms, 'session', { case: 'lower' })
  const sessions = term(terms, 'session', { plural: true, case: 'lower' })

  useEffect(() => {
    if (!open) return
    setRoleId('')
    setQuantity('1')
    setCalls(null)
    setPay('')
    setNotes('')
    setError(null)
    setSent(null)
    createClient()
      .from('instruments')
      .select('id, name, section')
      .eq('organization_id', organizationId)
      .order('sort_order')
      .order('name')
      .then(({ data }) => setRoles((data as Role[]) || []))
  }, [open, organizationId])

  const count = Number(quantity)
  const countOk = Number.isInteger(count) && count >= 1 && count <= MAX_REQUIREMENT_QUANTITY
  const payOk = pay.trim() === '' || (Number.isFinite(Number(pay)) && Number(pay) >= 0)
  const callsOk = calls === null || calls.length > 0
  const ready = !!roleId && countOk && payOk && callsOk && !saving

  async function handleSave() {
    if (!ready) return
    setSaving(true)
    setError(null)
    const fields = {
      instrumentId: roleId,
      quantity: count,
      serviceIds: calls,
      defaultPay: pay.trim() === '' ? null : Number(pay),
      notes: notes.trim() || null,
    }
    const ask = JSON.stringify(fields)
    const requestId = sent && sent.ask === ask ? sent.id : crypto.randomUUID()
    setSent({ id: requestId, ask })
    try {
      const response = await fetch(`/api/projects/${projectId}/requirements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, requestId }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(result.error || 'Could not add these chairs')
        return
      }
      const made = (result.positionIds as string[] | undefined)?.length ?? count
      const madeRoleId = (result.requirement as { instrument_id?: string } | undefined)?.instrument_id ?? roleId
      const role = roles.find((r) => r.id === madeRoleId)?.name ?? skill
      if (result.created === false) {
        // A retry of a request that had already gone through: say what it made.
        toast.success(`Already added: ${made} × ${role}. Nothing new was made.`)
      } else {
        toast.success(`Added ${made} × ${role}`)
      }
      onSuccess()
      onOpenChange(false)
    } catch {
      setError('Could not reach Podium. Check your connection and try again; it will not add them twice.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add crew</DialogTitle>
          <DialogDescription>
            One line for several people in the same {skill.toLowerCase()}, e.g. 8 stagehands for the load-in.
            Each gets their own slot to offer and fill.
          </DialogDescription>
        </DialogHeader>

        {error && <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">{error}</div>}

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="req-role">{skill}</label>
              <select
                id="req-role"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
              >
                <option value="">-- Select {skill.toLowerCase()} --</option>
                {sections.map((section) => {
                  const inSection = roles.filter((r) => (r.section || 'other') === section)
                  if (inSection.length === 0) return null
                  return (
                    <optgroup key={section} label={SECTION_LABELS[section]}>
                      {inSection.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </optgroup>
                  )
                })}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="req-quantity">How many</label>
              <Input
                id="req-quantity"
                type="number"
                min={1}
                max={MAX_REQUIREMENT_QUANTITY}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          </div>
          {!countOk && quantity !== '' && (
            <p className="text-xs text-destructive">A whole number from 1 to {MAX_REQUIREMENT_QUANTITY}.</p>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">Which {sessions}</p>
            {services.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                This {term(terms, 'work', { case: 'lower' })} has no {sessions} yet; they will work every {session} you add.
              </p>
            ) : (
              <CallChoice services={services} selected={calls} onChange={setCalls} timezone={timezone} disabled={saving} />
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="req-pay">Pay per person (optional)</label>
            <Input
              id="req-pay"
              type="number"
              min={0}
              step="0.01"
              placeholder="e.g. 200"
              value={pay}
              onChange={(e) => setPay(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              For the whole {term(terms, 'work', { case: 'lower' })}, not per {session}. Suggested on each offer; you can change it there.
            </p>
            {!payOk && <p className="text-xs text-destructive">Enter an amount of 0 or more, or leave it empty.</p>}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="req-notes">Notes (optional)</label>
            <Input id="req-notes" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!ready}>
            {saving ? 'Adding…' : countOk ? `Add ${count}` : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
