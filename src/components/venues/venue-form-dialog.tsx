'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { venueSchema, type VenueInput } from '@/lib/validations/venues'
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
import type { Venue } from '@/types'

interface VenueFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  venue: Venue | null
  organizationId: string
  onSuccess: () => void
}

export function VenueFormDialog({
  open,
  onOpenChange,
  venue,
  organizationId,
  onSuccess,
}: VenueFormDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEditing = !!venue

  const form = useForm<VenueInput>({
    resolver: zodResolver(venueSchema),
    defaultValues: {
      name: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      google_maps_url: '',
      parking_info: '',
      directions: '',
      notes: '',
    },
  })

  useEffect(() => {
    if (open) {
      if (venue) {
        form.reset({
          name: venue.name,
          address: venue.address || '',
          city: venue.city || '',
          state: venue.state || '',
          zip: venue.zip || '',
          google_maps_url: venue.google_maps_url || '',
          parking_info: venue.parking_info || '',
          directions: venue.directions || '',
          notes: venue.notes || '',
        })
      } else {
        form.reset({
          name: '',
          address: '',
          city: '',
          state: '',
          zip: '',
          google_maps_url: '',
          parking_info: '',
          directions: '',
          notes: '',
        })
      }
      setError(null)
    }
  }, [open, venue, form])

  async function onSubmit(data: VenueInput) {
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    // Generate Google Maps URL if address is provided but URL isn't
    let mapsUrl = data.google_maps_url || null
    if (!mapsUrl && data.address) {
      const addressParts = [data.address, data.city, data.state, data.zip].filter(Boolean)
      if (addressParts.length > 0) {
        mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressParts.join(', '))}`
      }
    }

    if (isEditing) {
      const { error: updateError } = await supabase
        .from('venues')
        .update({
          name: data.name,
          address: data.address || null,
          city: data.city || null,
          state: data.state || null,
          zip: data.zip || null,
          google_maps_url: mapsUrl,
          parking_info: data.parking_info || null,
          directions: data.directions || null,
          notes: data.notes || null,
        })
        .eq('id', venue.id)

      if (updateError) {
        setError(updateError.message)
        setIsLoading(false)
        return
      }
    } else {
      const { error: insertError } = await supabase
        .from('venues')
        .insert({
          organization_id: organizationId,
          name: data.name,
          address: data.address || null,
          city: data.city || null,
          state: data.state || null,
          zip: data.zip || null,
          google_maps_url: mapsUrl,
          parking_info: data.parking_info || null,
          directions: data.directions || null,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Venue' : 'Add Venue'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the venue details.'
              : 'Add a new venue for your services.'}
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
                  <FormLabel required>Venue Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Symphony Hall" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Street Address</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. 123 Main St" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="City" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State</FormLabel>
                    <FormControl>
                      <Input placeholder="CA" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="zip"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ZIP</FormLabel>
                    <FormControl>
                      <Input placeholder="90210" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="google_maps_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Google Maps Link</FormLabel>
                  <FormControl>
                    <Input placeholder="https://maps.google.com/..." {...field} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Auto-generated from address if left blank
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="parking_info"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parking Information</FormLabel>
                  <FormControl>
                    <textarea
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Parking lot locations, valet info, validation details..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="directions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Directions & Access</FormLabel>
                  <FormControl>
                    <textarea
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Stage door location, who to see for access, load-in instructions..."
                      {...field}
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
                  <FormLabel>Additional Notes</FormLabel>
                  <FormControl>
                    <textarea
                      className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Any other notes about this venue..."
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
                  : isEditing ? 'Save Changes' : 'Add Venue'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
