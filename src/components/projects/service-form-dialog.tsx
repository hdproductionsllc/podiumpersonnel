'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { formatInTimeZone } from 'date-fns-tz/formatInTimeZone'
import { fromZonedTime } from 'date-fns-tz/fromZonedTime'
import {
  serviceSchema,
  type ServiceInput,
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
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
import { DateTimePicker } from '@/components/ui/datetime-picker'
import { VenueSearch } from '@/components/ui/venue-search'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import type { Service } from '@/types'

/** Convert a UTC ISO string to a datetime-local value in the org's timezone */
function isoToDatetimeLocal(iso: string, tz: string): string {
  return formatInTimeZone(new Date(iso), tz, "yyyy-MM-dd'T'HH:mm")
}

/** Convert a datetime-local value (in org timezone) back to a UTC ISO string */
function datetimeLocalToISO(localStr: string, tz: string): string {
  return fromZonedTime(localStr, tz).toISOString()
}

interface ServiceFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  service: Service | null
  projectId: string | null
  projectStartDate?: string | null
  projectEndDate?: string | null
  organizationId: string
  timezone: string
  initialServiceType?: 'rehearsal' | 'performance'
  onSuccess: () => void
}

export function ServiceFormDialog({
  open,
  onOpenChange,
  service,
  projectId,
  projectStartDate,
  projectEndDate,
  organizationId,
  timezone,
  initialServiceType,
  onSuccess,
}: ServiceFormDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateWarning, setDateWarning] = useState<string | null>(null)
  const isEditing = !!service

  const form = useForm<ServiceInput>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: '',
      service_type: 'rehearsal',
      venue: '',
      venue_id: null,
      call_time: '',
      start_time: '',
      end_time: '',
      notes: '',
      base_pay: null,
      leader_fee: 50,
    },
  })

  useEffect(() => {
    if (open) {
      if (service) {
        form.reset({
          name: service.name,
          service_type: service.service_type as ServiceInput['service_type'],
          venue: service.venue || '',
          venue_id: service.venue_id || null,
          call_time: service.call_time ? isoToDatetimeLocal(service.call_time, timezone) : '',
          start_time: isoToDatetimeLocal(service.start_time, timezone),
          end_time: service.end_time ? isoToDatetimeLocal(service.end_time, timezone) : '',
          notes: service.notes || '',
          base_pay: (service as any).base_pay ?? null,
          leader_fee: (service as any).leader_fee ?? 50,
        })
      } else {
        // Auto-populate date from project dates
        let defaultStartTime = ''
        let defaultEndTime = ''
        const dateToUse = projectStartDate || projectEndDate
        if (dateToUse) {
          // Default to 7:00 PM start time
          defaultStartTime = `${dateToUse}T19:00`
          // Default to 10:00 PM end time (3 hours later)
          defaultEndTime = `${dateToUse}T22:00`
        }

        // Default call time to 30 min before start
        let defaultCallTime = ''
        if (defaultStartTime) {
          const [dp, tp] = defaultStartTime.split('T')
          const [h, m] = tp.split(':').map(Number)
          const totalMins = h * 60 + m - 30
          const ch = Math.floor(totalMins / 60)
          const cm = totalMins % 60
          defaultCallTime = `${dp}T${String(ch).padStart(2, '0')}:${String(cm).padStart(2, '0')}`
        }

        form.reset({
          name: '',
          service_type: initialServiceType || 'rehearsal',
          venue: '',
          venue_id: null,
          call_time: defaultCallTime,
          start_time: defaultStartTime,
          end_time: defaultEndTime,
          notes: '',
          base_pay: null,
          leader_fee: 50,
        })
      }
      setError(null)
      setDateWarning(null)
    }
  }, [open, service, form, initialServiceType, projectStartDate, projectEndDate])

  // Auto-populate call_time and end_time when start time changes
  function handleStartTimeChange(value: string) {
    form.setValue('start_time', value)

    if (value) {
      // Parse datetime-local string directly as local parts (no UTC conversion)
      const [datePart, timePart] = value.split('T')
      const [hours, minutes] = timePart.split(':').map(Number)

      // End time: 3 hours after start
      const endHours = hours + 3
      const endTimeStr = `${datePart}T${String(endHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
      form.setValue('end_time', endTimeStr)

      // Call time: 30 min before start
      const totalMins = hours * 60 + minutes - 30
      const callH = Math.floor(totalMins / 60)
      const callM = totalMins % 60
      const callTimeStr = `${datePart}T${String(callH).padStart(2, '0')}:${String(callM).padStart(2, '0')}`
      form.setValue('call_time', callTimeStr)

      // Check if date is within project range
      checkDateRange(value)
    }
  }

  function checkDateRange(dateTimeStr: string) {
    if (!projectStartDate && !projectEndDate) {
      setDateWarning(null)
      return
    }

    const serviceDate = new Date(dateTimeStr).toISOString().split('T')[0]

    if (projectStartDate && serviceDate < projectStartDate) {
      setDateWarning(`This service is before the project start date (${projectStartDate})`)
    } else if (projectEndDate && serviceDate > projectEndDate) {
      setDateWarning(`This service is after the project end date (${projectEndDate})`)
    } else {
      setDateWarning(null)
    }
  }

  async function onSubmit(data: ServiceInput) {
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    if (isEditing) {
      const { error: updateError } = await supabase
        .from('services')
        .update({
          name: data.name,
          service_type: data.service_type,
          venue: data.venue || null,
          venue_id: data.venue_id || null,
          call_time: data.call_time ? datetimeLocalToISO(data.call_time, timezone) : null,
          start_time: datetimeLocalToISO(data.start_time, timezone),
          end_time: data.end_time ? datetimeLocalToISO(data.end_time, timezone) : null,
          notes: data.notes || null,
          base_pay: data.base_pay ?? null,
          leader_fee: data.leader_fee ?? 50,
        })
        .eq('id', service.id)

      if (updateError) {
        setError(updateError.message)
        setIsLoading(false)
        return
      }
    } else {
      if (!projectId) {
        setError('No project selected')
        setIsLoading(false)
        return
      }

      const { error: insertError } = await supabase
        .from('services')
        .insert({
          project_id: projectId,
          name: data.name,
          service_type: data.service_type,
          venue: data.venue || null,
          venue_id: data.venue_id || null,
          call_time: data.call_time ? datetimeLocalToISO(data.call_time, timezone) : null,
          start_time: datetimeLocalToISO(data.start_time, timezone),
          end_time: data.end_time ? datetimeLocalToISO(data.end_time, timezone) : null,
          notes: data.notes || null,
          base_pay: data.base_pay ?? null,
          leader_fee: data.leader_fee ?? 50,
        })

      if (insertError) {
        setError(insertError.message)
        setIsLoading(false)
        return
      }
    }

    setIsLoading(false)
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Service' : 'Add Service'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the service details.'
              : 'Add a new service to this project.'}
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
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Rehearsal 1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="service_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <FormControl>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      {...field}
                    >
                      {SERVICE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {SERVICE_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="call_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Call Time</FormLabel>
                    <FormControl>
                      <DateTimePicker
                        value={field.value || ''}
                        onChange={field.onChange}
                        placeholder="Call time"
                        defaultMonth={projectStartDate ? new Date(projectStartDate + 'T12:00:00') : undefined}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">When musicians arrive</p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="start_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time</FormLabel>
                    <FormControl>
                      <DateTimePicker
                        value={field.value}
                        onChange={(val) => handleStartTimeChange(val)}
                        placeholder="Start time"
                        defaultMonth={projectStartDate ? new Date(projectStartDate + 'T12:00:00') : undefined}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time</FormLabel>
                    <FormControl>
                      <DateTimePicker
                        value={field.value || ''}
                        onChange={field.onChange}
                        placeholder="End time"
                        defaultMonth={projectStartDate ? new Date(projectStartDate + 'T12:00:00') : undefined}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Auto-fills 3h after start</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {dateWarning && (
              <div className="rounded-md bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 p-3 text-sm text-yellow-800 dark:text-yellow-200">
                {dateWarning}
              </div>
            )}

            <FormField
              control={form.control}
              name="venue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Venue</FormLabel>
                  <FormControl>
                    <VenueSearch
                      value={field.value || ''}
                      venueId={form.watch('venue_id') ?? null}
                      organizationId={organizationId}
                      onChange={(venueName, venueId) => {
                        field.onChange(venueName)
                        form.setValue('venue_id', venueId)
                      }}
                      placeholder="Search saved venues or enter address..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <textarea
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Additional notes..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="border-t pt-4 mt-4">
              <h4 className="text-sm font-medium mb-3">Pay</h4>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="base_pay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base Pay ($)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="e.g. 200"
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="leader_fee"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Leader Fee ($)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="e.g. 50"
                          value={field.value ?? 50}
                          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : 50)}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">Added to Violin 1 / Chair 1</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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
                  ? isEditing ? 'Saving...' : 'Adding...'
                  : isEditing ? 'Save Changes' : 'Add Service'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
