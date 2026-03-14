'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import {
  projectSchema,
  type ProjectInput,
  EVENT_TYPES,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUSES,
} from '@/lib/validations/projects'
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
import { TimePicker } from '@/components/ui/time-picker'
import { VenueSearch } from '@/components/ui/venue-search'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import type { ProjectWithServices } from './projects-client'

type TemplateType = 'string-quartet' | 'string-trio' | 'duo' | 'solo' | 'orchestra' | 'custom'

const ENSEMBLE_LABELS: Partial<Record<TemplateType, string>> = {
  'string-quartet': 'String Quartet',
  'string-trio': 'String Trio',
  'duo': 'Duo',
  'solo': 'Solo',
  'orchestra': 'Orchestra',
}

const TEMPLATES: Record<TemplateType, { label: string; description: string; defaultName: string; singleDay?: boolean }> = {
  'string-quartet': {
    label: 'String Quartet Gig',
    description: '1 performance — Violin 1, Violin 2, Viola, Cello',
    defaultName: 'String Quartet Gig',
    singleDay: true,
  },
  'string-trio': {
    label: 'String Trio Gig',
    description: '1 performance — Violin 1, Violin 2, Cello',
    defaultName: 'String Trio Gig',
    singleDay: true,
  },
  'duo': {
    label: 'Violin & Cello Duo',
    description: '1 performance — Violin, Cello',
    defaultName: 'Violin & Cello Duo',
    singleDay: true,
  },
  'solo': {
    label: 'Solo Performance',
    description: '1 performance — single position',
    defaultName: 'Solo Performance',
    singleDay: true,
  },
  'orchestra': {
    label: 'Orchestra Concert',
    description: '2 rehearsals + 1 performance',
    defaultName: 'Orchestra Concert',
  },
  'custom': {
    label: 'Custom Project',
    description: 'Blank form — set up everything yourself',
    defaultName: '',
  },
}

interface ProjectFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: ProjectWithServices | null
  organizationId: string
  isFirstProject?: boolean
  onSuccess: (newProject?: { id: string; start_date: string | null; end_date: string | null; template?: TemplateType; callTime?: string; startTime?: string; endTime?: string; venueName?: string; venueId?: string | null }) => void
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  organizationId,
  isFirstProject,
  onSuccess,
}: ProjectFormDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType | null>(null)
  const [isSingleDay, setIsSingleDay] = useState(false)
  const [callTime, setCallTime] = useState('18:30')
  const [startTime, setStartTime] = useState('19:00')
  const [endTime, setEndTime] = useState('22:00')
  const [venueName, setVenueName] = useState('')
  const [venueId, setVenueId] = useState<string | null>(null)
  const [bookingOpen, setBookingOpen] = useState(false)
  const isEditing = !!project
  const today = new Date().toISOString().split('T')[0]

  const form = useForm<ProjectInput>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: '',
      description: '',
      internal_notes: '',
      start_date: '',
      end_date: '',
      status: 'active',
      client_name: '',
      client_email: '',
      client_phone: '',
      event_type: '',
      contract_amount: null,
      deposit_amount: null,
      deposit_paid_at: '',
      payment_status: 'pending',
      payment_notes: '',
      coordinator_name: '',
      coordinator_email: '',
      coordinator_phone: '',
    },
  })

  useEffect(() => {
    if (open) {
      if (project) {
        form.reset({
          name: project.name,
          description: project.description || '',
          internal_notes: project.internal_notes || '',
          start_date: project.start_date || '',
          end_date: project.end_date || '',
          status: project.status,
          client_name: project.client_name || '',
          client_email: project.client_email || '',
          client_phone: project.client_phone || '',
          event_type: project.event_type || '',
          contract_amount: project.contract_amount ? Number(project.contract_amount) : null,
          deposit_amount: project.deposit_amount ? Number(project.deposit_amount) : null,
          deposit_paid_at: project.deposit_paid_at || '',
          payment_status: (project.payment_status as 'pending' | 'deposit_paid' | 'fully_paid') || 'pending',
          payment_notes: project.payment_notes || '',
          coordinator_name: project.coordinator_name || '',
          coordinator_email: project.coordinator_email || '',
          coordinator_phone: project.coordinator_phone || '',
        })
        setShowTemplatePicker(false)
        setSelectedTemplate(null)
        // Auto-expand booking section if any client/payment data exists
        setBookingOpen(!!(project.client_name || project.client_email || project.contract_amount || project.event_type || project.coordinator_name))
        // Auto-detect single-day event
        setIsSingleDay(
          !!project.start_date && !!project.end_date && project.start_date === project.end_date
        )
      } else {
        form.reset({
          name: '',
          description: '',
          internal_notes: '',
          start_date: '',
          end_date: '',
          status: 'active',
          client_name: '',
          client_email: '',
          client_phone: '',
          event_type: '',
          contract_amount: null,
          deposit_amount: null,
          deposit_paid_at: '',
          payment_status: 'pending',
          payment_notes: '',
          coordinator_name: '',
          coordinator_email: '',
          coordinator_phone: '',
        })
        // Always show template picker for new projects
        setShowTemplatePicker(true)
        setSelectedTemplate(null)
        setIsSingleDay(false)
        setBookingOpen(false)
        setCallTime('18:30')
        setStartTime('19:00')
        setEndTime('22:00')
        setVenueName('')
        setVenueId(null)
      }
      setError(null)
    }
  }, [open, project, form, isFirstProject])

  /** Add minutes to an "HH:mm" string, returning a new "HH:mm" string */
  function addMinutes(time: string, mins: number): string {
    const [h, m] = time.split(':').map(Number)
    const total = h * 60 + m + mins
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  }

  function handleCallTimeChange(time: string) {
    setCallTime(time)
    const newStart = addMinutes(time, 30)
    setStartTime(newStart)
    setEndTime(addMinutes(newStart, 180))
  }

  function handleStartTimeChange(time: string) {
    setStartTime(time)
    setEndTime(addMinutes(time, 180))
  }

  function handleEndTimeChange(time: string) {
    setEndTime(time)
  }

  function handleTemplateSelect(template: TemplateType) {
    setSelectedTemplate(template)
    setShowTemplatePicker(false)
    if (template !== 'custom') {
      form.setValue('name', TEMPLATES[template].defaultName)
    }
    setIsSingleDay(!!TEMPLATES[template].singleDay)
  }

  async function onSubmit(data: ProjectInput) {
    setIsLoading(true)
    setError(null)

    // Validate date is not in the past (for new projects only)
    if (!isEditing && data.start_date && data.start_date < today) {
      setError('Date cannot be in the past.')
      setIsLoading(false)
      return
    }

    // Validate venue for template-based projects (services will be auto-created)
    if (!isEditing && selectedTemplate && selectedTemplate !== 'custom' && !venueName.trim()) {
      setError('Please select a performance venue.')
      setIsLoading(false)
      return
    }

    // Validate time ordering for single-day templates with time pickers
    const showTimePicker = isSingleDay && selectedTemplate !== null && selectedTemplate !== 'custom' && selectedTemplate !== 'orchestra'
    if (showTimePicker) {
      if (endTime <= startTime) {
        setError('End time must be after start time.')
        setIsLoading(false)
        return
      }
      if (callTime > startTime) {
        setError('Call time should be before start time.')
        setIsLoading(false)
        return
      }
    }

    const supabase = createClient()

    if (isEditing) {
      const { error: updateError } = await supabase
        .from('projects')
        .update({
          name: data.name,
          description: data.description || null,
          internal_notes: data.internal_notes || null,
          start_date: data.start_date || null,
          end_date: data.end_date || null,
          status: data.status,
          client_name: data.client_name || null,
          client_email: data.client_email || null,
          client_phone: data.client_phone || null,
          event_type: data.event_type || null,
          contract_amount: data.contract_amount ?? null,
          deposit_amount: data.deposit_amount ?? null,
          deposit_paid_at: data.deposit_paid_at || null,
          payment_status: data.payment_status || 'pending',
          payment_notes: data.payment_notes || null,
          coordinator_name: data.coordinator_name || null,
          coordinator_email: data.coordinator_email || null,
          coordinator_phone: data.coordinator_phone || null,
        })
        .eq('id', project.id)

      if (updateError) {
        setError(updateError.message)
        setIsLoading(false)
        return
      }
    } else {
      const { data: newProject, error: insertError } = await supabase
        .from('projects')
        .insert({
          organization_id: organizationId,
          name: data.name,
          description: data.description || null,
          internal_notes: data.internal_notes || null,
          start_date: data.start_date || null,
          end_date: data.end_date || null,
          status: data.status,
          ensemble_type: selectedTemplate ? ENSEMBLE_LABELS[selectedTemplate] || null : null,
          client_name: data.client_name || null,
          client_email: data.client_email || null,
          client_phone: data.client_phone || null,
          event_type: data.event_type || null,
          contract_amount: data.contract_amount ?? null,
          deposit_amount: data.deposit_amount ?? null,
          deposit_paid_at: data.deposit_paid_at || null,
          payment_status: data.payment_status || 'pending',
          payment_notes: data.payment_notes || null,
          coordinator_name: data.coordinator_name || null,
          coordinator_email: data.coordinator_email || null,
          coordinator_phone: data.coordinator_phone || null,
        })
        .select('id')
        .single()

      if (insertError) {
        setError(insertError.message)
        setIsLoading(false)
        return
      }

      setIsLoading(false)
      onSuccess({
        id: newProject.id,
        start_date: data.start_date || null,
        end_date: data.end_date || null,
        template: selectedTemplate || undefined,
        callTime: isSingleDay && selectedTemplate !== 'custom' && selectedTemplate !== 'orchestra' ? callTime : undefined,
        startTime: isSingleDay && selectedTemplate !== 'custom' && selectedTemplate !== 'orchestra' ? startTime : undefined,
        endTime: isSingleDay && selectedTemplate !== 'custom' && selectedTemplate !== 'orchestra' ? endTime : undefined,
        venueName: venueName || undefined,
        venueId: venueId,
      })
      return
    }

    setIsLoading(false)
    onSuccess()
  }

  // Template picker step
  if (showTemplatePicker) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose a Template</DialogTitle>
            <DialogDescription>
              Start with a template or create from scratch.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {(Object.keys(TEMPLATES) as TemplateType[]).map((key) => {
              const t = TEMPLATES[key]
              return (
                <button
                  key={key}
                  type="button"
                  className="w-full rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 hover:border-primary/30"
                  onClick={() => handleTemplateSelect(key)}
                >
                  <p className="font-medium">{t.label}</p>
                  <p className="text-sm text-muted-foreground">{t.description}</p>
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Project' : 'Add Project'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the project details.'
              : 'A project represents a gig, concert, or event — it can include one or more rehearsals and performances.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Spring Concert 2026" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormLabel>Description</FormLabel>
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                      Shared with musicians
                    </span>
                  </div>
                  <FormControl>
                    <textarea
                      className="flex min-h-[80px] w-full rounded-md border border-input border-l-4 border-l-blue-400 dark:border-l-blue-600 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Project description..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="internal_notes"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormLabel>Internal Notes</FormLabel>
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                      </svg>
                      Team only
                    </span>
                  </div>
                  <FormControl>
                    <textarea
                      className="flex min-h-[80px] w-full rounded-md border border-input border-l-4 border-l-gray-300 dark:border-l-gray-600 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Internal notes..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSingleDay}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setIsSingleDay(checked)
                    if (checked) {
                      // Sync end_date to start_date
                      const startDate = form.getValues('start_date')
                      if (startDate) {
                        form.setValue('end_date', startDate)
                      }
                    }
                  }}
                  className="rounded border-input"
                />
                Single-day event
              </label>

              {isSingleDay ? (
                <>
                  <FormField
                    control={form.control}
                    name="start_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...(!isEditing ? { min: today } : {})}
                            value={field.value}
                            onChange={(e) => {
                              field.onChange(e)
                              form.setValue('end_date', e.target.value)
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {selectedTemplate !== null && selectedTemplate !== 'custom' && selectedTemplate !== 'orchestra' && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium leading-none">Call Time</label>
                        <TimePicker
                          value={callTime}
                          onChange={handleCallTimeChange}
                          placeholder="Call"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium leading-none">Start Time</label>
                        <TimePicker
                          value={startTime}
                          onChange={handleStartTimeChange}
                          placeholder="Start"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium leading-none">End Time</label>
                        <TimePicker
                          value={endTime}
                          onChange={handleEndTimeChange}
                          placeholder="End"
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="start_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...(!isEditing ? { min: today } : {})}
                            value={field.value}
                            onChange={(e) => {
                              const newValue = e.target.value
                              field.onChange(e)
                              const currentEndDate = form.getValues('end_date')
                              if (!currentEndDate && newValue && newValue.length === 10) {
                                form.setValue('end_date', newValue)
                              }
                            }}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">First rehearsal date</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="end_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...(!isEditing ? { min: today } : {})} {...field} />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Final performance date</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            {!isEditing && selectedTemplate && selectedTemplate !== 'custom' && (
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">
                  Performance Venue <span className="text-destructive">*</span>
                </label>
                <VenueSearch
                  value={venueName}
                  venueId={venueId}
                  organizationId={organizationId}
                  onChange={(name, id) => {
                    setVenueName(name)
                    setVenueId(id)
                  }}
                  placeholder="Search saved venues or enter address..."
                />
              </div>
            )}

            {/* Client & Booking — Collapsible */}
            <div className="border rounded-md">
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
                onClick={() => setBookingOpen(!bookingOpen)}
              >
                <div className="flex items-center gap-2">
                  <span>Client & Booking</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                    Team only
                  </span>
                </div>
                <svg
                  className={`h-4 w-4 transition-transform ${bookingOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {bookingOpen && (
                <div className="px-4 pb-4 space-y-4 border-t">
                  {/* Client Info */}
                  <div className="grid grid-cols-2 gap-3 pt-3">
                    <FormField
                      control={form.control}
                      name="client_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Jane Smith" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="event_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Event Type</FormLabel>
                          <FormControl>
                            <select
                              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              value={field.value || ''}
                              onChange={field.onChange}
                            >
                              <option value="">Select type...</option>
                              {EVENT_TYPES.map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="client_email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="client@example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="client_phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client Phone</FormLabel>
                          <FormControl>
                            <Input type="tel" placeholder="(555) 123-4567" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Coordinator / Venue Contact */}
                  <div className="pt-2">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Coordinator / Venue Contact</p>
                    <div className="grid grid-cols-3 gap-3">
                      <FormField
                        control={form.control}
                        name="coordinator_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. Sarah Kim" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="coordinator_email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="coordinator@venue.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="coordinator_phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone</FormLabel>
                            <FormControl>
                              <Input type="tel" placeholder="(555) 123-4567" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Financial */}
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="contract_amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contract Amount</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                className="pl-7"
                                placeholder="0.00"
                                value={field.value ?? ''}
                                onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="deposit_amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Deposit Amount</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                className="pl-7"
                                placeholder="0.00"
                                value={field.value ?? ''}
                                onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="payment_status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Payment Status</FormLabel>
                          <FormControl>
                            <select
                              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              value={field.value || 'pending'}
                              onChange={field.onChange}
                            >
                              {PAYMENT_STATUSES.map((s) => (
                                <option key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}</option>
                              ))}
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="deposit_paid_at"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Deposit Paid Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="payment_notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Notes</FormLabel>
                        <FormControl>
                          <textarea
                            className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            placeholder="e.g. 50% deposit due 2 weeks before event..."
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading
                  ? isEditing ? 'Saving...' : 'Creating...'
                  : isEditing ? 'Save Changes' : 'Create Project'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
