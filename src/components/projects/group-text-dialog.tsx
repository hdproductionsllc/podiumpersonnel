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
  projectName: string
  musicians: MusicianPhone[]
  onPhonesSaved: () => void
}

export function GroupTextDialog({
  open,
  onOpenChange,
  projectName,
  musicians,
  onPhonesSaved,
}: GroupTextDialogProps) {
  const [phoneEdits, setPhoneEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const defaultMessage = `Hi everyone - connecting you all for the ${projectName} gig. Please use this thread to coordinate. Looking forward to it!`
  const [message, setMessage] = useState(defaultMessage)

  const missingPhones = musicians.filter((m) => !m.phone)
  const hasPhones = musicians.filter((m) => m.phone)

  // Reset edits when dialog opens
  useEffect(() => {
    if (open) {
      setPhoneEdits({})
      setMessage(`Hi everyone - connecting you all for the ${projectName} gig. Please use this thread to coordinate. Looking forward to it!`)
    }
  }, [open, projectName])

  function getAllPhones(): string[] {
    return musicians
      .map((m) => {
        const raw = phoneEdits[m.musicianId] ?? m.phone ?? ''
        return raw.replace(/\D/g, '')
      })
      .filter((p) => p.length >= 10)
  }

  function getFormattedPhones(): string[] {
    return musicians
      .map((m) => {
        const raw = phoneEdits[m.musicianId] ?? m.phone ?? ''
        const digits = raw.replace(/\D/g, '')
        if (digits.length < 10) return null
        return digits
      })
      .filter((p): p is string => p !== null)
  }

  async function saveEdits(): Promise<boolean> {
    const supabase = createClient()

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
        return false
      }
    }

    if (editsToSave.length > 0) {
      toast.success(`Saved ${editsToSave.length} phone number${editsToSave.length !== 1 ? 's' : ''}`)
      onPhonesSaved()
    }

    return true
  }

  async function handleOpenText() {
    setSaving(true)
    try {
      const saved = await saveEdits()
      if (!saved) return

      const phones = getAllPhones()
      if (phones.length > 0) {
        const body = encodeURIComponent(message.trim())
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        if (isIOS) {
          // iOS requires /open?addresses= format for multiple recipients
          window.location.href = `sms:/open?addresses=${phones.join(',')}&body=${body}`
        } else {
          // Android and others: sms:num1,num2?body=
          window.location.href = `sms:${phones.join(',')}?body=${body}`
        }
      }

      onOpenChange(false)
    } catch {
      toast.error('Failed to save phone numbers')
    } finally {
      setSaving(false)
    }
  }

  async function handleCopyNumbers() {
    setSaving(true)
    try {
      const saved = await saveEdits()
      if (!saved) return

      const phones = getFormattedPhones()
      if (phones.length === 0) return

      // Copy just phone numbers (comma-separated) for pasting into recipient field
      await navigator.clipboard.writeText(phones.join(', '))
      toast.success(`Copied ${phones.length} number${phones.length !== 1 ? 's' : ''} to clipboard — paste into your messaging app's recipient field`)
    } catch {
      toast.error('Failed to copy to clipboard')
    } finally {
      setSaving(false)
    }
  }

  async function handleCopyMessage() {
    await navigator.clipboard.writeText(message.trim())
    toast.success('Message copied to clipboard')
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

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">Message</label>
            <button
              type="button"
              onClick={handleCopyMessage}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Copy message
            </button>
          </div>
          <textarea
            className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleCopyNumbers}
            disabled={saving || readyCount === 0}
          >
            <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
            </svg>
            Copy Numbers
          </Button>
          <Button
            onClick={handleOpenText}
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
