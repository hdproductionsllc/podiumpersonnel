'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useLoadScript, Autocomplete } from '@react-google-maps/api'
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

const MAPS_LIBRARIES: ('places')[] = ['places']

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

  // Fix: Radix Dialog sets pointer-events: none on <body>, which blocks
  // Google's .pac-container autocomplete dropdown (appended to <body>).
  // Restore pointer-events so the dropdown is clickable.
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        document.body.style.pointerEvents = ''
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [open])

  // Google Places autocomplete using the Autocomplete widget
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''
  const { isLoaded: mapsLoaded } = useLoadScript({
    googleMapsApiKey: apiKey,
    libraries: MAPS_LIBRARIES,
  })
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)

  function onAutocompleteLoad(autocomplete: google.maps.places.Autocomplete) {
    autocompleteRef.current = autocomplete
  }

  function onPlaceChanged() {
    if (!autocompleteRef.current) return
    const place = autocompleteRef.current.getPlace()
    if (!place) return

    // Extract address components
    const components = place.address_components || []
    const get = (type: string) => components.find(c => c.types.includes(type))

    const streetNumber = get('street_number')?.long_name || ''
    const route = get('route')?.long_name || ''
    const streetAddress = [streetNumber, route].filter(Boolean).join(' ')
    const city = get('locality')?.long_name || get('sublocality')?.long_name || ''
    const state = get('administrative_area_level_1')?.short_name || ''
    const zip = get('postal_code')?.long_name || ''

    if (place.name) form.setValue('name', place.name, { shouldDirty: true })
    if (streetAddress) form.setValue('address', streetAddress, { shouldDirty: true })
    if (city) form.setValue('city', city, { shouldDirty: true })
    if (state) form.setValue('state', state, { shouldDirty: true })
    if (zip) form.setValue('zip', zip, { shouldDirty: true })
    if (place.url) form.setValue('google_maps_url', place.url, { shouldDirty: true })
  }

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
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => {
          // Prevent dialog from closing when clicking Google autocomplete suggestions
          const target = e.target as Element | null
          if (target?.closest?.('.pac-container')) {
            e.preventDefault()
          }
        }}
      >
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
                    {apiKey && mapsLoaded ? (
                      <Autocomplete
                        onLoad={onAutocompleteLoad}
                        onPlaceChanged={onPlaceChanged}
                        options={{
                          types: ['establishment', 'geocode'],
                          fields: ['name', 'address_components', 'formatted_address', 'url', 'geometry'],
                        }}
                      >
                        <Input
                          placeholder="e.g. Symphony Hall or 123 Main St"
                          {...field}
                          autoComplete="off"
                        />
                      </Autocomplete>
                    ) : (
                      <Input
                        placeholder="e.g. Symphony Hall"
                        {...field}
                      />
                    )}
                  </FormControl>
                  {apiKey && mapsLoaded && (
                    <p className="text-xs text-muted-foreground">
                      Start typing to search Google Maps and auto-fill address fields
                    </p>
                  )}
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
