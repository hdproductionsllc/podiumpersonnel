'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { HOME_REGIONS } from '@/lib/validations/musicians'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { MusicianWithInstruments, InstrumentOption } from './musicians-client'

interface BulkEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  musicians: MusicianWithInstruments[]
  instruments: InstrumentOption[]
  onSuccess: () => void
}

export function BulkEditDialog({
  open,
  onOpenChange,
  musicians,
  instruments,
  onSuccess,
}: BulkEditDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track which fields to update (checkboxes to enable each field)
  const [updateInstruments, setUpdateInstruments] = useState(false)
  const [updateHomeRegion, setUpdateHomeRegion] = useState(false)
  const [updateServiceRadius, setUpdateServiceRadius] = useState(false)
  const [updateIsLeader, setUpdateIsLeader] = useState(false)

  // Field values
  const [instrumentIds, setInstrumentIds] = useState<string[]>([])
  const [instrumentMode, setInstrumentMode] = useState<'replace' | 'add' | 'remove'>('add')
  const [homeRegion, setHomeRegion] = useState('')
  const [serviceRadius, setServiceRadius] = useState(50)
  const [isLeader, setIsLeader] = useState(false)

  async function handleSubmit() {
    if (!updateInstruments && !updateHomeRegion && !updateServiceRadius && !updateIsLeader) {
      setError('Please select at least one field to update')
      return
    }

    setIsLoading(true)
    setError(null)

    const supabase = createClient()
    let successCount = 0
    let errorCount = 0

    for (const musician of musicians) {
      try {
        // Update musician fields
        const updates: Record<string, any> = {}

        if (updateHomeRegion) {
          updates.home_region = homeRegion || null
        }
        if (updateServiceRadius) {
          updates.service_radius_miles = serviceRadius
        }
        if (updateIsLeader) {
          updates.is_leader = isLeader
        }

        // Only update musicians table if there are field updates
        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabase
            .from('musicians')
            .update(updates)
            .eq('id', musician.id)

          if (updateError) {
            console.error(`Error updating musician ${musician.id}:`, updateError)
            errorCount++
            continue
          }
        }

        // Handle instrument updates
        if (updateInstruments) {
          if (instrumentMode === 'replace') {
            // Delete all existing instruments
            await supabase
              .from('musician_instruments')
              .delete()
              .eq('musician_id', musician.id)

            // Insert new instruments
            if (instrumentIds.length > 0) {
              await supabase
                .from('musician_instruments')
                .insert(
                  instrumentIds.map((instrument_id) => ({
                    musician_id: musician.id,
                    instrument_id,
                  }))
                )
            }
          } else if (instrumentMode === 'add') {
            // Add instruments (ignore duplicates)
            const existingIds = musician.musician_instruments.map((mi) => mi.instrument_id)
            const newIds = instrumentIds.filter((id) => !existingIds.includes(id))

            if (newIds.length > 0) {
              await supabase
                .from('musician_instruments')
                .insert(
                  newIds.map((instrument_id) => ({
                    musician_id: musician.id,
                    instrument_id,
                  }))
                )
            }
          } else if (instrumentMode === 'remove') {
            // Remove specified instruments
            if (instrumentIds.length > 0) {
              await supabase
                .from('musician_instruments')
                .delete()
                .eq('musician_id', musician.id)
                .in('instrument_id', instrumentIds)
            }
          }
        }

        successCount++
      } catch (err) {
        console.error(`Error processing musician ${musician.id}:`, err)
        errorCount++
      }
    }

    setIsLoading(false)

    if (successCount > 0) {
      toast.success(`Updated ${successCount} musician${successCount !== 1 ? 's' : ''}`)
    }
    if (errorCount > 0) {
      toast.error(`Failed to update ${errorCount} musician${errorCount !== 1 ? 's' : ''}`)
    }

    if (successCount > 0) {
      // Reset form
      setUpdateInstruments(false)
      setUpdateHomeRegion(false)
      setUpdateServiceRadius(false)
      setUpdateIsLeader(false)
      setInstrumentIds([])
      setInstrumentMode('add')
      setHomeRegion('')
      setServiceRadius(50)
      setIsLeader(false)
      onSuccess()
    }
  }

  function handleClose() {
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Edit Musicians</DialogTitle>
          <DialogDescription>
            Edit {musicians.length} selected musician{musicians.length !== 1 ? 's' : ''}.
            Check the fields you want to update.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Instruments */}
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={updateInstruments}
                onChange={(e) => setUpdateInstruments(e.target.checked)}
              />
              <span className="font-medium">Update Instruments</span>
            </label>

            {updateInstruments && (
              <div className="ml-6 space-y-3">
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="instrumentMode"
                      value="add"
                      checked={instrumentMode === 'add'}
                      onChange={() => setInstrumentMode('add')}
                    />
                    Add to existing
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="instrumentMode"
                      value="remove"
                      checked={instrumentMode === 'remove'}
                      onChange={() => setInstrumentMode('remove')}
                    />
                    Remove
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="instrumentMode"
                      value="replace"
                      checked={instrumentMode === 'replace'}
                      onChange={() => setInstrumentMode('replace')}
                    />
                    Replace all
                  </label>
                </div>

                <div className="max-h-40 overflow-y-auto rounded-md border p-3 space-y-2">
                  {instruments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No instruments defined.</p>
                  ) : (
                    instruments.map((instrument) => (
                      <label
                        key={instrument.id}
                        className="flex items-center gap-2 cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300"
                          checked={instrumentIds.includes(instrument.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setInstrumentIds([...instrumentIds, instrument.id])
                            } else {
                              setInstrumentIds(instrumentIds.filter((id) => id !== instrument.id))
                            }
                          }}
                        />
                        {instrument.name}
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Home Region */}
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={updateHomeRegion}
                onChange={(e) => setUpdateHomeRegion(e.target.checked)}
              />
              <span className="font-medium">Update Home Region</span>
            </label>

            {updateHomeRegion && (
              <div className="ml-6">
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={homeRegion}
                  onChange={(e) => setHomeRegion(e.target.value)}
                >
                  <option value="">Clear region</option>
                  {HOME_REGIONS.map((region) => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Service Radius */}
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={updateServiceRadius}
                onChange={(e) => setUpdateServiceRadius(e.target.checked)}
              />
              <span className="font-medium">Update Service Radius</span>
            </label>

            {updateServiceRadius && (
              <div className="ml-6">
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={serviceRadius}
                  onChange={(e) => setServiceRadius(Number(e.target.value))}
                >
                  <option value={25}>25 miles</option>
                  <option value={50}>50 miles</option>
                  <option value={75}>75 miles</option>
                  <option value={100}>100 miles</option>
                  <option value={150}>150+ miles</option>
                </select>
              </div>
            )}
          </div>

          {/* Can Lead */}
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={updateIsLeader}
                onChange={(e) => setUpdateIsLeader(e.target.checked)}
              />
              <span className="font-medium">Update Can Lead (Violin 1)</span>
            </label>

            {updateIsLeader && (
              <div className="ml-6 flex gap-4">
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="isLeader"
                    checked={isLeader === true}
                    onChange={() => setIsLeader(true)}
                  />
                  Yes, can lead
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="isLeader"
                    checked={isLeader === false}
                    onChange={() => setIsLeader(false)}
                  />
                  No
                </label>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Updating...' : `Update ${musicians.length} Musician${musicians.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
