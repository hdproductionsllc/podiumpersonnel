'use client'

import { useState, useEffect, useRef, Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { ImportFromBookDialog } from './import-from-book-dialog'
import { AddPositionDialog } from './add-position-dialog'
import { SavePresetDialog } from './save-preset-dialog'
import { SendOfferDialog, type MusicianForOffer, type MusicianScheduleEntry } from './send-offer-dialog'
import { AssignMusicianDialog } from './assign-musician-dialog'
import { RequestSubDialog } from './request-sub-dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { INSTRUMENT_SECTIONS, SECTION_LABELS } from '@/lib/validations/instruments'
import { getPositionTitle } from '@/lib/orchestra-positions'
import { checkEnsembleDrift } from '@/lib/ensemble-detection'
import type { Service } from '@/types'
import { usePlan } from '@/components/providers/plan-provider'
import { canUseSavedEnsembles } from '@/lib/plan'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export type PositionOfferJoined = {
  id: string
  musician_id: string
  status: string
  sent_at: string | null
  expires_at: string | null
  responded_at: string | null
  token: string
  custom_pay: number | null
  personal_message: string | null
  musician: { id: string; first_name: string; last_name: string; email?: string | null }
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
  musician: { id: string; first_name: string; last_name: string; phone?: string | null } | null
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

export type WaterfallTrigger = {
  positionId: string
  musicianId: string
  customPay: number | null
  isFollowUp?: boolean
}

interface ProjectPositionsProps {
  positions: PositionJoined[]
  projectId: string
  organizationId: string
  books: BookForImport[]
  musicians: MusicianForOffer[]
  services: Service[]
  canManage: boolean
  timezone: string
  ensembleType: string | null
  onPositionChange: () => void
  waterfallTrigger?: WaterfallTrigger | null
  onWaterfallHandled?: () => void
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
            positionLabel: `${position.instrument?.name}${position.chair_number > 1 ? `, Chair ${position.chair_number}` : ''}`,
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
  timezone,
  ensembleType,
  onPositionChange,
  waterfallTrigger,
  onWaterfallHandled,
}: ProjectPositionsProps) {
  const plan = usePlan()
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
  const [assignPositionId, setAssignPositionId] = useState<string | null>(null)
  const [assignInstrumentId, setAssignInstrumentId] = useState<string | null>(null)
  const [assignChairNumber, setAssignChairNumber] = useState<number>(1)
  const [subRequestPosition, setSubRequestPosition] = useState<PositionJoined | null>(null)
  const [unassignPosition, setUnassignPosition] = useState<PositionJoined | null>(null)
  const [unassigning, setUnassigning] = useState(false)
  const [declinePosition, setDeclinePosition] = useState<PositionJoined | null>(null)
  const [declining, setDeclining] = useState(false)
  const [preSelectedMusicianId, setPreSelectedMusicianId] = useState<string | null>(null)
  const [isFollowUp, setIsFollowUp] = useState(false)
  const [ensembleDriftOpen, setEnsembleDriftOpen] = useState(false)
  const [ensembleDriftSuggestion, setEnsembleDriftSuggestion] = useState<string | null>(null)
  const [ensembleLabelInput, setEnsembleLabelInput] = useState('')
  const [updatingEnsembleType, setUpdatingEnsembleType] = useState(false)
  const prevPositionCountRef = useRef(positions.length)
  const hasMountedRef = useRef(false)

  // Detect ensemble drift when positions change (add/remove)
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      prevPositionCountRef.current = positions.length
      return
    }
    // Only check if position count actually changed (add or remove)
    if (positions.length !== prevPositionCountRef.current) {
      prevPositionCountRef.current = positions.length
      checkForEnsembleDrift(positions)
    }
  }, [positions.length, ensembleType]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle waterfall trigger from ProjectOffers
  useEffect(() => {
    if (waterfallTrigger) {
      const position = positions.find(p => p.id === waterfallTrigger.positionId)
      if (position) {
        setOfferPositionId(position.id)
        setOfferInstrumentId(position.instrument_id)
        setOfferChairNumber(position.chair_number)
        setOfferExistingIds(uniqueProjectOfferIds)
        setPreSelectedMusicianId(waterfallTrigger.musicianId)
        setIsFollowUp(!!waterfallTrigger.isFollowUp)
        if (waterfallTrigger.customPay != null) {
          setSuggestedCustomPay(waterfallTrigger.customPay.toString())
        }
      }
      onWaterfallHandled?.()
    }
  }, [waterfallTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  // Get pay info from the first service (services should have consistent pay)
  const firstService = services[0]
  const basePay = (firstService as any)?.base_pay ?? null
  const leaderFee = (firstService as any)?.leader_fee ?? 50

  // Get the project's end date for deadline context
  // We'll compute it from the latest service end_time or start_time
  const projectEndDate = services.length > 0
    ? services
        .map(s => s.end_time || s.start_time)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
        ?.split('T')[0] || null
    : null

  // Collect all musician IDs with active offers across ALL positions in this project
  const projectWideOfferMusicianIds = positions.flatMap(p =>
    p.contract_offers
      .filter(o => o.status === 'pending' || o.status === 'viewed' || o.status === 'accepted')
      .map(o => o.musician_id)
  )
  const uniqueProjectOfferIds = [...new Set(projectWideOfferMusicianIds)]

  function handleSendOffer(position: PositionJoined) {
    if (services.length === 0) {
      toast.error('Add at least one service (rehearsal, concert, etc.) before sending offers.')
      return
    }
    const missingVenue = services.filter(s => !s.venue && !s.venue_id)
    if (missingVenue.length > 0) {
      toast.error('All services need a venue before sending offers. A venue can be "TBD" if not yet confirmed.')
      return
    }
    setOfferPositionId(position.id)
    setOfferInstrumentId(position.instrument_id)
    setOfferChairNumber(position.chair_number)
    setOfferExistingIds(uniqueProjectOfferIds)
  }

  function handleAssign(position: PositionJoined) {
    setAssignPositionId(position.id)
    setAssignInstrumentId(position.instrument_id)
    setAssignChairNumber(position.chair_number)
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
      toast.error('Cannot remove a position with a confirmed musician. Unassign them first.')
      return
    }
    const supabase = createClient()
    const { error } = await supabase.from('project_positions').delete().eq('id', position.id)
    if (error) {
      toast.error('Failed to remove position')
      return
    }
    onPositionChange()
  }

  async function handleClearAll() {
    // Check if any positions are confirmed
    const confirmedPositions = positions.filter(p => p.status === 'confirmed' || p.musician_id)
    if (confirmedPositions.length > 0) {
      toast.error(`Cannot clear all positions. ${confirmedPositions.length} position(s) have confirmed musicians. Unassign them first.`)
      return
    }
    if (!confirm('Remove all positions from this project?')) return
    setClearing(true)
    const supabase = createClient()
    const { error } = await supabase.from('project_positions').delete().eq('project_id', projectId)
    if (error) {
      toast.error('Failed to clear positions')
    } else {
      onPositionChange()
    }
    setClearing(false)
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

  async function confirmDeclineOnBehalf() {
    if (!declinePosition) return
    setDeclining(true)

    try {
      const response = await fetch(`/api/positions/${declinePosition.id}/decline-offer`, {
        method: 'POST',
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || 'Failed to decline offer')
        return
      }

      toast.success('Offer declined on behalf of musician')
      onPositionChange()
    } catch {
      toast.error('Failed to decline offer')
    } finally {
      setDeclining(false)
      setDeclinePosition(null)
    }
  }

  async function handleDuplicatePosition(position: PositionJoined) {
    // Find the next available chair number for this instrument
    const existingChairs = positions
      .filter(p => p.instrument_id === position.instrument_id)
      .map(p => p.chair_number)
    const nextChair = existingChairs.length > 0 ? Math.max(...existingChairs) + 1 : 1

    const supabase = createClient()
    const { error } = await supabase.from('project_positions').insert({
      project_id: projectId,
      instrument_id: position.instrument_id,
      chair_number: nextChair,
      status: 'vacant',
    })
    if (error) {
      toast.error('Failed to add chair')
      return
    }
    onPositionChange()
  }

  function checkForEnsembleDrift(updatedPositions: PositionJoined[]) {
    const positionsForDetection = updatedPositions.map(p => ({
      instrument_name: p.instrument?.name || '',
      chair_number: p.chair_number,
    }))
    const { drifted, suggestion } = checkEnsembleDrift(ensembleType, positionsForDetection)
    if (drifted) {
      setEnsembleDriftSuggestion(suggestion)
      setEnsembleLabelInput(suggestion || '')
      setEnsembleDriftOpen(true)
    }
  }

  async function handleUpdateEnsembleType(newLabel: string | null) {
    setUpdatingEnsembleType(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('projects')
      .update({ ensemble_type: newLabel })
      .eq('id', projectId)
    setUpdatingEnsembleType(false)
    if (error) {
      toast.error('Failed to update ensemble label')
      return
    }
    toast.success(newLabel ? `Ensemble label updated to "${newLabel}"` : 'Ensemble label cleared')
    setEnsembleDriftOpen(false)
    onPositionChange()
  }

  // Count chairs per instrument to determine if chair titles should be shown
  const chairCountByInstrument = new Map<string, number>()
  for (const p of positions) {
    const key = p.instrument_id
    chairCountByInstrument.set(key, (chairCountByInstrument.get(key) || 0) + 1)
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
          <div className="flex flex-wrap items-center gap-1">
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
              Ensemble Presets
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setAddPositionMode('single'); setAddPositionOpen(true) }}>
              Add Position
            </Button>
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} disabled={!canUseSavedEnsembles(plan)} title={!canUseSavedEnsembles(plan) ? 'Pro feature' : undefined}>
              Import from Saved Ensemble
            </Button>
            {totalPositions > 0 && (
              <Button size="sm" variant="outline" onClick={() => setSavePresetOpen(true)} disabled={!canUseSavedEnsembles(plan)} title={!canUseSavedEnsembles(plan) ? 'Pro feature' : undefined}>
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
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-xs whitespace-nowrap">Instrument</th>
                <th className="px-3 py-2 text-left font-medium text-xs whitespace-nowrap">Chair</th>
                <th className="px-3 py-2 text-left font-medium text-xs w-full">Musician</th>
                <th className="px-3 py-2 text-left font-medium text-xs whitespace-nowrap">Status</th>
                <th className="px-3 py-2 text-left font-medium text-xs whitespace-nowrap">Pay</th>
                {canManage && (
                  <th className="px-3 py-2 text-right font-medium text-xs whitespace-nowrap">Actions</th>
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
                        colSpan={canManage ? 6 : 5}
                        className="px-3 py-1.5 bg-muted/20 text-xs font-semibold text-muted-foreground"
                      >
                        {SECTION_LABELS[section]}
                      </td>
                    </tr>
                    {sectionPositions.map((position) => (
                      <tr key={position.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 whitespace-nowrap">{position.instrument?.name}</td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {(chairCountByInstrument.get(position.instrument_id) || 0) > 1
                            ? (() => {
                                const info = getPositionTitle(position.instrument?.name || '', position.chair_number, position.instrument?.section, undefined, positions.length)
                                return (
                                  <span className={info.isLeadership ? 'font-medium text-foreground' : ''}>
                                    {info.title}
                                  </span>
                                )
                              })()
                            : null
                          }
                        </td>
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

                            return (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[position.status] || ''}`}>
                                    {STATUS_LABELS[position.status] || position.status}
                                  </span>
                                  {position.status === 'confirmed' && canManage && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 text-xs text-muted-foreground"
                                      onClick={() => handleUnassign(position)}
                                      title="Release this musician from the position"
                                    >
                                      Unassign
                                    </Button>
                                  )}
                                  {position.status === 'offered' && canManage && pendingOffer && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 text-xs text-destructive"
                                      onClick={() => setDeclinePosition(position)}
                                      title="Decline this offer on behalf of the musician"
                                    >
                                      Decline
                                    </Button>
                                  )}
                                </div>
                                {position.status === 'offered' && offeredToName && (
                                  <span className="text-xs text-muted-foreground">
                                    to {offeredToName}
                                  </span>
                                )}
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground tabular-nums whitespace-nowrap">
                          {(() => {
                            // Show pay from the relevant offer based on position status
                            if (position.status === 'confirmed') {
                              const acceptedOffer = position.contract_offers.find(o => o.status === 'accepted')
                              return acceptedOffer?.custom_pay != null ? `$${acceptedOffer.custom_pay}` : '—'
                            }
                            if (position.status === 'offered') {
                              const pendingOffer = position.contract_offers.find(o => o.status === 'pending' || o.status === 'viewed')
                              return pendingOffer?.custom_pay != null ? `$${pendingOffer.custom_pay}` : '—'
                            }
                            return '—'
                          })()}
                        </td>
                        {canManage && (
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {/* Desktop: inline buttons */}
                            <div className="hidden lg:flex items-center justify-end gap-1">
                              {position.status !== 'confirmed' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleAssign(position)}
                                >
                                  Assign
                                </Button>
                              )}
                              {position.status !== 'confirmed' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSendOffer(position)}
                                >
                                  Offer
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
                            {/* Mobile/tablet: dropdown menu */}
                            <div className="lg:hidden flex justify-end">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
                                    </svg>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {position.status !== 'confirmed' && (
                                    <DropdownMenuItem onClick={() => handleAssign(position)}>
                                      Assign
                                    </DropdownMenuItem>
                                  )}
                                  {position.status !== 'confirmed' && (
                                    <DropdownMenuItem onClick={() => handleSendOffer(position)}>
                                      Offer
                                    </DropdownMenuItem>
                                  )}
                                  {position.musician_id && (
                                    <DropdownMenuItem onClick={() => handleUnassign(position)}>
                                      Unassign
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => handleDuplicatePosition(position)}>
                                    Add Chair
                                  </DropdownMenuItem>
                                  {position.status !== 'confirmed' && !position.musician_id && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        variant="destructive"
                                        onClick={() => handleRemovePosition(position)}
                                      >
                                        Remove
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
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
        onOpenChange={(open) => { if (!open) { setOfferPositionId(null); setOfferInstrumentId(null); setOfferChairNumber(1); setOfferExistingIds([]); setPreSelectedMusicianId(null); setIsFollowUp(false) } }}
        positionId={offerPositionId ?? ''}
        instrumentId={offerInstrumentId ?? ''}
        instrumentName={offerInstrumentId ? positions.find(p => p.instrument_id === offerInstrumentId)?.instrument?.name : undefined}
        chairNumber={offerChairNumber}
        musicians={musicians}
        existingOfferMusicianIds={offerExistingIds}
        basePay={basePay}
        leaderFee={leaderFee}
        suggestedCustomPay={suggestedCustomPay}
        projectEndDate={projectEndDate}
        timezone={timezone}
        nextVacantCount={offerInstrumentId ? positions.filter(p => p.instrument_id === offerInstrumentId && p.status === 'vacant' && p.id !== offerPositionId).length : 0}
        nextInstrumentName={offerInstrumentId ? positions.find(p => p.instrument_id === offerInstrumentId)?.instrument?.name : undefined}
        preSelectedMusicianId={preSelectedMusicianId}
        isFollowUp={isFollowUp}
        onSuccess={(applyPayToRemaining) => {
          if (applyPayToRemaining?.customPay) {
            setSuggestedCustomPay(applyPayToRemaining.customPay)
          }
          // Check staffing progress after this offer
          if (positions.length > 0) {
            const otherPositions = positions.filter(p => p.id !== offerPositionId)
            const allConfirmed = otherPositions.every(p => p.status === 'confirmed')
            const noneVacant = otherPositions.every(p => p.status !== 'vacant')
            if (allConfirmed) {
              toast.success('Fully staffed! All positions are confirmed.')
            } else if (noneVacant) {
              toast.success('All positions offered — waiting on responses.')
            }
          }
          onPositionChange()
        }}
        onSendNext={() => {
          // Find next vacant position for the same instrument
          const nextVacant = positions.find(
            p => p.instrument_id === offerInstrumentId && p.status === 'vacant' && p.id !== offerPositionId
          )
          if (nextVacant) {
            handleSendOffer(nextVacant)
          }
        }}
      />

      <AssignMusicianDialog
        open={assignPositionId !== null}
        onOpenChange={(open) => { if (!open) { setAssignPositionId(null); setAssignInstrumentId(null); setAssignChairNumber(1) } }}
        positionId={assignPositionId ?? ''}
        instrumentId={assignInstrumentId ?? ''}
        instrumentName={assignInstrumentId ? positions.find(p => p.instrument_id === assignInstrumentId)?.instrument?.name : undefined}
        chairNumber={assignChairNumber}
        musicians={musicians}
        existingOfferMusicianIds={uniqueProjectOfferIds}
        onSuccess={() => {
          // Check staffing progress after this assignment
          if (positions.length > 0) {
            const otherPositions = positions.filter(p => p.id !== assignPositionId)
            const allConfirmed = otherPositions.every(p => p.status === 'confirmed')
            if (allConfirmed) {
              toast.success('Fully staffed! All positions are confirmed.')
            }
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
        timezone={timezone}
        onSuccess={onPositionChange}
      />

      {/* Ensemble Label Drift Dialog */}
      <Dialog open={ensembleDriftOpen} onOpenChange={setEnsembleDriftOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update ensemble label?</DialogTitle>
            <DialogDescription>
              {ensembleDriftSuggestion
                ? <>The instrumentation has changed — this looks like a <strong>{ensembleDriftSuggestion}</strong> now, but the label still says &ldquo;{ensembleType}&rdquo;. Musicians see this label in their offers.</>
                : <>The instrumentation no longer matches &ldquo;{ensembleType}&rdquo;. Would you like to update the label? Musicians see this in their offers.</>
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Ensemble label</label>
            <Input
              value={ensembleLabelInput}
              onChange={(e) => setEnsembleLabelInput(e.target.value)}
              placeholder="e.g. String Trio, Chamber Ensemble"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setEnsembleDriftOpen(false)} disabled={updatingEnsembleType}>
              Keep &ldquo;{ensembleType}&rdquo;
            </Button>
            <Button variant="outline" onClick={() => handleUpdateEnsembleType(null)} disabled={updatingEnsembleType}>
              Clear label
            </Button>
            <Button onClick={() => handleUpdateEnsembleType(ensembleLabelInput.trim() || null)} disabled={updatingEnsembleType || !ensembleLabelInput.trim()}>
              {updatingEnsembleType ? 'Updating...' : 'Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <span>
                  {unassignPosition.instrument?.name}
                  {(chairCountByInstrument.get(unassignPosition.instrument_id) || 0) > 1
                    ? `, ${getPositionTitle(unassignPosition.instrument?.name || '', unassignPosition.chair_number, unassignPosition.instrument?.section, undefined, positions.length).title}`
                    : ''
                  }
                </span>
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

      {declinePosition && (() => {
        const pendingOffer = declinePosition.contract_offers.find(
          o => o.status === 'pending' || o.status === 'viewed'
        )
        const musicianName = pendingOffer
          ? `${pendingOffer.musician.first_name} ${pendingOffer.musician.last_name}`
          : null

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
              <h3 className="text-lg font-semibold">Decline Offer on Behalf</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Are you sure you want to decline this offer on behalf of the musician?
              </p>

              <div className="mt-4 rounded-lg border bg-muted/30 p-4 space-y-2">
                {musicianName && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Musician:</span>
                    <span className="font-medium">{musicianName}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Position:</span>
                  <span>
                    {declinePosition.instrument?.name}
                    {(chairCountByInstrument.get(declinePosition.instrument_id) || 0) > 1
                      ? `, ${getPositionTitle(declinePosition.instrument?.name || '', declinePosition.chair_number, declinePosition.instrument?.section, undefined, positions.length).title}`
                      : ''
                    }
                  </span>
                </div>
              </div>

              <div className="mt-4 rounded bg-amber-50 dark:bg-amber-950/50 p-3 text-sm text-amber-700 dark:text-amber-300">
                The musician will receive a decline confirmation email.
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDeclinePosition(null)} disabled={declining}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmDeclineOnBehalf} disabled={declining}>
                  {declining ? 'Declining...' : 'Confirm Decline'}
                </Button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
