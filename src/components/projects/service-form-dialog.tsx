'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import type { Service, Venue } from '@/types'

interface VenueOption {
  id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  google_maps_url: string | null
  parking_info: string | null
  directions: string | null
}

function isoToDatetimeLocal(iso: string): string {
  const date = new Date(iso)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

interface ServiceFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  service: Service | null
  projectId: string | null
  projectStartDate?: string | null
  projectEndDate?: string | null
  organizationId: string
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
  onSuccess,
}: ServiceFormDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateWarning, setDateWarning] = useState<string | null>(null)
  const [venues, setVenues] = useState<VenueOption[]>([])
  const [selectedVenue, setSelectedVenue] = useState<VenueOption | null>(null)
  const isEditing = !!service

  // Fetch venues when dialog opens
  useEffect(() => {
    if (open && organizationId) {
      const supabase = createClient()
      supabase
        .from('venues')
        .select('id, name, address, city, state, google_maps_url, parking_info, directions')
        .eq('organization_id', organizationId)
        .order('name')
        .then(({ data }) => {
          setVenues(data || [])
        })
    }
  }, [open, organizationId])

  const form = useForm<ServiceInput>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: '',
      service_type: 'rehearsal',
      venue: '',
      start_time: '',
      end_time: '',
      notes: '',
    },
  })

  useEffect(() => {
    if (open) {
      if (service) {
        form.reset({
          name: service.name,
          service_type: service.service_type as ServiceInput['service_type'],
          venue: service.venue || '',
          start_time: isoToDatetimeLocal(service.start_time),
          end_time: service.end_time ? isoToDatetimeLocal(service.end_time) : '',
          notes: service.notes || '',
        })
      } else {
        form.reset({
          name: '',
          service_type: 'rehearsal',
          venue: '',
          start_time: '',
          end_time: '',
          notes: '',
        })
      }
      setError(null)
      setDateWarning(null)
    }
  }, [open, service, form])

  // Auto-populate end time when start time changes (3 hours later)
  function handleStartTimeChange(value: string) {
    form.setValue('start_time', value)

    if (value) {
      const startDate = new Date(value)
      const endDate = new Date(startDate.getTime() + 3 * 60 * 60 * 1000) // Add 3 hours
      const endTimeStr = endDate.toISOString().slice(0, 16)
      form.setValue('end_time', endTimeStr)

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
          start_time: data.start_time,
          end_time: data.end_time || null,
          notes: data.notes || null,
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
          start_time: data.start_time,
          end_time: data.end_time || null,
          notes: data.notes || null,
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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...field}
                        onChange={(e) => handleStartTimeChange(e.target.value)}
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
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Auto-fills 3 hours after start</p>
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
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={field.value}
                      onChange={(e) => {
                        field.onChange(e.target.value)
                        const venue = venues.find(v => v.name === e.target.value)
                        setSelectedVenue(venue || null)
                      }}
                    >
                      <option value="">-- Select venue --</option>
                      {venues.map((v) => (
                        <option key={v.id} value={v.name}>
                          {v.name}
                        </option>
                      ))}
                      <option value="__other__">Other (type below)</option>
                    </select>
                  </FormControl>
                  {field.value === '__other__' && (
                    <Input
                      className="mt-2"
                      placeholder="Enter venue name"
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedVenue && (
              <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
                {selectedVenue.address && (
                  <div>
                    <span className="font-medium">Address: </span>
                    <span className="text-muted-foreground">
                      {[selectedVenue.address, selectedVenue.city, selectedVenue.state].filter(Boolean).join(', ')}
                    </span>
                    {selectedVenue.google_maps_url && (
                      <a
                        href={selectedVenue.google_maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-blue-600 hover:underline"
                      >
                        Get Directions
                      </a>
                    )}
                  </div>
                )}
                {selectedVenue.parking_info && (
                  <div>
                    <span className="font-medium">Parking: </span>
                    <span className="text-muted-foreground">{selectedVenue.parking_info}</span>
                  </div>
                )}
                {selectedVenue.directions && (
                  <div>
                    <span className="font-medium">Directions: </span>
                    <span className="text-muted-foreground">{selectedVenue.directions}</span>
                  </div>
                )}
              </div>
            )}

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
