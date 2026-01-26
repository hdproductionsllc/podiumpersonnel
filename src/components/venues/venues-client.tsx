'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
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

  const canManage = userRole === 'owner' || userRole === 'admin'

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
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Venues</h2>
          <p className="text-muted-foreground">
            Manage venues for your services with parking info and directions.
          </p>
        </div>
        {canManage && (
          <Button onClick={handleAdd}>Add Venue</Button>
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
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground mb-4">
            No venues have been added yet.
          </p>
          {canManage && (
            <Button onClick={handleAdd}>Add Your First Venue</Button>
          )}
        </div>
      ) : filteredVenues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">No venues match your search.</p>
        </div>
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
