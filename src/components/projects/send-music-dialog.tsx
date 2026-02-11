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
import type { ProjectFile } from './project-files-section'

interface MusicConfirmationStatus {
  id: string
  musician_id: string
  confirmed_at: string | null
  downloadCount: number
  musician: {
    id: string
    first_name: string
    last_name: string
  }
}

interface SendMusicDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  files: ProjectFile[]
  positions: {
    id: string
    status: string
    instrument_id: string
    musician_id: string | null
    instrument?: { id: string; name: string } | null
    musician?: { id: string; first_name: string; last_name: string } | null
  }[]
  timezone: string
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function SendMusicDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  files,
  positions,
  timezone,
}: SendMusicDialogProps) {
  const [sending, setSending] = useState(false)
  const [sendingReminder, setSendingReminder] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendId, setSendId] = useState<string | null>(null)
  const [confirmations, setConfirmations] = useState<MusicConfirmationStatus[]>([])
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [notes, setNotes] = useState('')
  const [showConfirmSend, setShowConfirmSend] = useState(false)
  const [totalFiles, setTotalFiles] = useState(0)

  // Confirmed musicians
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
      const res = await fetch(`/api/projects/${projectId}/music-status`)
      if (res.ok) {
        const data = await res.json()
        if (data.sendId) {
          setSendId(data.sendId)
          setSent(true)
          setConfirmations(data.confirmations || [])
          setTotalFiles(data.totalFiles || 0)
        }
      }
    } catch {
      // No existing sends
    } finally {
      setLoadingStatus(false)
    }
  }

  async function handleSend() {
    setSending(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/send-music`, {
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
      toast.success(`Music notification sent to ${data.sent} musician${data.sent !== 1 ? 's' : ''}`)

      await checkExistingSends()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send music notifications')
    } finally {
      setSending(false)
    }
  }

  async function handleSendReminder() {
    if (!sendId) return
    setSendingReminder(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/send-music-reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendId }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send reminders')
      }

      if (data.skipped > 0) {
        toast.success(`Reminder sent to ${data.reminded} of ${data.total} musicians (${data.skipped} failed)`)
      } else {
        toast.success(`Reminder sent to ${data.reminded} musician${data.reminded !== 1 ? 's' : ''}`)
      }

      await checkExistingSends()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reminders')
    } finally {
      setSendingReminder(false)
    }
  }

  // Get which files each musician will receive
  function getFilesForMusician(instrumentId: string): ProjectFile[] {
    return files.filter((f) => {
      if (f.scope === 'all') return true
      if (f.scope === 'assigned') {
        return f.project_file_instruments.some(
          (fi) => fi.instrument_id === instrumentId
        )
      }
      return false
    })
  }

  const confirmedCount = confirmations.filter((c) => c.confirmed_at).length
  const totalCount = confirmations.length
  const unconfirmedCount = totalCount - confirmedCount
  const allConfirmed = totalCount > 0 && confirmedCount === totalCount

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {sent ? 'Music Distribution Status' : showConfirmSend ? 'Confirm & Send' : 'Send Music to Musicians'}
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
                  ? 'Everyone has confirmed receipt!'
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
                  <div>
                    <span className="text-sm font-medium">
                      {conf.musician.first_name} {conf.musician.last_name}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {conf.downloadCount} / {totalFiles} files downloaded
                    </span>
                  </div>
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
                You are about to notify {filledPositions.length} musician{filledPositions.length !== 1 ? 's' : ''} that music is available.
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Each musician will receive an email with their assigned files and a link to download from the portal.
                {notes.trim() ? ' Your message will be included.' : ''}
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold mb-2">Recipients & Files:</h4>
              {filledPositions
                .sort((a, b) => {
                  const instrA = a.instrument?.name || ''
                  const instrB = b.instrument?.name || ''
                  return instrA.localeCompare(instrB)
                })
                .map((pos) => {
                  const musicianFiles = getFilesForMusician(pos.instrument_id)
                  return (
                    <div key={pos.id} className="py-2 px-3 rounded-md bg-muted/30">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {pos.musician?.first_name} {pos.musician?.last_name}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          — {pos.instrument?.name}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {musicianFiles.length} file{musicianFiles.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  )
                })}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConfirmSend(false)}>
                Back
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
              Review the files that will be sent to each musician. Musicians will receive an email notification and can download files from their portal.
            </p>

            {/* File List */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <span className="inline-block w-1 h-4 bg-primary rounded-full" />
                Files ({files.length})
              </h4>
              <div className="space-y-1">
                {files.map((file) => (
                  <div key={file.id} className="flex items-center justify-between py-1.5 px-3 rounded-md bg-muted/30 text-sm">
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                      </svg>
                      <span>{file.file_name}</span>
                      <span className="text-muted-foreground">({formatFileSize(file.file_size)})</span>
                    </div>
                    {file.scope === 'all' ? (
                      <Badge variant="secondary" className="text-xs">All</Badge>
                    ) : (
                      <div className="flex gap-1">
                        {file.project_file_instruments.map((fi) => (
                          <Badge key={fi.instrument_id} variant="outline" className="text-xs">
                            {fi.instrument.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Notes Section */}
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <span className="inline-block w-1 h-4 bg-primary rounded-full" />
                Message to Musicians
                <span className="font-normal text-muted-foreground text-xs">(optional)</span>
              </h4>
              <textarea
                className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
                placeholder="Any notes about the music — practice instructions, part assignments, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Confirmation note */}
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3">
              <p className="text-xs text-green-700 dark:text-green-300">
                Musicians will be asked to download all files and click &quot;I Have Received All Music&quot; to confirm. You can track confirmations from this dialog.
              </p>
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
