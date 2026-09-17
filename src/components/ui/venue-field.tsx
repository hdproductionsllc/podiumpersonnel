'use client'

import { useState } from 'react'
import { VenueSearch } from '@/components/ui/venue-search'
import { VenueFormDialog } from '@/components/venues/venue-form-dialog'
import {
  resolveVenue,
  venueIsMissingLocation,
  type VenueResolutionStatus,
} from '@/lib/venue-resolution'
import type { Venue } from '@/types'

interface VenueFieldProps {
  value: string
  venueId: string | null
  organizationId: string
  /** Venue text and its link always arrive together, so they cannot drift apart. */
  onChange: (venue: string, venueId: string | null) => void
  placeholder?: string
}

/**
 * A venue picker that tells you when the gig will reach musicians without an address.
 *
 * Replaces the copy of the create-a-venue-on-Google-pick block that used to live in
 * each dialog. Everything about turning typed text into a venue link happens here or
 * in venue-resolution, so there is one behaviour to reason about instead of three.
 */
export function VenueField({
  value,
  venueId,
  organizationId,
  onChange,
  placeholder,
}: VenueFieldProps) {
  const [status, setStatus] = useState<VenueResolutionStatus | null>(null)
  const [linkedVenue, setLinkedVenue] = useState<Venue | null>(null)
  const [candidates, setCandidates] = useState<Venue[]>([])
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const [showVenueDialog, setShowVenueDialog] = useState(false)

  async function handleChange(
    venueName: string,
    pickedId: string | null,
    venueData?: Venue | null,
    placeId?: string | null,
    googlePlaceData?: Parameters<typeof resolveVenue>[0]['googlePlaceData']
  ) {
    // Free-text name matching already happened inside VenueSearch, which holds the
    // org's venue list; this call settles the Google-pick case and reports status.
    const result = await resolveVenue({
      typedName: venueName,
      venueId: pickedId,
      placeId,
      googlePlaceData,
      organizationId,
      savedVenues: [],
    })

    setStatus(result.status)
    setCandidates(result.candidates)
    setError(result.error ?? null)
    setLinkedVenue(venueData ?? null)
    onChange(result.venue, result.venueId)
  }

  function handleVenueCreated(created?: Venue) {
    setShowVenueDialog(false)
    if (!created) return
    setStatus('created')
    setLinkedVenue(created)
    setError(null)
    onChange(created.name, created.id)
  }

  // Only judge the field once the admin has left it — warning on every keystroke
  // while someone types a venue name would be noise.
  const warning = !touched || !value.trim() ? null : describeGap()

  function describeGap(): string | null {
    if (status === 'failed') {
      return error || 'That venue could not be saved, so no address will be sent.'
    }
    if (status === 'ambiguous') {
      return `${candidates.length} saved venues share this name — pick the right one from the list so musicians get the correct address.`
    }
    if (status === 'created') return null
    if ((status === 'linked' || status === 'matched') && linkedVenue) {
      return venueIsMissingLocation({ venue: value, venue_details: linkedVenue })
        ? 'This saved venue has no address on file, so musicians will get the name only.'
        : null
    }
    if (venueId) return null
    return 'Not linked to a saved venue. Musicians will get the name only — no address, no map link.'
  }

  return (
    <div className="space-y-2">
      <div onBlur={() => setTouched(true)}>
        <VenueSearch
          value={value}
          venueId={venueId}
          organizationId={organizationId}
          onChange={handleChange}
          placeholder={placeholder}
          autoMatchSavedVenue
          onAmbiguousMatch={(found) => {
            setStatus('ambiguous')
            setCandidates(found)
            setLinkedVenue(null)
          }}
        />
      </div>

      {warning && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          <p>{warning}</p>
          {status !== 'ambiguous' && (
            <button
              type="button"
              className="mt-1 font-medium underline underline-offset-2"
              onClick={() => setShowVenueDialog(true)}
            >
              Save as a venue with an address
            </button>
          )}
        </div>
      )}

      <VenueFormDialog
        open={showVenueDialog}
        onOpenChange={setShowVenueDialog}
        venue={null}
        initialName={value}
        organizationId={organizationId}
        onSuccess={handleVenueCreated}
      />
    </div>
  )
}
