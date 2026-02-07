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
  existingServiceCounts?: { rehearsal: number; performance: number }
  onSuccess: () => void
}

function getDefaultServiceName(
  type: 'rehearsal' | 'performance',
  counts: { rehearsal: number; performance: number }
): string {
  if (type === 'rehearsal') {
    const next = counts.rehearsal + 1
    if (next === 1) return 'Rehearsal 1'
    if (next === 2) return 'Dress Rehearsal'
    return `Rehearsal ${next}`
  }
  // performance
  const next = counts.performance + 1
  if (next === 1) return 'Performance'
  return `Performance ${next}`
}

/** Extract date part ("YYYY-MM-DD") from a datetime-local string */
function getDatePart(datetimeLocal: string): string {
  if (!datetimeLocal) return ''
  return datetimeLocal.split('T')[0] || ''
}

/** Extract time part ("HH:mm") from a datetime-local string */
function getTimePart(datetimeLocal: string): string {
  if (!datetimeLocal) return ''
  return datetimeLocal.split('T')[1] || ''
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
  existingServiceCounts,
  onSuccess,
}: ServiceFormDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateWarning, setDateWarning] = useState<string | null>(null)
  const isEditing = !!service

  // Separate state: date stored as "YYYY-MM-DD" via a date-only DateTimePicker,
  // times stored as "HH:mm" 24h strings via TimePicker components
  const [serviceDate, setServiceDate] = useState('')
  const [callTime, setCallTime] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')

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
        const ctLocal = service.call_time ? isoToDatetimeLocal(service.call_time, timezone) : ''
        const stLocal = isoToDatetimeLocal(service.start_time, timezone)
        const etLocal = service.end_time ? isoToDatetimeLocal(service.end_time, timezone) : ''

        setServiceDate(getDatePart(stLocal))
        setCallTime(getTimePart(ctLocal))
        setStartTime(getTimePart(stLocal))
        setEndTime(getTimePart(etLocal))

        form.reset({
          name: service.name,
          service_type: service.service_type as ServiceInput['service_type'],
          venue: service.venue || '',
          venue_id: service.venue_id || null,
          call_time: ctLocal,
          start_time: stLocal,
          end_time: etLocal,
          notes: service.notes || '',
          base_pay: (service as any).base_pay ?? null,
          leader_fee: (service as any).leader_fee ?? 50,
        })
      } else {
        const serviceType = initialServiceType || 'rehearsal'
        const counts = existingServiceCounts || { rehearsal: 0, performance: 0 }
        const defaultName = getDefaultServiceName(serviceType, counts)

        const dateToUse = projectStartDate || projectEndDate || ''
        const defaultStartTimeStr = serviceType === 'rehearsal' ? '10:00' : '19:00'
        const defaultEndH = serviceType === 'rehearsal' ? 13 : 22
        const defaultEndTimeStr = `${String(defaultEndH).padStart(2, '0')}:00`

        // Call time: 30 min before start
        const [sh, sm] = defaultStartTimeStr.split(':').map(Number)
        const callMins = sh * 60 + sm - 30
        const defaultCallTimeStr = `${String(Math.floor(callMins / 60)).padStart(2, '0')}:${String(callMins % 60).padStart(2, '0')}`

        setServiceDate(dateToUse)
        setCallTime(dateToUse ? defaultCallTimeStr : '')
        setStartTime(dateToUse ? defaultStartTimeStr : '')
        setEndTime(dateToUse ? defaultEndTimeStr : '')

        // Build datetime-local strings for form validation
        const stFull = dateToUse ? `${dateToUse}T${defaultStartTimeStr}` : ''
        const etFull = dateToUse ? `${dateToUse}T${defaultEndTimeStr}` : ''
        const ctFull = dateToUse ? `${dateToUse}T${defaultCallTimeStr}` : ''

        form.reset({
          name: defaultName,
          service_type: serviceType,
          venue: '',
          venue_id: null,
          call_time: ctFull,
          start_time: stFull,
          end_time: etFull,
          notes: '',
          base_pay: null,
          leader_fee: 50,
        })
      }
      setError(null)
      setDateWarning(null)
    }
  }, [open, service, form, initialServiceType, existingServiceCounts, projectStartDate, projectEndDate])

  // Sync form hidden fields whenever date/time parts change
  function syncFormFields(date: string, call: string, start: string, end: string) {
    form.setValue('start_time', date && start ? `${date}T${start}` : '')
    form.setValue('call_time', date && call ? `${date}T${call}` : '')
    form.setValue('end_time', date && end ? `${date}T${end}` : '')
  }

  function handleDateChange(datetimeLocalValue: string) {
    // DateTimePicker gives us "YYYY-MM-DDTHH:mm", we only need the date part
    const datePart = getDatePart(datetimeLocalValue)
    setServiceDate(datePart)
    syncFormFields(datePart, callTime, startTime, endTime)

    if (datePart) {
      checkDateRange(datePart)
    }
  }

  function handleStartTimeChange(time: string) {
    setStartTime(time)

    if (time) {
      const [hours, minutes] = time.split(':').map(Number)

      // End time: 3 hours after start
      const endH = hours + 3
      const newEndTime = `${String(endH).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
      setEndTime(newEndTime)

      // Call time: 30 min before start
      const totalMins = hours * 60 + minutes - 30
      const callH = Math.floor(totalMins / 60)
      const callM = totalMins % 60
      const newCallTime = `${String(callH).padStart(2, '0')}:${String(callM).padStart(2, '0')}`
      setCallTime(newCallTime)

      syncFormFields(serviceDate, newCallTime, time, newEndTime)
    } else {
      syncFormFields(serviceDate, callTime, time, endTime)
    }
  }

  function handleCallTimeChange(time: string) {
    setCallTime(time)
    syncFormFields(serviceDate, time, startTime, endTime)
  }

  function handleEndTimeChange(time: string) {
    setEndTime(time)
    syncFormFields(serviceDate, callTime, startTime, time)
  }

  function checkDateRange(dateStr: string) {
    if (!projectStartDate && !projectEndDate) {
      setDateWarning(null)
      return
    }

    if (projectStartDate && dateStr < projectStartDate) {
      setDateWarning(`This service is before the project start date (${projectStartDate})`)
    } else if (projectEndDate && dateStr > projectEndDate) {
      setDateWarning(`This service is after the project end date (${projectEndDate})`)
    } else {
      setDateWarning(null)
    }
  }

  async function onSubmit(data: ServiceInput) {
    setIsLoading(true)
    setError(null)

    // Validate time ordering
    if (startTime && endTime && endTime <= startTime) {
      setError('End time must be after start time.')
      setIsLoading(false)
      return
    }
    if (callTime && startTime && callTime > startTime) {
      setError('Call time should be before start time.')
      setIsLoading(false)
      return
    }

    // Recombine date + times into datetime-local strings
    const finalStartTime = serviceDate && startTime ? `${serviceDate}T${startTime}` : data.start_time
    const finalCallTime = serviceDate && callTime ? `${serviceDate}T${callTime}` : data.call_time
    const finalEndTime = serviceDate && endTime ? `${serviceDate}T${endTime}` : data.end_time

    const supabase = createClient()

    if (isEditing) {
      const { error: updateError } = await supabase
        .from('services')
        .update({
          name: data.name,
          service_type: data.service_type,
          venue: data.venue || null,
          venue_id: data.venue_id || null,
          call_time: finalCallTime ? datetimeLocalToISO(finalCallTime, timezone) : null,
          start_time: datetimeLocalToISO(finalStartTime, timezone),
          end_time: finalEndTime ? datetimeLocalToISO(finalEndTime, timezone) : null,
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
          call_time: finalCallTime ? datetimeLocalToISO(finalCallTime, timezone) : null,
          start_time: datetimeLocalToISO(finalStartTime, timezone),
          end_time: finalEndTime ? datetimeLocalToISO(finalEndTime, timezone) : null,
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

  // Build a datetime-local value for the date-only picker (uses noon as dummy time)
  const datepickerValue = serviceDate ? `${serviceDate}T12:00` : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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
                  <FormLabel required>Name</FormLabel>
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

            {/* Service Date */}
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Service Date</label>
              <DateTimePicker
                value={datepickerValue}
                onChange={handleDateChange}
                placeholder="Select date"
                defaultMonth={projectStartDate ? new Date(projectStartDate + 'T12:00:00') : undefined}
                dateOnly
              />
            </div>

            {dateWarning && (
              <div className="rounded-md bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 p-3 text-sm text-yellow-800 dark:text-yellow-200">
                {dateWarning}
              </div>
            )}

            {/* Times row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium leading-none">Call Time</label>
                <TimePicker
                  value={callTime}
                  onChange={handleCallTimeChange}
                  placeholder="Call"
                />
                <p className="text-xs text-muted-foreground">Arrival</p>
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
                <p className="text-xs text-muted-foreground">Auto +3h</p>
              </div>
            </div>

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
                      <p className="text-xs text-muted-foreground">Per musician per service</p>
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
