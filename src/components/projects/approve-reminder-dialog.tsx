'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'

interface ReminderData {
  reminder: {
    id: string
    status: 'draft' | 'sent' | 'expired'
    notes: string | null
    triggerDate: string
    createdAt: string
    sentAt: string | null
    musicianCount: number | null
  }
  project: {
    id: string
    name: string
    ensembleType: string | null
  }
  services: {
    name: string
    date: string
    time: string
    callTime: string | null
    venue: string | null
  }[]
  roster: {
    name: string
    instrument: string
  }[]
  musicianCount: number
  sendHistory: {
    gigDetails: { sentAt: string; musicianCount: number } | null
    music: { sentAt: string; musicianCount: number } | null
  }
}

interface SavedTemplate {
  id: string
  name: string
  content: string
  created_at: string
}

interface ApproveReminderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reminderId: string
}

export function ApproveReminderDialog({
  open,
  onOpenChange,
  reminderId,
}: ApproveReminderDialogProps) {
  const terms = useTerms()
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [data, setData] = useState<ReminderData | null>(null)
  const [notes, setNotes] = useState('')
  const [sent, setSent] = useState(false)
  const [sentCount, setSentCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Template state
  const [templates, setTemplates] = useState<SavedTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)

  // Load reminder data + templates in parallel
  useEffect(() => {
    if (open && reminderId) {
      setLoading(true)
      setError(null)
      setSent(false)
      setSelectedTemplateId('')
      setShowSaveTemplate(false)
      setTemplateName('')

      Promise.all([
        fetch(`/api/pre-gig-reminders/${reminderId}`).then((r) => r.json()),
        fetch('/api/reminder-templates').then((r) => r.json()),
      ])
        .then(([reminderJson, templatesJson]) => {
          if (reminderJson.error) {
            setError(reminderJson.error)
          } else {
            setData(reminderJson)
            setNotes(reminderJson.reminder.notes || '')
          }
          setTemplates(templatesJson.templates || [])
        })
        .catch(() => setError('Failed to load reminder'))
        .finally(() => setLoading(false))
    }
  }, [open, reminderId])

  function handleTemplateSelect(templateId: string) {
    setSelectedTemplateId(templateId)
    if (templateId === '__clear') {
      setNotes('')
      setSelectedTemplateId('')
      return
    }
    const template = templates.find((t) => t.id === templateId)
    if (template) {
      // Append to existing notes if there are any, otherwise replace
      if (notes.trim()) {
        setNotes(notes.trim() + '\n\n' + template.content)
      } else {
        setNotes(template.content)
      }
    }
  }

  async function handleSaveTemplate() {
    if (!templateName.trim() || !notes.trim()) return
    setSavingTemplate(true)
    try {
      const res = await fetch('/api/reminder-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: templateName.trim(), content: notes.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save')
      setTemplates((prev) => [...prev, json.template].sort((a, b) => a.name.localeCompare(b.name)))
      setShowSaveTemplate(false)
      setTemplateName('')
      toast.success('Template saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save template')
    } finally {
      setSavingTemplate(false)
    }
  }

  async function handleDeleteTemplate(templateId: string) {
    try {
      await fetch(`/api/reminder-templates/${templateId}`, { method: 'DELETE' })
      setTemplates((prev) => prev.filter((t) => t.id !== templateId))
      if (selectedTemplateId === templateId) setSelectedTemplateId('')
      toast.success('Template deleted')
    } catch {
      toast.error('Failed to delete template')
    }
  }

  async function handleApprove() {
    setSending(true)
    try {
      const res = await fetch(`/api/pre-gig-reminders/${reminderId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to send')
      }
      setSent(true)
      setSentCount(json.sent)
      toast.success(`Gig details sent to ${json.sent} ${term(terms, 'person', { plural: json.sent !== 1, case: 'lower' })}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve reminder')
    } finally {
      setSending(false)
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {sent ? 'Reminder Sent' : 'Pre-Gig Reminder'}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        )}

        {error && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}

        {!loading && !error && data && !sent && (
          <>
            {/* Project Info */}
            <div>
              <h3 className="font-semibold text-lg">{data.project.name}</h3>
              <p className="text-sm text-muted-foreground">
                {data.musicianCount} confirmed {term(terms, 'person', { plural: data.musicianCount !== 1, case: 'lower' })}
              </p>
            </div>

            {/* Send History Badges */}
            <div className="flex flex-wrap gap-2">
              {data.sendHistory.gigDetails ? (
                <Badge variant="secondary" className="text-xs">
                  Gig details sent {formatDate(data.sendHistory.gigDetails.sentAt)}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Gig details not yet sent
                </Badge>
              )}
              {data.sendHistory.music ? (
                <Badge variant="secondary" className="text-xs">
                  Music sent {formatDate(data.sendHistory.music.sentAt)}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Music not yet sent
                </Badge>
              )}
            </div>

            <Separator />

            {/* Schedule Preview */}
            <div>
              <h4 className="text-sm font-medium mb-2">Schedule</h4>
              <div className="space-y-2">
                {data.services.map((service, i) => (
                  <div key={i} className="rounded-lg bg-muted/50 p-3 text-sm">
                    <div className="font-medium">{service.name}</div>
                    <div className="text-muted-foreground">
                      {service.date} at {service.time}
                      {service.callTime && ` (call: ${service.callTime})`}
                    </div>
                    {service.venue && (
                      <div className="text-muted-foreground">{service.venue}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Roster Preview */}
            <div>
              <h4 className="text-sm font-medium mb-2">
                Roster ({data.roster.length})
              </h4>
              <div className="grid grid-cols-2 gap-1">
                {data.roster.map((member, i) => (
                  <div key={i} className="text-sm text-muted-foreground">
                    {member.name} <span className="text-xs">({member.instrument})</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Notes Input with Template Support */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label htmlFor="reminder-notes" className="text-sm font-medium">
                  Add updates for your {term(terms, 'person', { plural: true, case: 'lower' })}
                </label>
                {notes.trim() && !showSaveTemplate && (
                  <button
                    type="button"
                    onClick={() => setShowSaveTemplate(true)}
                    className="text-xs text-primary hover:underline"
                  >
                    Save as template
                  </button>
                )}
              </div>

              {/* Template Selector */}
              {templates.length > 0 && (
                <div className="flex items-center gap-2">
                  <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue placeholder="Insert from saved template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="text-xs">
                          <div className="flex items-center justify-between w-full gap-2">
                            <span>{t.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                      <SelectItem value="__clear" className="text-xs text-muted-foreground">
                        Clear notes
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {selectedTemplateId && selectedTemplateId !== '__clear' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(selectedTemplateId)}
                      className="text-xs text-muted-foreground hover:text-destructive shrink-0"
                      title="Delete this template"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  )}
                </div>
              )}

              <Textarea
                id="reminder-notes"
                placeholder="e.g. Parking has moved to the south lot, please use entrance B..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />

              {/* Save Template Inline */}
              {showSaveTemplate && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Template name (e.g. Parking reminder)"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="h-8 text-xs flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleSaveTemplate()
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 text-xs"
                    onClick={handleSaveTemplate}
                    disabled={savingTemplate || !templateName.trim()}
                  >
                    {savingTemplate ? 'Saving...' : 'Save'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={() => {
                      setShowSaveTemplate(false)
                      setTemplateName('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                These notes will be included in the gig details email sent to {term(terms, 'person', { plural: true, case: 'lower' })}.
                {templates.length === 0 && ' You can save frequently used notes as templates for quick reuse.'}
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleApprove} disabled={sending}>
                {sending ? 'Sending...' : `Approve & Send to ${data.musicianCount} ${term(terms, 'person', { plural: data.musicianCount !== 1 })}`}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Success State */}
        {sent && (
          <div className="text-center py-6 space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center">
              <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-lg">Reminder Sent</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Gig details have been sent to {sentCount} {term(terms, 'person', { plural: sentCount !== 1, case: 'lower' })}.
              </p>
            </div>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
