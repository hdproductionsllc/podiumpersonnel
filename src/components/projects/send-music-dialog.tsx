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
  totalFiles: number
  musician: {
    id: string
    first_name: string
    last_name: string
  }
}

type DialogView =
  | 'preview'        // File list + notes for new/resend
  | 'confirm-send'   // Confirm recipients + email preview
  | 'status'         // Distribution tracking
  | 'preview-action' // Email preview before reminder/resend
  | 'sent-result'    // Confirmation of what was sent

interface SendMusicDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  organizationName: string
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

/* ─── Inline email preview ─── */
function EmailPreview({
  type,
  musicianName,
  organizationName,
  projectName,
  files,
  notes,
}: {
  type: 'music' | 'reminder'
  musicianName: string
  organizationName: string
  projectName: string
  files: { name: string; size: number }[]
  notes?: string
}) {
  return (
    <div className="border rounded-lg overflow-hidden text-sm bg-[#f6f9fc]">
      {/* Header */}
      <div className="bg-slate-800 text-white text-center py-4 px-4 font-semibold text-base">
        {organizationName}
      </div>

      {/* Body */}
      <div className="bg-white mx-auto p-5 space-y-3" style={{ maxWidth: 520 }}>
        <p className="font-medium text-base">
          Hi {musicianName}{type === 'reminder' ? ',' : '!'}
        </p>

        <p className="text-muted-foreground text-sm leading-relaxed">
          {type === 'reminder'
            ? <>This is a reminder to download your music for <strong className="text-foreground">{projectName}</strong>. Click each file below to download directly.</>
            : <>Your music for <strong className="text-foreground">{projectName}</strong> is ready for download. Click each file below to download directly.</>}
        </p>

        {notes && type === 'music' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
            <p className="text-yellow-800 text-sm whitespace-pre-wrap">{notes}</p>
          </div>
        )}

        <div>
          <p className="font-semibold text-sm mb-2">
            {type === 'reminder' ? 'Files:' : 'Your Files:'}
          </p>
          {files.map((f, i) => (
            <div key={i} className="pl-2 mb-1.5">
              <span className="text-blue-600 underline font-medium">{f.name}</span>
              <span className="text-xs text-muted-foreground ml-1.5">
                ({formatFileSize(f.size)})
              </span>
            </div>
          ))}
        </div>

        <Separator />

        <p className="text-muted-foreground text-sm">
          After downloading, please confirm you've received and loaded all files on your iPad/tablet successfully:
        </p>

        <div className="text-center py-1">
          <span className="inline-block bg-slate-800 text-white rounded-md px-5 py-2.5 text-sm font-semibold">
            Confirm Music Received
          </span>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Questions? Contact {organizationName}.
        </p>
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-2 text-center bg-white">
        <p className="text-xs text-muted-foreground">
          This email was sent by {organizationName} via Podium.
        </p>
      </div>
    </div>
  )
}

export function SendMusicDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  organizationName,
  files,
  positions,
  timezone,
}: SendMusicDialogProps) {
  const [view, setView] = useState<DialogView>('preview')
  const [sending, setSending] = useState(false)
  const [sendId, setSendId] = useState<string | null>(null)
  const [confirmations, setConfirmations] = useState<MusicConfirmationStatus[]>([])
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [notes, setNotes] = useState('')
  const [lastSendNotes, setLastSendNotes] = useState<string | null>(null)

  // What was just sent — for the sent-result view
  const [sentResult, setSentResult] = useState<{
    type: 'music' | 'reminder'
    count: number
    notes?: string
  } | null>(null)

  // Confirmed musicians (for new sends)
  const filledPositions = positions.filter(
    (p) => p.status === 'confirmed' && p.musician_id && p.musician
  )

  // When dialog opens, check for existing sends
  useEffect(() => {
    if (open) {
      checkExistingSends()
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
          setConfirmations(data.confirmations || [])
          setLastSendNotes(data.notes || null)
          setView('status')
        } else {
          setView('preview')
        }
      }
    } catch {
      setView('preview')
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

      setSendId(data.sendId)
      setSentResult({ type: 'music', count: data.sent, notes: notes.trim() || undefined })
      setView('sent-result')

      // Refresh status in background
      const statusRes = await fetch(`/api/projects/${projectId}/music-status`)
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        setConfirmations(statusData.confirmations || [])
        setLastSendNotes(statusData.notes || null)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send music notifications')
    } finally {
      setSending(false)
    }
  }

  async function handleSendReminder() {
    if (!sendId) return
    setSending(true)
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

      if (data.skipped > 0 && data.skippedReasons?.length) {
        toast.warning(`Skipped: ${data.skippedReasons.join(', ')}`)
      }

      setSentResult({ type: 'reminder', count: data.reminded })
      setView('sent-result')

      // Refresh status in background
      const statusRes = await fetch(`/api/projects/${projectId}/music-status`)
      if (statusRes.ok) {
        const statusData = await statusRes.json()
        setConfirmations(statusData.confirmations || [])
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reminders')
    } finally {
      setSending(false)
    }
  }

  // Get which files a musician receives based on their instrument
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

  // Pick a sample musician for the email preview
  const sampleMusician = filledPositions[0]?.musician
  const sampleFiles = sampleMusician
    ? getFilesForMusician(filledPositions[0].instrument_id)
    : files

  // For reminder preview, pick first unconfirmed musician and their files
  const unconfirmedMusicians = confirmations.filter((c) => !c.confirmed_at)
  const reminderSampleMusician = unconfirmedMusicians[0]?.musician
  const reminderSamplePosition = reminderSampleMusician
    ? filledPositions.find((p) => p.musician_id === reminderSampleMusician.id)
    : null
  const reminderSampleFiles = reminderSamplePosition
    ? getFilesForMusician(reminderSamplePosition.instrument_id)
    : sampleFiles

  function viewTitle(): string {
    switch (view) {
      case 'preview': return 'Send Music to Musicians'
      case 'confirm-send': return 'Confirm & Send'
      case 'status': return 'Music Distribution Status'
      case 'preview-action': return 'Email Preview'
      case 'sent-result': return sentResult?.type === 'reminder' ? 'Reminder Sent' : 'Music Sent'
      default: return 'Send Music'
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{viewTitle()}</DialogTitle>
        </DialogHeader>

        {loadingStatus ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>

        ) : view === 'status' ? (
          /* ─── Status View ─── */
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
                      {conf.downloadCount} / {conf.totalFiles} files downloaded
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

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setNotes('')
                    setView('preview')
                  }}
                >
                  Send Music Again
                </Button>
                {unconfirmedCount > 0 && (
                  <Button
                    onClick={() => setView('preview-action')}
                  >
                    Send Reminder to {unconfirmedCount} Musician{unconfirmedCount !== 1 ? 's' : ''}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </div>

        ) : view === 'preview-action' ? (
          /* ─── Preview before sending reminder ─── */
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                This reminder will be sent to <strong>{unconfirmedCount} musician{unconfirmedCount !== 1 ? 's' : ''}</strong> who
                have not yet confirmed receipt. Below is a preview of the email they will receive.
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                Email preview — shown for {reminderSampleMusician?.first_name} {reminderSampleMusician?.last_name}
              </p>
              <EmailPreview
                type="reminder"
                musicianName={reminderSampleMusician?.first_name || 'Musician'}
                organizationName={organizationName}
                projectName={projectName}
                files={reminderSampleFiles.map((f) => ({ name: f.file_name, size: f.file_size }))}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setView('status')}>
                Back
              </Button>
              <Button onClick={handleSendReminder} disabled={sending}>
                {sending ? 'Sending...' : `Send Reminder Now`}
              </Button>
            </DialogFooter>
          </div>

        ) : view === 'sent-result' ? (
          /* ─── Sent confirmation ─── */
          <div className="space-y-4">
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                  {sentResult?.type === 'reminder'
                    ? `Reminder sent to ${sentResult.count} musician${sentResult.count !== 1 ? 's' : ''}`
                    : `Music notification sent to ${sentResult?.count} musician${sentResult?.count !== 1 ? 's' : ''}`}
                </p>
              </div>
              <p className="text-xs text-green-700 dark:text-green-300">
                Each musician received the email shown below.
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                What was sent
              </p>
              <EmailPreview
                type={sentResult?.type || 'music'}
                musicianName={
                  sentResult?.type === 'reminder'
                    ? (reminderSampleMusician?.first_name || sampleMusician?.first_name || 'Musician')
                    : (sampleMusician?.first_name || 'Musician')
                }
                organizationName={organizationName}
                projectName={projectName}
                files={(sentResult?.type === 'reminder' ? reminderSampleFiles : sampleFiles).map((f) => ({ name: f.file_name, size: f.file_size }))}
                notes={sentResult?.notes}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={() => setView('status')}>
                View Status
              </Button>
            </DialogFooter>
          </div>

        ) : view === 'confirm-send' ? (
          /* ─── Confirm Send Step ─── */
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

            <Separator />

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                Email preview — shown for {sampleMusician?.first_name} {sampleMusician?.last_name}
              </p>
              <EmailPreview
                type="music"
                musicianName={sampleMusician?.first_name || 'Musician'}
                organizationName={organizationName}
                projectName={projectName}
                files={sampleFiles.map((f) => ({ name: f.file_name, size: f.file_size }))}
                notes={notes.trim() || undefined}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setView('preview')}>
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
          /* ─── Preview View (initial / resend) ─── */
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
              <Button variant="outline" onClick={() => {
                if (sendId) {
                  setView('status')
                } else {
                  onOpenChange(false)
                }
              }}>
                {sendId ? 'Back' : 'Cancel'}
              </Button>
              <Button
                onClick={() => setView('confirm-send')}
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
