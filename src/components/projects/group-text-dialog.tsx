'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface MusicianPhone {
  positionId: string
  musicianId: string
  firstName: string
  lastName: string
  instrument: string
  phone: string | null
}

interface GroupTextDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  musicians: MusicianPhone[]
  onPhonesSaved: () => void
}

export function GroupTextDialog({
  open,
  onOpenChange,
  musicians,
  onPhonesSaved,
}: GroupTextDialogProps) {
  const [phoneEdits, setPhoneEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const missingPhones = musicians.filter((m) => !m.phone)
  const hasPhones = musicians.filter((m) => m.phone)

  // Reset edits when dialog opens
  useEffect(() => {
    if (open) {
      setPhoneEdits({})
    }
  }, [open])

  function getPhone(m: MusicianPhone): string {
    if (phoneEdits[m.musicianId] !== undefined) return phoneEdits[m.musicianId]
    return m.phone || ''
  }

  function getAllPhones(): string[] {
    return musicians
      .map((m) => {
        const raw = phoneEdits[m.musicianId] ?? m.phone ?? ''
        return raw.replace(/\D/g, '')
      })
      .filter((p) => p.length >= 10)
  }

  async function handleSaveAndText() {
    setSaving(true)
    try {
      const supabase = createClient()

      // Save any new/updated phone numbers
      const editsToSave = Object.entries(phoneEdits).filter(
        ([, value]) => value.trim().length > 0
      )

      for (const [musicianId, phone] of editsToSave) {
        const { error } = await supabase
          .from('musicians')
          .update({ phone: phone.trim() })
          .eq('id', musicianId)

        if (error) {
          toast.error(`Failed to save phone for ${musicians.find((m) => m.musicianId === musicianId)?.firstName}: ${error.message}`)
          setSaving(false)
          return
        }
      }

      if (editsToSave.length > 0) {
        toast.success(`Saved ${editsToSave.length} phone number${editsToSave.length !== 1 ? 's' : ''}`)
        onPhonesSaved()
      }

      // Open SMS
      const phones = getAllPhones()
      if (phones.length > 0) {
        window.location.href = `sms:${phones.join(',')}`
      }

      onOpenChange(false)
    } catch {
      toast.error('Failed to save phone numbers')
    } finally {
      setSaving(false)
    }
  }

  const readyCount = getAllPhones().length
  const totalCount = musicians.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Group Text</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {missingPhones.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                {missingPhones.length} musician{missingPhones.length !== 1 ? 's' : ''} missing phone number{missingPhones.length !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                Enter their numbers below to include them in the group text.
              </p>
            </div>
          )}

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {/* Musicians missing phones first */}
            {missingPhones.map((m) => (
              <div
                key={m.musicianId}
                className="flex items-center gap-3 py-2 px-3 rounded-md bg-muted/30"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {m.firstName} {m.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">{m.instrument}</p>
                </div>
                <input
                  type="tel"
                  placeholder="Phone number"
                  value={phoneEdits[m.musicianId] || ''}
                  onChange={(e) =>
                    setPhoneEdits((prev) => ({ ...prev, [m.musicianId]: e.target.value }))
                  }
                  className="w-36 rounded-md border bg-background px-2 py-1.5 text-sm"
                />
              </div>
            ))}

            {/* Musicians with phones */}
            {hasPhones.map((m) => (
              <div
                key={m.musicianId}
                className="flex items-center gap-3 py-2 px-3 rounded-md bg-muted/30"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {m.firstName} {m.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">{m.instrument}</p>
                </div>
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {m.phone}
                </span>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveAndText}
            disabled={saving || readyCount === 0}
          >
            {saving
              ? 'Saving...'
              : readyCount === totalCount
                ? `Open Text (${readyCount})`
                : readyCount > 0
                  ? `Open Text (${readyCount} of ${totalCount})`
                  : 'Enter at least one number'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
