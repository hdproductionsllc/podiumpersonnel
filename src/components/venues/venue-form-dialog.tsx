'use client'

import { useState, useEffect } from 'react'
import { useLoadScript } from '@react-google-maps/api'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { VenueSearch } from '@/components/ui/venue-search'
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

  // Form state
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [zip, setZip] = useState('')
  const [googleMapsUrl, setGoogleMapsUrl] = useState('')
  const [googlePlaceId, setGooglePlaceId] = useState('')
  const [parkingInfo, setParkingInfo] = useState('')
  const [directions, setDirections] = useState('')
  const [notes, setNotes] = useState('')

  // For geocoding Google predictions
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''
  const { isLoaded: mapsLoaded } = useLoadScript({
    googleMapsApiKey: apiKey,
    libraries: MAPS_LIBRARIES,
  })

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (venue) {
        setName(venue.name)
        setAddress(venue.address || '')
        setCity(venue.city || '')
        setState(venue.state || '')
        setZip(venue.zip || '')
        setGoogleMapsUrl(venue.google_maps_url || '')
        setGooglePlaceId((venue as any).google_place_id || '')
        setParkingInfo(venue.parking_info || '')
        setDirections(venue.directions || '')
        setNotes(venue.notes || '')
      } else {
        setName('')
        setAddress('')
        setCity('')
        setState('')
        setZip('')
        setGoogleMapsUrl('')
        setGooglePlaceId('')
        setParkingInfo('')
        setDirections('')
        setNotes('')
      }
      setError(null)
    }
  }, [open, venue])

  function handleVenueSearchChange(
    venueName: string,
    _venueId: string | null,
    venueData?: Venue | null,
    placeId?: string | null,
  ) {
    setName(venueName)

    if (venueData) {
      // Selected a saved venue — copy its data
      setAddress(venueData.address || '')
      setCity(venueData.city || '')
      setState(venueData.state || '')
      setZip(venueData.zip || '')
      setGoogleMapsUrl(venueData.google_maps_url || '')
      setParkingInfo(venueData.parking_info || '')
      setDirections(venueData.directions || '')
      setNotes(venueData.notes || '')
    } else if (placeId && mapsLoaded) {
      // Selected a Google prediction — geocode to get address components
      setGooglePlaceId(placeId)
      const geocoder = new google.maps.Geocoder()
      geocoder.geocode({ placeId }, (results, status) => {
        if (status !== 'OK' || !results || results.length === 0) return
        const result = results[0]

        const components = result.address_components || []
        const get = (type: string) => components.find(c => c.types.includes(type))

        const streetNumber = get('street_number')?.long_name || ''
        const route = get('route')?.long_name || ''
        const streetAddress = [streetNumber, route].filter(Boolean).join(' ')

        setAddress(streetAddress)
        setCity(get('locality')?.long_name || get('sublocality')?.long_name || '')
        setState(get('administrative_area_level_1')?.short_name || '')
        setZip(get('postal_code')?.long_name || '')
        const queryParts = [venueName, streetAddress, get('locality')?.long_name || get('sublocality')?.long_name || '', get('administrative_area_level_1')?.short_name || '', get('postal_code')?.long_name || ''].filter(Boolean).join(', ')
        setGoogleMapsUrl(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryParts)}&query_place_id=${placeId}`)
      })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    // Generate Google Maps URL if address is provided but URL isn't
    let mapsUrl = googleMapsUrl || null
    if (!mapsUrl && address) {
      const addressParts = [address, city, state, zip].filter(Boolean)
      if (addressParts.length > 0) {
        mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressParts.join(', '))}`
      }
    }

    const payload = {
      name: name.trim(),
      address: address || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      google_place_id: googlePlaceId || null,
      google_maps_url: mapsUrl,
      parking_info: parkingInfo || null,
      directions: directions || null,
      notes: notes || null,
    }

    if (isEditing) {
      const { error: updateError } = await supabase
        .from('venues')
        .update(payload)
        .eq('id', venue.id)

      if (updateError) {
        setError(updateError.message)
        setIsLoading(false)
        return
      }
    } else {
      const { error: insertError } = await supabase
        .from('venues')
        .insert({ organization_id: organizationId, ...payload })

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
              : 'Search for a venue or enter a name to add it.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Venue <span className="text-destructive">*</span>
            </label>
            <VenueSearch
              value={name}
              venueId={null}
              organizationId={organizationId}
              onChange={handleVenueSearchChange}
              placeholder="Search venues or enter name..."
            />
          </div>

          {/* Show auto-filled address summary */}
          {(address || city) && (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {[address, city, state, zip].filter(Boolean).join(', ')}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Parking Information</label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Parking lot locations, valet info, validation details..."
              value={parkingInfo}
              onChange={(e) => setParkingInfo(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Directions & Access</label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Stage door location, who to see for access, load-in instructions..."
              value={directions}
              onChange={(e) => setDirections(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Additional Notes</label>
            <textarea
              className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Any other notes about this venue..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading
                ? isEditing ? 'Saving...' : 'Adding...'
                : isEditing ? 'Save Changes' : 'Add Venue'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
