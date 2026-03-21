'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/ui/empty-state'
import { VenueFormDialog } from './venue-form-dialog'
import { DeleteVenueDialog } from './delete-venue-dialog'
import type { Venue } from '@/types'

interface VenuesClientProps {
  venues: Venue[]
  organizationId: string
  userRole: string
}

export function VenuesClient({
  venues,
  organizationId,
  userRole,
}: VenuesClientProps) {
  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null)
  const [deletingVenue, setDeletingVenue] = useState<Venue | null>(null)

  // Filter state
  const [search, setSearch] = useState('')

  const [fixingVenues, setFixingVenues] = useState(false)

  const canManage = userRole === 'owner' || userRole === 'admin'
  const venuesMissingPlaceId = venues.filter(v => !v.google_place_id).length

  async function handleFixVenues() {
    setFixingVenues(true)
    try {
      const res = await fetch('/api/admin/fix-venues', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Fixed ${data.fixed} of ${data.total} venues`)
        router.refresh()
      } else {
        toast.error(data.error || 'Failed to fix venues')
      }
    } catch {
      toast.error('Failed to fix venues')
    } finally {
      setFixingVenues(false)
    }
  }

  const hasFilters = search !== ''

  const filteredVenues = venues.filter((v) => {
    if (search) {
      const q = search.toLowerCase()
      const nameMatch = v.name.toLowerCase().includes(q)
      const addressMatch = v.address?.toLowerCase().includes(q)
      const cityMatch = v.city?.toLowerCase().includes(q)
      if (!nameMatch && !addressMatch && !cityMatch) return false
    }
    return true
  })

  function handleAdd() {
    setEditingVenue(null)
    setFormOpen(true)
  }

  function handleEdit(venue: Venue) {
    setEditingVenue(venue)
    setFormOpen(true)
  }

  function handleDelete(venue: Venue) {
    setDeletingVenue(venue)
    setDeleteOpen(true)
  }

  function handleSuccess() {
    setFormOpen(false)
    setDeleteOpen(false)
    setEditingVenue(null)
    setDeletingVenue(null)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="page-header">
          <h2 className="text-3xl font-bold tracking-tight">Venues</h2>
          <p className="text-muted-foreground mt-1">
            Manage venues for your services with parking info and directions.
          </p>
          <div className="mt-3 w-12 h-px bg-gold/50" />
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {venuesMissingPlaceId > 0 && (
              <Button
                variant="outline"
                onClick={handleFixVenues}
                disabled={fixingVenues}
              >
                {fixingVenues ? 'Fixing...' : `Fix ${venuesMissingPlaceId} Venue Location${venuesMissingPlaceId !== 1 ? 's' : ''}`}
              </Button>
            )}
            <Button onClick={handleAdd}>Add Venue</Button>
          </div>
        )}
      </div>

      <Separator />

      {venues.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search by name, address, or city..."
            className="rounded-md border bg-background px-3 py-2 text-sm w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearch('')}
            >
              Clear
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {filteredVenues.length} of {venues.length} venues
          </span>
        </div>
      )}

      {venues.length === 0 ? (
        <EmptyState
          icon={
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
            </svg>
          }
          title="No venues yet"
          description="Add venues with addresses and parking info so they're ready when you create services."
          action={canManage ? <Button onClick={handleAdd}>Add Your First Venue</Button> : undefined}
        />
      ) : filteredVenues.length === 0 ? (
        <EmptyState title="No venues match your search" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredVenues.map((venue) => (
            <div
              key={venue.id}
              className="rounded-lg border bg-card p-4 space-y-3"
            >
              <div className="flex items-start justify-between">
                <h3 className="font-semibold">{venue.name}</h3>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(venue)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(venue)}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>

              {(venue.address || venue.city || venue.state) && (
                <div className="text-sm text-muted-foreground">
                  {[venue.address, venue.city, venue.state, venue.zip].filter(Boolean).join(', ')}
                  {venue.google_maps_url && (
                    <a
                      href={venue.google_maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-blue-600 hover:underline"
                    >
                      Get Directions
                    </a>
                  )}
                </div>
              )}

              {venue.parking_info && (
                <div className="text-sm">
                  <span className="font-medium">Parking: </span>
                  <span className="text-muted-foreground">{venue.parking_info}</span>
                </div>
              )}

              {venue.directions && (
                <div className="text-sm">
                  <span className="font-medium">Access: </span>
                  <span className="text-muted-foreground">{venue.directions}</span>
                </div>
              )}

              {venue.notes && (
                <div className="text-sm">
                  <span className="font-medium">Notes: </span>
                  <span className="text-muted-foreground">{venue.notes}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <VenueFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        venue={editingVenue}
        organizationId={organizationId}
        onSuccess={handleSuccess}
      />

      <DeleteVenueDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        venue={deletingVenue}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
