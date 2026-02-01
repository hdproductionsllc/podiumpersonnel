'use client'

import { useState, Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { ImportFromBookDialog } from './import-from-book-dialog'
import { AddPositionDialog } from './add-position-dialog'
import { SavePresetDialog } from './save-preset-dialog'
import { SendOfferDialog, type MusicianForOffer, type MusicianScheduleEntry } from './send-offer-dialog'
import { RequestSubDialog } from './request-sub-dialog'
import { INSTRUMENT_SECTIONS, SECTION_LABELS } from '@/lib/validations/instruments'
import type { Service } from '@/types'

export type PositionOfferJoined = {
  id: string
  musician_id: string
  status: string
  sent_at: string | null
  expires_at: string | null
  responded_at: string | null
  token: string
  musician: { id: string; first_name: string; last_name: string }
}

export type PositionSubRequestJoined = {
  id: string
  requesting_musician_id: string
  service_id: string | null
  reason: string | null
  status: string
  substitute_musician_id: string | null
  suggested_sub_name: string | null
  suggested_sub_email: string | null
  suggested_sub_phone: string | null
  suggested_sub_instrument_id: string | null
  admin_notes: string | null
  offer_id: string | null
  requesting_musician: { id: string; first_name: string; last_name: string }
  substitute_musician: { id: string; first_name: string; last_name: string } | null
  suggested_sub_instrument: { id: string; name: string } | null
  service: { id: string; name: string; start_time: string } | null
}

export type PositionJoined = {
  id: string
  project_id: string
  instrument_id: string
  chair_number: number
  musician_id: string | null
  status: string
  notes: string | null
  instrument: { id: string; name: string; section: string | null; sort_order: number }
  musician: { id: string; first_name: string; last_name: string } | null
  contract_offers: PositionOfferJoined[]
  substitution_requests: PositionSubRequestJoined[]
}

export type BookForImport = {
  id: string
  name: string
  book_entries: {
    instrument_id: string
    chair_number: number | null
    musician_id: string
  }[]
}

interface ProjectPositionsProps {
  positions: PositionJoined[]
  projectId: string
  organizationId: string
  books: BookForImport[]
  musicians: MusicianForOffer[]
  services: Service[]
  canManage: boolean
  onPositionChange: () => void
}

const STATUS_COLORS: Record<string, string> = {
  vacant: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  offered: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  confirmed: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  declined: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
}

const STATUS_LABELS: Record<string, string> = {
  vacant: 'Vacant',
  offered: 'Offered',
  confirmed: 'Confirmed',
  declined: 'Declined',
}

export type ConflictInfo = {
  musicianName: string
  positionLabel: string
  schedule: MusicianScheduleEntry
  service: Service
}

export function detectConflicts(
  positions: PositionJoined[],
  musicians: MusicianForOffer[],
  services: Service[]
): ConflictInfo[] {
  const conflicts: ConflictInfo[] = []
  for (const position of positions) {
    if (!position.musician_id) continue
    const musician = musicians.find((m) => m.id === position.musician_id)
    if (!musician || !musician.competing_schedules) continue
    for (const schedule of musician.competing_schedules) {
      const schedStart = new Date(schedule.start_time).getTime()
      const schedEnd = new Date(schedule.end_time).getTime()
      for (const service of services) {
        const svcStart = new Date(service.start_time).getTime()
        const svcEnd = service.end_time
          ? new Date(service.end_time).getTime()
          : svcStart + 3600000
        if (schedStart < svcEnd && schedEnd > svcStart) {
          conflicts.push({
            musicianName: `${musician.first_name} ${musician.last_name}`,
            positionLabel: `${position.instrument?.name}, Chair ${position.chair_number}`,
            schedule,
            service,
          })
        }
      }
    }
  }
  return conflicts
}

export function ProjectPositions({
  positions,
  projectId,
  organizationId,
  books,
  musicians,
  services,
  canManage,
  onPositionChange,
}: ProjectPositionsProps) {
  const [importOpen, setImportOpen] = useState(false)
  const [addPositionOpen, setAddPositionOpen] = useState(false)
  const [addPositionMode, setAddPositionMode] = useState<'presets' | 'single'>('presets')
  const [savePresetOpen, setSavePresetOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [offerPositionId, setOfferPositionId] = useState<string | null>(null)
  const [offerInstrumentId, setOfferInstrumentId] = useState<string | null>(null)
  const [offerChairNumber, setOfferChairNumber] = useState<number>(1)
  const [offerExistingIds, setOfferExistingIds] = useState<string[]>([])
  const [suggestedCustomPay, setSuggestedCustomPay] = useState<string>('')
  const [subRequestPosition, setSubRequestPosition] = useState<PositionJoined | null>(null)
  const [unassignPosition, setUnassignPosition] = useState<PositionJoined | null>(null)
  const [unassigning, setUnassigning] = useState(false)

  // Get pay info from the first service (services should have consistent pay)
  const firstService = services[0]
  const basePay = (firstService as any)?.base_pay ?? null
  const leaderFee = (firstService as any)?.leader_fee ?? 50

  function handleSendOffer(position: PositionJoined) {
    const existingMusicianIds = position.contract_offers
      .filter((o) => o.status === 'pending' || o.status === 'viewed' || o.status === 'accepted')
      .map((o) => o.musician_id)
    setOfferPositionId(position.id)
    setOfferInstrumentId(position.instrument_id)
    setOfferChairNumber(position.chair_number)
    setOfferExistingIds(existingMusicianIds)
  }

  // Group positions by section
  const grouped = INSTRUMENT_SECTIONS.reduce((acc, section) => {
    acc[section] = positions
      .filter((p) => (p.instrument?.section || 'other') === section)
      .sort((a, b) => {
        const sortA = a.instrument?.sort_order ?? 999
        const sortB = b.instrument?.sort_order ?? 999
        if (sortA !== sortB) return sortA - sortB
        return a.chair_number - b.chair_number
      })
    return acc
  }, {} as Record<string, PositionJoined[]>)

  async function handleRemovePosition(position: PositionJoined) {
    // Prevent removal of confirmed positions
    if (position.status === 'confirmed' || position.musician_id) {
      alert('Cannot remove a position that has a confirmed musician. Unassign the musician first.')
      return
    }
    const supabase = createClient()
    await supabase.from('project_positions').delete().eq('id', position.id)
    onPositionChange()
  }

  async function handleClearAll() {
    // Check if any positions are confirmed
    const confirmedPositions = positions.filter(p => p.status === 'confirmed' || p.musician_id)
    if (confirmedPositions.length > 0) {
      alert(`Cannot clear all positions. ${confirmedPositions.length} position(s) have confirmed musicians. Unassign them first.`)
      return
    }
    if (!confirm('Remove all positions from this project?')) return
    setClearing(true)
    const supabase = createClient()
    await supabase.from('project_positions').delete().eq('project_id', projectId)
    setClearing(false)
    onPositionChange()
  }

  async function handleStatusChange(positionId: string, newStatus: string) {
    const supabase = createClient()
    await supabase.from('project_positions').update({ status: newStatus }).eq('id', positionId)
    onPositionChange()
  }

  function handleUnassign(position: PositionJoined) {
    setUnassignPosition(position)
  }

  async function confirmUnassign() {
    if (!unassignPosition) return
    setUnassigning(true)

    try {
      const response = await fetch(`/api/positions/${unassignPosition.id}/unassign`, {
        method: 'POST',
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || 'Failed to unassign musician')
        return
      }

      toast.success('Musician unassigned and notified')
      onPositionChange()
    } catch {
      toast.error('Failed to unassign musician')
    } finally {
      setUnassigning(false)
      setUnassignPosition(null)
    }
  }

  async function handleDuplicatePosition(position: PositionJoined) {
    // Find the next available chair number for this instrument
    const existingChairs = positions
      .filter(p => p.instrument_id === position.instrument_id)
      .map(p => p.chair_number)
    const nextChair = existingChairs.length > 0 ? Math.max(...existingChairs) + 1 : 1

    const supabase = createClient()
    await supabase.from('project_positions').insert({
      project_id: projectId,
      instrument_id: position.instrument_id,
      chair_number: nextChair,
      status: 'vacant',
    })
    onPositionChange()
  }

  const totalPositions = positions.length
  const filledPositions = positions.filter((p) => p.musician_id).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-semibold">Staffing</h4>
          {totalPositions > 0 && (
            <span className="text-xs text-muted-foreground">
              {filledPositions}/{totalPositions} filled
            </span>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-1">
            {totalPositions > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={handleClearAll}
                disabled={clearing}
              >
                Clear All
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => { setAddPositionMode('presets'); setAddPositionOpen(true) }}>
              Quick Presets
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setAddPositionMode('single'); setAddPositionOpen(true) }}>
              Add Position
            </Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
              Import from Saved Ensemble
            </Button>
            {totalPositions > 0 && (
              <Button size="sm" variant="outline" onClick={() => setSavePresetOpen(true)}>
                Save as Preset
              </Button>
            )}
          </div>
        )}
      </div>

      {totalPositions === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No positions defined. Import from a saved ensemble or add positions manually.
        </p>
      ) : (
        <div className="rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-xs">Instrument</th>
                <th className="px-3 py-2 text-left font-medium text-xs">Chair</th>
                <th className="px-3 py-2 text-left font-medium text-xs">Musician</th>
                <th className="px-3 py-2 text-left font-medium text-xs">Status</th>
                {canManage && (
                  <th className="px-3 py-2 text-right font-medium text-xs">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {INSTRUMENT_SECTIONS.map((section) => {
                const sectionPositions = grouped[section]
                if (sectionPositions.length === 0) return null
                return (
                  <Fragment key={section}>
                    <tr>
                      <td
                        colSpan={canManage ? 5 : 4}
                        className="px-3 py-1.5 bg-muted/20 text-xs font-semibold text-muted-foreground"
                      >
                        {SECTION_LABELS[section]}
                      </td>
                    </tr>
                    {sectionPositions.map((position) => (
                      <tr key={position.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2">{position.instrument?.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">Chair {position.chair_number}</td>
                        <td className="px-3 py-2">
                          {position.musician
                            ? (() => {
                                const m = musicians.find((mu) => mu.id === position.musician_id)
                                const hasConflict = m?.competing_schedules?.some((sched) => {
                                  const schedStart = new Date(sched.start_time).getTime()
                                  const schedEnd = new Date(sched.end_time).getTime()
                                  return services.some((svc) => {
                                    const svcStart = new Date(svc.start_time).getTime()
                                    const svcEnd = svc.end_time ? new Date(svc.end_time).getTime() : svcStart + 3600000
                                    return schedStart < svcEnd && schedEnd > svcStart
                                  })
                                })
                                return (
                                  <span className="flex items-center gap-1">
                                    {position.musician.first_name} {position.musician.last_name}
                                    {hasConflict && (
                                      <span
                                        className="inline-flex items-center text-amber-600 dark:text-amber-400"
                                        title="Schedule conflict detected"
                                      >
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                                        </svg>
                                      </span>
                                    )}
                                  </span>
                                )
                              })()
                            : <span className="text-muted-foreground italic">Unassigned</span>
                          }
                        </td>
                        <td className="px-3 py-2">
                          {(() => {
                            // Find pending offer to show who it's offered to
                            const pendingOffer = position.contract_offers.find(
                              o => o.status === 'pending' || o.status === 'viewed'
                            )
                            const offeredToName = pendingOffer
                              ? `${pendingOffer.musician.first_name} ${pendingOffer.musician.last_name}`
                              : null

                            return canManage ? (
                              <div className="flex flex-col gap-1">
                                {position.status === 'confirmed' ? (
                                  <div className="flex items-center gap-2">
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[position.status]}`}>
                                      {STATUS_LABELS[position.status]}
                                    </span>
                                    {canManage && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 text-xs text-muted-foreground"
                                        onClick={() => handleStatusChange(position.id, 'vacant')}
                                        title="Release this musician from the position"
                                      >
                                        Unassign
                                      </Button>
                                    )}
                                  </div>
                                ) : (
                                  <select
                                    className="rounded border bg-background px-2 py-0.5 text-xs"
                                    value={position.status}
                                    onChange={(e) => handleStatusChange(position.id, e.target.value)}
                                  >
                                    <option value="vacant">Vacant</option>
                                    <option value="offered">Offered</option>
                                    <option value="confirmed">Confirmed</option>
                                    <option value="declined">Declined</option>
                                  </select>
                                )}
                                {position.status === 'offered' && offeredToName && (
                                  <span className="text-xs text-muted-foreground">
                                    to {offeredToName}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[position.status] || ''}`}>
                                  {STATUS_LABELS[position.status] || position.status}
                                </span>
                                {position.status === 'offered' && offeredToName && (
                                  <span className="text-xs text-muted-foreground">
                                    to {offeredToName}
                                  </span>
                                )}
                              </div>
                            )
                          })()}
                        </td>
                        {canManage && (
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {position.status !== 'confirmed' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSendOffer(position)}
                                >
                                  Offer
                                </Button>
                              )}
                              {position.status === 'confirmed' && position.musician_id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSubRequestPosition(position)}
                                >
                                  Sub
                                </Button>
                              )}
                              {position.musician_id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUnassign(position)}
                                >
                                  Unassign
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDuplicatePosition(position)}
                                title="Add another chair for this instrument"
                              >
                                +
                              </Button>
                              {position.status !== 'confirmed' && !position.musician_id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => handleRemovePosition(position)}
                                >
                                  Remove
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ImportFromBookDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        books={books}
        projectId={projectId}
        onSuccess={onPositionChange}
      />

      <AddPositionDialog
        open={addPositionOpen}
        onOpenChange={setAddPositionOpen}
        projectId={projectId}
        organizationId={organizationId}
        existingPositions={positions.map(p => ({ instrument_id: p.instrument_id, chair_number: p.chair_number }))}
        initialMode={addPositionMode}
        onSuccess={onPositionChange}
      />

      <SavePresetDialog
        open={savePresetOpen}
        onOpenChange={setSavePresetOpen}
        positions={positions}
        organizationId={organizationId}
        onSuccess={() => {}}
      />

      <SendOfferDialog
        open={offerPositionId !== null}
        onOpenChange={(open) => { if (!open) { setOfferPositionId(null); setOfferInstrumentId(null); setOfferChairNumber(1); setOfferExistingIds([]) } }}
        positionId={offerPositionId ?? ''}
        instrumentId={offerInstrumentId ?? ''}
        chairNumber={offerChairNumber}
        musicians={musicians}
        existingOfferMusicianIds={offerExistingIds}
        basePay={basePay}
        leaderFee={leaderFee}
        suggestedCustomPay={suggestedCustomPay}
        onSuccess={(applyPayToRemaining) => {
          if (applyPayToRemaining?.customPay) {
            setSuggestedCustomPay(applyPayToRemaining.customPay)
          }
          onPositionChange()
        }}
      />

      <RequestSubDialog
        open={subRequestPosition !== null}
        onOpenChange={(open) => { if (!open) setSubRequestPosition(null) }}
        positionId={subRequestPosition?.id ?? ''}
        musicianId={subRequestPosition?.musician_id ?? ''}
        musicianName={subRequestPosition?.musician ? `${subRequestPosition.musician.first_name} ${subRequestPosition.musician.last_name}` : ''}
        services={services}
        onSuccess={onPositionChange}
      />

      {/* Unassign Confirmation Dialog */}
      {unassignPosition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Confirm Unassignment</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to unassign this musician?
            </p>

            <div className="mt-4 rounded-lg border bg-muted/30 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Musician:</span>
                <span className="font-medium">
                  {unassignPosition.musician?.first_name} {unassignPosition.musician?.last_name}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Position:</span>
                <span>{unassignPosition.instrument?.name}, Chair {unassignPosition.chair_number}</span>
              </div>
            </div>

            <div className="mt-4 rounded bg-amber-50 dark:bg-amber-950/50 p-3 text-sm text-amber-700 dark:text-amber-300">
              Both the musician and organization admins will be notified by email.
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setUnassignPosition(null)} disabled={unassigning}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmUnassign} disabled={unassigning}>
                {unassigning ? 'Unassigning...' : 'Confirm Unassign'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
