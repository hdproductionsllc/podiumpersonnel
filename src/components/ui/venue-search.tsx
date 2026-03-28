'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useLoadScript } from '@react-google-maps/api'
import { createClient } from '@/lib/supabase/client'
import { Input } from './input'
import type { Venue } from '@/types'

const libraries: ('places')[] = ['places']

export interface GooglePlaceData {
  placeId: string
  name: string
  address: string
  city: string
  state: string
  zip: string
  googleMapsUrl: string
}

interface VenueSearchProps {
  value: string
  venueId: string | null
  organizationId: string
  onChange: (venue: string, venueId: string | null, venueData?: Venue | null, placeId?: string | null, googlePlaceData?: GooglePlaceData | null) => void
  placeholder?: string
  className?: string
}

export function VenueSearch({
  value,
  venueId,
  organizationId,
  onChange,
  placeholder = 'Search saved venues or enter address...',
  className,
}: VenueSearchProps) {
  const [inputValue, setInputValue] = useState(value)
  const [venues, setVenues] = useState<Venue[]>([])
  const [filteredVenues, setFilteredVenues] = useState<Venue[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([])
  const wrapperRef = useRef<HTMLDivElement>(null)
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''

  const { isLoaded } = useLoadScript({
    googleMapsApiKey: apiKey,
    libraries,
  })

  // Initialize AutocompleteService when the script loads
  useEffect(() => {
    if (isLoaded && apiKey) {
      autocompleteServiceRef.current = new google.maps.places.AutocompleteService()
    }
  }, [isLoaded, apiKey])

  // Fetch venues on mount
  useEffect(() => {
    async function fetchVenues() {
      setIsLoading(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('venues')
        .select('*')
        .eq('organization_id', organizationId)
        .order('name', { ascending: true })

      setVenues(data || [])
      setIsLoading(false)

      // If we have a venueId, find and set the selected venue
      if (venueId && data) {
        const found = data.find((v) => v.id === venueId)
        if (found) {
          setSelectedVenue(found)
          setInputValue(found.name)
        }
      }
    }

    fetchVenues()
  }, [organizationId, venueId])

  // Sync external value changes
  useEffect(() => {
    if (!venueId) {
      setInputValue(value)
      setSelectedVenue(null)
    }
  }, [value, venueId])

  // Filter venues based on search
  useEffect(() => {
    if (!inputValue.trim()) {
      setFilteredVenues(venues)
    } else {
      const query = inputValue.toLowerCase()
      const filtered = venues.filter((v) => {
        const nameMatch = v.name.toLowerCase().includes(query)
        const addressMatch = v.address?.toLowerCase().includes(query)
        const cityMatch = v.city?.toLowerCase().includes(query)
        return nameMatch || addressMatch || cityMatch
      })
      setFilteredVenues(filtered)
    }
  }, [inputValue, venues])

  // Fetch Google Places predictions (debounced)
  const fetchPredictions = useCallback(
    (input: string) => {
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
            } else {
              setPredictions([])
            }
          }
        )
      }, 300)
    },
    []
  )

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Handle click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newValue = e.target.value
    setInputValue(newValue)
    setIsOpen(true)
    setSelectedVenue(null)
    // When typing, clear the venue_id and just pass the text
    onChange(newValue, null, null)
    // Fetch Google Places predictions
    fetchPredictions(newValue)
  }

  function handleVenueSelect(venue: Venue) {
    setInputValue(venue.name)
    setSelectedVenue(venue)
    setIsOpen(false)
    setPredictions([])
    onChange(venue.name, venue.id, venue)
  }

  function handlePredictionSelect(prediction: google.maps.places.AutocompletePrediction) {
    const placeName = prediction.structured_formatting.main_text
    console.log('[VenueSearch] Prediction selected:', { placeName, placeId: prediction.place_id, isLoaded })
    setInputValue(placeName)
    setIsOpen(false)
    setPredictions([])
    setSelectedVenue(null)

    // Geocode to extract full address data
    if (isLoaded && prediction.place_id) {
      const geocoder = new google.maps.Geocoder()
      geocoder.geocode({ placeId: prediction.place_id }, (results, status) => {
        console.log('[VenueSearch] Geocode result:', { status, hasResults: !!results?.length })
        if (status !== 'OK' || !results || results.length === 0) {
          onChange(placeName, null, null, prediction.place_id, null)
          return
        }
        const result = results[0]
        const components = result.address_components || []
        const get = (type: string) => components.find(c => c.types.includes(type))

        const streetNumber = get('street_number')?.long_name || ''
        const route = get('route')?.long_name || ''

        const placeAddress = [streetNumber, route].filter(Boolean).join(' ')
        const placeCity = get('locality')?.long_name || get('sublocality')?.long_name || ''
        const placeState = get('administrative_area_level_1')?.short_name || ''
        const placeZip = get('postal_code')?.long_name || ''
        const queryParts = [placeName, placeAddress, placeCity, placeState, placeZip].filter(Boolean).join(', ')

        const placeData: GooglePlaceData = {
          placeId: prediction.place_id,
          name: placeName,
          address: placeAddress,
          city: placeCity,
          state: placeState,
          zip: placeZip,
          googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryParts)}&query_place_id=${prediction.place_id}`,
        }

        onChange(placeName, null, null, prediction.place_id, placeData)
      })
    } else {
      onChange(placeName, null, null, prediction.place_id, null)
    }
  }

  function handleClearVenue() {
    setInputValue('')
    setSelectedVenue(null)
    setPredictions([])
    onChange('', null, null)
  }

  function formatAddress(venue: Venue): string {
    const parts = [venue.address, venue.city, venue.state, venue.zip].filter(Boolean)
    return parts.join(', ')
  }

  const hasDropdownContent = filteredVenues.length > 0 || predictions.length > 0 || venues.length > 0

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={isLoading ? 'Loading venues...' : placeholder}
          className={className}
          disabled={isLoading}
        />
        {selectedVenue && (
          <button
            type="button"
            onClick={handleClearVenue}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && !isLoading && hasDropdownContent && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-64 overflow-auto">
          {/* Saved Venues Section */}
          {filteredVenues.length > 0 && (
            <>
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                Saved Venues
              </div>
              {filteredVenues.map((venue) => (
                <button
                  key={venue.id}
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-muted flex flex-col gap-0.5"
                  onClick={() => handleVenueSelect(venue)}
                >
                  <span className="font-medium text-sm">{venue.name}</span>
                  {(venue.address || venue.city) && (
                    <span className="text-xs text-muted-foreground">
                      {formatAddress(venue)}
                    </span>
                  )}
                </button>
              ))}
            </>
          )}

          {/* Google Places Suggestions Section */}
          {predictions.length > 0 && (
            <>
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                Suggestions
              </div>
              {predictions.map((prediction) => (
                <button
                  key={prediction.place_id}
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-muted flex flex-col gap-0.5"
                  onClick={() => handlePredictionSelect(prediction)}
                >
                  <span className="font-medium text-sm">
                    {prediction.structured_formatting.main_text}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {prediction.structured_formatting.secondary_text}
                  </span>
                </button>
              ))}
            </>
          )}

          {/* Empty states when no saved venues match and no predictions */}
          {filteredVenues.length === 0 && predictions.length === 0 && (
            venues.length > 0 ? (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                No saved venues match &quot;{inputValue}&quot;
                <p className="text-xs mt-1">Enter a custom address or add this venue in Settings</p>
              </div>
            ) : (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                No saved venues yet
                <p className="text-xs mt-1">Add venues in the Venues page, or enter an address directly</p>
              </div>
            )
          )}
        </div>
      )}

      {/* Selected venue details */}
      {selectedVenue && (
        <div className="mt-2 rounded-md border bg-muted/30 p-3 text-sm space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300">
              Saved Venue
            </span>
            {selectedVenue.google_maps_url && (
              <a
                href={selectedVenue.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline"
              >
                View on Google Maps
              </a>
            )}
          </div>
          {(selectedVenue.address || selectedVenue.city) && (
            <p className="text-muted-foreground">{formatAddress(selectedVenue)}</p>
          )}
          {selectedVenue.parking_info && (
            <p>
              <span className="font-medium">Parking:</span>{' '}
              <span className="text-muted-foreground">{selectedVenue.parking_info}</span>
            </p>
          )}
          {selectedVenue.directions && (
            <p>
              <span className="font-medium">Access:</span>{' '}
              <span className="text-muted-foreground">{selectedVenue.directions}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
