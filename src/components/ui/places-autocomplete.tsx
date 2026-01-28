'use client'

import { useRef, useEffect, useState } from 'react'
import { useLoadScript, Autocomplete } from '@react-google-maps/api'
import { Input } from './input'

const libraries: ('places')[] = ['places']

interface PlacesAutocompleteProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function PlacesAutocomplete({
  value,
  onChange,
  placeholder = 'Enter venue name or address',
  className,
}: PlacesAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey || '',
    libraries,
  })

  // Sync external value changes
  useEffect(() => {
    setInputValue(value)
  }, [value])

  const onLoad = (autocomplete: google.maps.places.Autocomplete) => {
    autocompleteRef.current = autocomplete
  }

  const onPlaceChanged = () => {
    if (autocompleteRef.current) {
      const place = autocompleteRef.current.getPlace()
      if (place.formatted_address) {
        setInputValue(place.formatted_address)
        onChange(place.formatted_address)
      } else if (place.name) {
        setInputValue(place.name)
        onChange(place.name)
      }
    }
  }

  // If no API key or loading error, fall back to regular input
  if (!apiKey || loadError) {
    return (
      <Input
        type="text"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value)
          onChange(e.target.value)
        }}
        placeholder={placeholder}
        className={className}
      />
    )
  }

  if (!isLoaded) {
    return (
      <Input
        type="text"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value)
          onChange(e.target.value)
        }}
        placeholder="Loading..."
        className={className}
        disabled
      />
    )
  }

  return (
    <Autocomplete
      onLoad={onLoad}
      onPlaceChanged={onPlaceChanged}
      options={{
        types: ['establishment', 'geocode'],
      }}
    >
      <Input
        type="text"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value)
          onChange(e.target.value)
        }}
        placeholder={placeholder}
        className={className}
      />
    </Autocomplete>
  )
}
