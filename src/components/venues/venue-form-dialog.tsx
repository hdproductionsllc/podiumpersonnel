'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useLoadScript } from '@react-google-maps/api'
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

  // Google Places autocomplete — same pattern as VenueSearch component.
  // Uses AutocompleteService + custom React dropdown (no .pac-container),
  // so it works inside Radix Dialog without z-index/pointer-events issues.
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''
  const { isLoaded: mapsLoaded } = useLoadScript({
    googleMapsApiKey: apiKey,
    libraries: MAPS_LIBRARIES,
  })
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null)
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([])
  const [showPredictions, setShowPredictions] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Initialize AutocompleteService when script loads
  useEffect(() => {
    if (mapsLoaded && apiKey) {
      autocompleteServiceRef.current = new google.maps.places.AutocompleteService()
    }
  }, [mapsLoaded, apiKey])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowPredictions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Fetch predictions (debounced) — same as VenueSearch
  const fetchPredictions = useCallback((input: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!autocompleteServiceRef.current || input.trim().length < 3) {
      setPredictions([])
      return
    }
    debounceRef.current = setTimeout(() => {
      autocompleteServiceRef.current!.getPlacePredictions(
        { input, types: ['establishment', 'geocode'] },
        (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && results) {
            setPredictions(results)
            setShowPredictions(true)
          } else {
            setPredictions([])
          }
        }
      )
    }, 300)
  }, [])

  // When user picks a prediction, geocode it to get address components
  function selectPrediction(prediction: google.maps.places.AutocompletePrediction) {
    setShowPredictions(false)
    setPredictions([])

    // Set the name immediately from the prediction
    form.setValue('name', prediction.structured_formatting.main_text, { shouldDirty: true })

    // Use Geocoder to get address components (no DOM node needed, unlike PlacesService)
    const geocoder = new google.maps.Geocoder()
    geocoder.geocode({ placeId: prediction.place_id }, (results, status) => {
      if (status !== 'OK' || !results || results.length === 0) return
      const result = results[0]

      const components = result.address_components || []
      const get = (type: string) => components.find(c => c.types.includes(type))

      const streetNumber = get('street_number')?.long_name || ''
      const route = get('route')?.long_name || ''
      const streetAddress = [streetNumber, route].filter(Boolean).join(' ')
      const city = get('locality')?.long_name || get('sublocality')?.long_name || ''
      const state = get('administrative_area_level_1')?.short_name || ''
      const zip = get('postal_code')?.long_name || ''

      if (streetAddress) form.setValue('address', streetAddress, { shouldDirty: true })
      if (city) form.setValue('city', city, { shouldDirty: true })
      if (state) form.setValue('state', state, { shouldDirty: true })
      if (zip) form.setValue('zip', zip, { shouldDirty: true })

      // Build Google Maps URL from the place
      const mapsUrl = `https://www.google.com/maps/place/?q=place_id:${prediction.place_id}`
      form.setValue('google_maps_url', mapsUrl, { shouldDirty: true })
    })
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
      setPredictions([])
      setShowPredictions(false)
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
                  <div className="relative" ref={wrapperRef}>
                    <FormControl>
                      <Input
                        placeholder="e.g. Symphony Hall or 123 Main St"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e)
                          if (mapsLoaded && apiKey) {
                            fetchPredictions(e.target.value)
                          }
                        }}
                        onFocus={() => {
                          if (predictions.length > 0) setShowPredictions(true)
                        }}
                        autoComplete="off"
                      />
                    </FormControl>
                    {showPredictions && predictions.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-60 overflow-auto">
                        <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                          Suggestions
                        </div>
                        {predictions.map((prediction) => (
                          <button
                            key={prediction.place_id}
                            type="button"
                            className="w-full px-3 py-2 text-left hover:bg-muted flex flex-col gap-0.5"
                            onClick={() => selectPrediction(prediction)}
                          >
                            <span className="font-medium text-sm">
                              {prediction.structured_formatting.main_text}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {prediction.structured_formatting.secondary_text}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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
