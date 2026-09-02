'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'
import type { MusicianForOffer } from './send-offer-dialog'

interface AssignMusicianDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  positionId: string
  instrumentId: string
  instrumentName?: string
  chairNumber: number
  musicians: MusicianForOffer[]
  existingOfferMusicianIds: string[]
  onSuccess: () => void
}

export function AssignMusicianDialog({
  open,
  onOpenChange,
  positionId,
  instrumentId,
  instrumentName,
  chairNumber,
  musicians,
  existingOfferMusicianIds,
  onSuccess,
}: AssignMusicianDialogProps) {
  const terms = useTerms()
  const [selectedMusicianId, setSelectedMusicianId] = useState('')
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddMusician, setShowAddMusician] = useState(false)
  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName, setNewLastName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [addingMusician, setAddingMusician] = useState(false)
  const [locallyAddedMusicians, setLocallyAddedMusicians] = useState<MusicianForOffer[]>([])

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedMusicianId('')
      setShowConfirmation(false)
      setError(null)
      setSearchQuery('')
      setSearchOpen(false)
      setLocallyAddedMusicians([])
      setShowAddMusician(false)
      setNewFirstName('')
      setNewLastName('')
      setNewEmail('')
    }
  }, [open])

  // Auto-suggest top call-order musician
  useEffect(() => {
    if (open && !selectedMusicianId) {
      const available = allMusicians
        .filter((m) => !existingOfferMusicianIds.includes(m.id))
        .filter((m) => m.musician_instruments.some((mi) => mi.instrument_id === instrumentId))
        .sort((a, b) => (a.call_order ?? 999999) - (b.call_order ?? 999999))
      if (available.length > 0) {
        setSelectedMusicianId(available[0].id)
      }
    }
  }, [open, instrumentId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Click-outside for search dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const allMusicians = [...musicians, ...locallyAddedMusicians]
  const selectedMusician = allMusicians.find((m) => m.id === selectedMusicianId)

  const isLeaderPosition = chairNumber === 1

  if (!open) return null

  // Split musicians by instrument match
  const allAvailable = allMusicians.filter((m) => !existingOfferMusicianIds.includes(m.id))

  const playsInstrument = (m: MusicianForOffer) =>
    m.musician_instruments.some((mi) => mi.instrument_id === instrumentId)

  const sortByCallOrder = (a: MusicianForOffer, b: MusicianForOffer) => {
    if (isLeaderPosition) {
      if (a.is_leader && !b.is_leader) return -1
      if (!a.is_leader && b.is_leader) return 1
    }
    return (a.call_order ?? 999999) - (b.call_order ?? 999999)
  }

  const instrumentMusicians = allAvailable.filter(playsInstrument).sort(sortByCallOrder)
  const otherMusicians = allAvailable.filter((m) => !playsInstrument(m)).sort(sortByCallOrder)

  const availableMusicians = searchQuery.trim()
    ? [...instrumentMusicians, ...otherMusicians]
    : instrumentMusicians

  const filteredMusicians = searchQuery.trim()
    ? availableMusicians.filter((m) => {
        const q = searchQuery.toLowerCase()
        return (
          m.first_name.toLowerCase().includes(q) ||
          m.last_name.toLowerCase().includes(q) ||
          `${m.first_name} ${m.last_name}`.toLowerCase().includes(q) ||
          `${m.last_name}, ${m.first_name}`.toLowerCase().includes(q)
        )
      })
    : availableMusicians

  async function handleAssign() {
    if (!selectedMusicianId) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/positions/${positionId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ musicianId: selectedMusicianId }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || `Failed to assign ${term(terms, 'person', { case: 'lower' })}`)
        setLoading(false)
        return
      }

      const name = `${selectedMusician?.first_name} ${selectedMusician?.last_name}`
      toast.success(`${name} assigned and confirmed.`)
      setSelectedMusicianId('')
      onOpenChange(false)
      onSuccess()
    } catch {
      setError(`Failed to assign ${term(terms, 'person', { case: 'lower' })}`)
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setSelectedMusicianId('')
    setShowConfirmation(false)
    setError(null)
    onOpenChange(false)
  }

  // Confirmation view
  if (showConfirmation) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
        <div className="relative bg-background rounded-lg border shadow-lg w-full max-w-md p-6 space-y-4">
          <h3 className="text-lg font-semibold">Confirm Assignment</h3>

          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="rounded-md border bg-muted/30 p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{term(terms, 'person')}:</span>
              <span className="font-medium">
                {selectedMusician?.first_name} {selectedMusician?.last_name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Position:</span>
              <span>{instrumentName || 'Position'}</span>
            </div>
          </div>

          <div className="rounded-md bg-blue-50 dark:bg-blue-950/50 p-3 text-sm text-blue-700 dark:text-blue-300">
            This will directly confirm {selectedMusician?.first_name} {selectedMusician?.last_name} for this position. No offer email will be sent.
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowConfirmation(false)} disabled={loading}>
              Back
            </Button>
            <Button onClick={handleAssign} disabled={loading}>
              {loading ? 'Assigning...' : 'Confirm Assignment'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Form view — musician picker
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-background rounded-lg border shadow-lg w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold">Assign {term(terms, 'person')}</h3>
        <p className="text-sm text-muted-foreground">
          Directly assign a {term(terms, 'person', { case: 'lower' })} to this position. No offer email will be sent.
        </p>

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{term(terms, 'person')}</label>
            {availableMusicians.length === 0 && allAvailable.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No available {term(terms, 'person', { plural: true, case: 'lower' })}. Add one below or from the {term(terms, 'person', { plural: true })} page.
              </p>
            ) : (
              <>
                {/* Searchable musician picker */}
                <div ref={searchRef} className="relative">
                  <input
                    type="text"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    placeholder="Search by name..."
                    value={selectedMusicianId && !searchOpen
                      ? `${selectedMusician?.last_name}, ${selectedMusician?.first_name}`
                      : searchQuery
                    }
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setSearchOpen(true)
                      if (selectedMusicianId) {
                        setSelectedMusicianId('')
                      }
                    }}
                    onFocus={() => {
                      setSearchOpen(true)
                      if (selectedMusicianId) {
                        setSearchQuery('')
                      }
                    }}
                  />
                  {selectedMusicianId && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMusicianId('')
                        setSearchQuery('')
                        setSearchOpen(true)
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  {searchOpen && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-64 overflow-auto">
                      {filteredMusicians.length > 0 ? (
                        (() => {
                          const instrumentGroup = filteredMusicians.filter(playsInstrument)
                          const otherGroup = filteredMusicians.filter((m) => !playsInstrument(m))
                          return (
                            <>
                              {instrumentGroup.map((m) => {
                                const hasConflict = m.competing_schedules && m.competing_schedules.length > 0
                                return (
                                  <button
                                    key={m.id}
                                    type="button"
                                    className="w-full px-3 py-2 text-left hover:bg-muted flex items-center justify-between gap-2"
                                    onClick={() => {
                                      setSelectedMusicianId(m.id)
                                      setSearchQuery('')
                                      setSearchOpen(false)
                                    }}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="font-medium text-sm truncate">
                                        {m.last_name}, {m.first_name}
                                      </span>
                                      {m.is_leader && (
                                        <span className="text-amber-500 flex-shrink-0" title="Leader">&#9733;</span>
                                      )}
                                      {!m.email && (
                                        <span className="text-xs text-amber-600 dark:text-amber-400 flex-shrink-0" title="No email">
                                          No email
                                        </span>
                                      )}
                                      {hasConflict && (
                                        <span className="text-xs text-red-600 dark:text-red-400 flex-shrink-0" title="Schedule conflict">
                                          Conflict
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {m.call_order != null && (
                                        <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
                                          #{m.call_order}
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                )
                              })}
                              {otherGroup.length > 0 && (
                                <>
                                  <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50 border-t">
                                    Other {term(terms, 'person', { plural: true, case: 'lower' })}
                                  </div>
                                  {otherGroup.map((m) => {
                                    const hasConflict = m.competing_schedules && m.competing_schedules.length > 0
                                    return (
                                      <button
                                        key={m.id}
                                        type="button"
                                        className="w-full px-3 py-2 text-left hover:bg-muted flex items-center justify-between gap-2"
                                        onClick={async () => {
                                          const supabase = createClient()
                                          const { error: linkError } = await supabase.from('musician_instruments').insert({
                                            musician_id: m.id,
                                            instrument_id: instrumentId,
                                            is_primary: false,
                                            proficiency: 'professional',
                                          })
                                          if (linkError) console.warn('assign-musician-dialog: auto-link instrument failed:', linkError)
                                          m.musician_instruments.push({ instrument_id: instrumentId })
                                          toast.success(`Added ${instrumentName || term(terms, 'skill', { case: 'lower' })} to ${m.first_name} ${m.last_name}'s profile`)
                                          setSelectedMusicianId(m.id)
                                          setSearchQuery('')
                                          setSearchOpen(false)
                                        }}
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="font-medium text-sm truncate">
                                            {m.last_name}, {m.first_name}
                                          </span>
                                          <span className="text-xs text-muted-foreground flex-shrink-0">(other instrument)</span>
                                          {!m.email && (
                                            <span className="text-xs text-amber-600 dark:text-amber-400 flex-shrink-0" title="No email">
                                              No email
                                            </span>
                                          )}
                                          {hasConflict && (
                                            <span className="text-xs text-red-600 dark:text-red-400 flex-shrink-0" title="Schedule conflict">
                                              Conflict
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                          {m.call_order != null && (
                                            <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
                                              #{m.call_order}
                                            </span>
                                          )}
                                        </div>
                                      </button>
                                    )
                                  })}
                                </>
                              )}
                            </>
                          )
                        })()
                      ) : (
                        <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                          No {term(terms, 'person', { plural: true, case: 'lower' })} match &quot;{searchQuery}&quot;
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {!showAddMusician ? (
                  <button
                    type="button"
                    className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                    onClick={() => setShowAddMusician(true)}
                  >
                    + Add New {term(terms, 'person')}
                  </button>
                ) : (
                  <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Quick Add {term(terms, 'person')}</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="First name"
                        value={newFirstName}
                        onChange={(e) => setNewFirstName(e.target.value)}
                        className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Last name"
                        value={newLastName}
                        onChange={(e) => setNewLastName(e.target.value)}
                        className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                      />
                    </div>
                    <input
                      type="email"
                      placeholder="Email address (optional)"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={addingMusician || (!newFirstName.trim() && !newLastName.trim())}
                        onClick={async () => {
                          if (!newFirstName.trim() && !newLastName.trim()) return
                          setAddingMusician(true)
                          try {
                            const supabase = createClient()
                            const { data: membership } = await supabase
                              .from('organization_members')
                              .select('organization_id')
                              .single()
                            if (!membership) { setError('No organization found'); return }
                            const insertData: Record<string, unknown> = {
                              organization_id: membership.organization_id,
                              first_name: newFirstName.trim() || newLastName.trim(),
                              last_name: newFirstName.trim() ? newLastName.trim() : '',
                              is_active: true,
                            }
                            if (newEmail.trim() && newEmail.includes('@')) {
                              insertData.email = newEmail.trim().toLowerCase()
                            }
                            const { data: newMusician, error: insertErr } = await supabase
                              .from('musicians')
                              .insert(insertData)
                              .select('id')
                              .single()
                            if (insertErr) { setError(insertErr.message); return }
                            if (newMusician) {
                              const { error: linkError } = await supabase
                                .from('musician_instruments')
                                .insert({
                                  musician_id: newMusician.id,
                                  instrument_id: instrumentId,
                                  is_primary: true,
                                  proficiency: 'professional',
                                })
                              if (linkError) console.warn('assign-musician-dialog: link new musician instrument failed:', linkError)
                              setLocallyAddedMusicians(prev => [...prev, {
                                id: newMusician.id,
                                first_name: newFirstName.trim() || newLastName.trim(),
                                last_name: newFirstName.trim() ? newLastName.trim() : '',
                                email: newEmail.trim() ? newEmail.trim().toLowerCase() : null,
                                musician_instruments: [{ instrument_id: instrumentId }],
                                competing_schedules: [],
                              }])
                              setSelectedMusicianId(newMusician.id)
                            }
                            setNewFirstName('')
                            setNewLastName('')
                            setNewEmail('')
                            setShowAddMusician(false)
                          } catch {
                            setError(`Failed to add ${term(terms, 'person', { case: 'lower' })}`)
                          } finally {
                            setAddingMusician(false)
                          }
                        }}
                      >
                        {addingMusician ? 'Adding...' : 'Add & Select'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setShowAddMusician(false); setNewFirstName(''); setNewLastName(''); setNewEmail('') }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={() => setShowConfirmation(true)} disabled={!selectedMusicianId || loading}>
            Review Assignment
          </Button>
        </div>
      </div>
    </div>
  )
}
