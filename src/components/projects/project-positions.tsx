'use client'

import { useState, useEffect, useRef, Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { hasLiveStatus } from '@/lib/staffing/live'
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
import { SECTION_LABELS } from '@/lib/validations/instruments'
import type { Service } from '@/types'
import { usePlan } from '@/components/providers/plan-provider'
import { useVertical } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'
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
import { MusicianFormDialog } from '@/components/musicians/musician-form-dialog'
import { AddRequirementDialog } from './add-requirement-dialog'
import { ChairCallsDialog } from './chair-calls-dialog'
import {
  callScopeChairServices,
  requirementFulfilment,
  type CallScopeView,
  type RequirementRow,
} from '@/lib/staffing/requirement-rules'
import type { MusicianWithInstruments, InstrumentOption } from '@/components/musicians/musicians-client'

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
  /** Null when the admin chose "Someone else" and wants to pick for themselves. */
  musicianId: string | null
  customPay: number | null
  isFollowUp?: boolean
}

/**
 * The auto-offer switches (migration 096): the organization's, and the chairs
 * switched out of it. Null when they could not be read (096 not applied).
 */
export type AutoCascadeSwitches = {
  orgEnabled: boolean
  disabledChairIds: string[]
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
  autoCascade?: AutoCascadeSwitches | null
  /**
   * Chairs' calls and requirements (098/099), present only for an organization
   * with call_scoped_requirements on. Null: nothing about calls or
   * requirements is shown, and every chair works the whole gig.
   */
  callScope?: CallScopeView | null
}

const STATUS_COLORS: Record<string, string> = {
  vacant: 'bg-gray-200 text-gray-800 ring-1 ring-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700',
  offered: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
  confirmed: 'bg-green-100 text-green-800 ring-1 ring-green-300 dark:bg-green-950 dark:text-green-200 dark:ring-green-800',
  declined: 'bg-red-100 text-red-800 ring-1 ring-red-300 dark:bg-red-950 dark:text-red-200 dark:ring-red-800',
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

/**
 * Outside commitments that overlap the calls each seated person works. With
 * `callScope` (call_scoped_requirements on) only the calls their chair works
 * count, as in the chair's own row; a chair whose calls are unknown is checked
 * against every call (over-warning costs a glance, under-warning a double
 * booking). Without it every service counts, exactly as before.
 */
export function detectConflicts(
  positions: PositionJoined[],
  musicians: MusicianForOffer[],
  services: Service[],
  callScope: CallScopeView | null = null
): ConflictInfo[] {
  const conflicts: ConflictInfo[] = []
  for (const position of positions) {
    if (!position.musician_id) continue
    const musician = musicians.find((m) => m.id === position.musician_id)
    if (!musician || !musician.competing_schedules) continue
    const worked = callScopeChairServices(callScope, position.id, services) ?? services
    for (const schedule of musician.competing_schedules) {
      const schedStart = new Date(schedule.start_time).getTime()
      const schedEnd = new Date(schedule.end_time).getTime()
      for (const service of worked) {
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
  autoCascade = null,
  callScope = null,
}: ProjectPositionsProps) {
  const plan = usePlan()
  const { titleRules, terms, sections, features } = useVertical()
  const { getPositionTitle, checkGroupDrift } = titleRules
  const [importOpen, setImportOpen] = useState(false)
  const [addPositionOpen, setAddPositionOpen] = useState(false)
  const [addPositionMode, setAddPositionMode] = useState<'presets' | 'single'>('presets')
  const [savePresetOpen, setSavePresetOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [offerPositionId, setOfferPositionId] = useState<string | null>(null)
  const [offerInstrumentId, setOfferInstrumentId] = useState<string | null>(null)
  const [offerChairNumber, setOfferChairNumber] = useState<number>(1)
  const [offerExistingIds, setOfferExistingIds] = useState<string[]>([])
  const [suggestedCustomPay, setSuggestedCustomPay] = useState<string>('')
  /**
   * The requirement of the chair suggestedCustomPay was chosen on (null: none).
   * With callScope it is carried over only to chairs of that same requirement.
   */
  const [suggestedPayRequirementId, setSuggestedPayRequirementId] = useState<string | null>(null)
  const [assignPositionId, setAssignPositionId] = useState<string | null>(null)
  const [assignInstrumentId, setAssignInstrumentId] = useState<string | null>(null)
  const [assignChairNumber, setAssignChairNumber] = useState<number>(1)
  const [subRequestPosition, setSubRequestPosition] = useState<PositionJoined | null>(null)
  const [unassignPosition, setUnassignPosition] = useState<PositionJoined | null>(null)
  const [unassigning, setUnassigning] = useState(false)
  const [rescindPosition, setRescindPosition] = useState<PositionJoined | null>(null)
  const [rescinding, setRescinding] = useState(false)
  const [savingAutoOfferId, setSavingAutoOfferId] = useState<string | null>(null)
  const [preSelectedMusicianId, setPreSelectedMusicianId] = useState<string | null>(null)
  /** False once "Someone else" opened the dialog, so it does not pre-pick a name. */
  const [offerAutoSelect, setOfferAutoSelect] = useState(true)
  const [isFollowUp, setIsFollowUp] = useState(false)
  const [ensembleDriftOpen, setEnsembleDriftOpen] = useState(false)
  const [ensembleDriftSuggestion, setEnsembleDriftSuggestion] = useState<string | null>(null)
  const [ensembleLabelInput, setEnsembleLabelInput] = useState('')
  const [updatingEnsembleType, setUpdatingEnsembleType] = useState(false)
  const [editingMusician, setEditingMusician] = useState<MusicianWithInstruments | null>(null)
  const [instrumentOptions, setInstrumentOptions] = useState<InstrumentOption[]>([])
  const [editFormOpen, setEditFormOpen] = useState(false)
  const [loadingMusicianId, setLoadingMusicianId] = useState<string | null>(null)
  const [addCrewOpen, setAddCrewOpen] = useState(false)
  const [callsChair, setCallsChair] = useState<{ id: string; label: string; serviceIds: string[] | null } | null>(null)
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
        setOfferAutoSelect(waterfallTrigger.musicianId !== null)
        setIsFollowUp(!!waterfallTrigger.isFollowUp)
        if (waterfallTrigger.customPay != null) {
          setSuggestedCustomPay(waterfallTrigger.customPay.toString())
          setSuggestedPayRequirementId(requirementOf(position.id)?.id ?? null)
        }
      }
      onWaterfallHandled?.()
    }
  }, [waterfallTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  // The offer's pay is for the whole gig, so suggest the sum of every service's
  // rate (null when no service has one). The leader fee default still comes
  // from the first service.
  const firstService = services[0]
  const servicesWithPay = services.filter((s) => s.base_pay != null)
  const basePay = servicesWithPay.length > 0
    ? servicesWithPay.reduce((sum, s) => sum + (s.base_pay ?? 0), 0)
    : null
  // No leader fee in this vertical: none is suggested and the box is hidden.
  const leaderFee = features.useLeaderFee ? (firstService as any)?.leader_fee ?? 50 : null

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
      .filter(o => hasLiveStatus(o.status) || o.status === 'accepted')
      .map(o => o.musician_id)
  )
  const uniqueProjectOfferIds = [...new Set(projectWideOfferMusicianIds)]

  // -- Which calls each chair works, and requirements (only with callScope) --
  // Without callScope every chair works every service: chairServices returns
  // `services` itself and none of the call UI below is rendered. With it, a
  // chair missing from callScope has UNKNOWN calls (null), never every call.
  function chairServices(position: { id: string }): Service[] | null {
    return callScopeChairServices(callScope, position.id, services)
  }
  function scopeUnknown(position: { id: string }): boolean {
    return !!callScope && !callScope.chairs[position.id]
  }
  const sessionsWord = term(terms, 'session', { plural: true, case: 'lower' })
  const projectRequirements: RequirementRow[] = callScope
    ? callScope.requirements.filter((r) => r.project_id === projectId)
    : []
  const positionsWithRequirement = positions.map((p) => ({
    status: p.status,
    requirement_id: callScope?.chairs[p.id]?.requirementId ?? null,
  }))
  function requirementOf(positionId: string | null): RequirementRow | undefined {
    if (!callScope || !positionId) return undefined
    const id = callScope.chairs[positionId]?.requirementId
    return id ? projectRequirements.find((r) => r.id === id) : undefined
  }
  /** Someone is seated in the chair, or holds an offer for it that is open or accepted. */
  function chairInUse(position: PositionJoined): boolean {
    return !!position.musician_id || position.contract_offers.some((o) => hasLiveStatus(o.status) || o.status === 'accepted')
  }
  function callsLabel(position: PositionJoined): string {
    if (scopeUnknown(position)) return `${term(terms, 'session', { plural: true })} unknown: refresh the page`
    const scope = callScope?.chairs[position.id]
    if (!scope || scope.scopeMode === 'all') return `Every ${term(terms, 'session', { case: 'lower' })}`
    const names = (chairServices(position) ?? []).map((s) => s.name)
    return names.length > 0 ? names.join(', ') : `No ${sessionsWord}`
  }
  /** Why the Calls button is disabled for this chair, or null when it is not. */
  function callsDisabledReason(position: PositionJoined): string | null {
    if (scopeUnknown(position)) return `The ${sessionsWord} of this slot could not be read. Refresh the page.`
    if (chairInUse(position)) return `Someone holds or is considering this slot. Withdraw the offer or unassign them to change its ${sessionsWord}.`
    return null
  }
  function openCalls(position: PositionJoined) {
    if (scopeUnknown(position)) return
    const scope = callScope?.chairs[position.id]
    setCallsChair({
      id: position.id,
      label: `${position.instrument?.name ?? ''} ${position.chair_number}`.trim(),
      serviceIds: scope && scope.scopeMode === 'selected' ? scope.serviceIds : null,
    })
  }
  // What the Send Offer dialog suggests for the chair it is open on: an amount
  // the admin chose for the remaining chairs wins (with callScope, only on
  // chairs of the requirement it was chosen on), then the chair's
  // requirement's whole-engagement amount. Its rate total is over the calls
  // the chair works (every service, without callScope: as before; none when
  // the chair's calls are unknown).
  const offerRequirement = requirementOf(offerPositionId)
  const offerRequirementId = offerRequirement?.id ?? null
  const carriedPay = !callScope || suggestedPayRequirementId === offerRequirementId ? suggestedCustomPay : ''
  const offerSuggestedPay = carriedPay
    || (offerRequirement?.default_pay != null ? String(offerRequirement.default_pay) : '')
  const offerChairServices = callScope && offerPositionId ? chairServices({ id: offerPositionId }) : services
  const offerBasePay = offerChairServices === services
    ? basePay
    : offerChairServices?.some((s) => s.base_pay != null)
      ? offerChairServices.reduce((sum, s) => sum + (s.base_pay ?? 0), 0)
      : null
  /**
   * The chairs "Send next" and "Apply to remaining" move on to: vacant chairs
   * of the same role and, with callScope, of the same requirement (or none),
   * so a load-in amount never carries to a strike chair.
   */
  function isNextForOffer(p: PositionJoined): boolean {
    if (p.instrument_id !== offerInstrumentId || p.status !== 'vacant' || p.id === offerPositionId) return false
    return !callScope || (callScope.chairs[p.id]?.requirementId ?? null) === offerRequirementId
  }

  function handleSendOffer(position: PositionJoined) {
    if (services.length === 0) {
      toast.error(`Add at least one ${term(terms, 'session', { case: 'lower' })} (rehearsal, concert, etc.) before sending offers.`)
      return
    }
    const missingVenue = services.filter(s => !s.venue && !s.venue_id)
    if (missingVenue.length > 0) {
      toast.error(`All ${term(terms, 'session', { plural: true, case: 'lower' })} need a venue before sending offers. A venue can be "TBD" if not yet confirmed.`)
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

  async function handleEditMusician(musicianId: string) {
    if (loadingMusicianId) return
    setLoadingMusicianId(musicianId)
    const supabase = createClient()
    const [musicianRes, instrumentsRes] = await Promise.all([
      supabase
        .from('musicians')
        .select('*, musician_instruments(instrument_id)')
        .eq('id', musicianId)
        .single(),
      supabase
        .from('instruments')
        .select('id, name, section, sort_order')
        .eq('organization_id', organizationId)
        .order('sort_order', { ascending: true }),
    ])
    setLoadingMusicianId(null)
    if (musicianRes.error || !musicianRes.data) {
      toast.error(`Could not load ${term(terms, 'person', { case: 'lower' })}: ` + (musicianRes.error?.message || 'not found'))
      return
    }
    if (instrumentsRes.error) {
      toast.error(`Could not load ${term(terms, 'skill', { plural: true, case: 'lower' })}: ` + instrumentsRes.error.message)
      return
    }
    setEditingMusician(musicianRes.data as MusicianWithInstruments)
    setInstrumentOptions((instrumentsRes.data || []) as InstrumentOption[])
    setEditFormOpen(true)
  }

  // Group positions by section
  const grouped = sections.reduce((acc, section) => {
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
      toast.error(`Cannot remove a position with a confirmed ${term(terms, 'person', { case: 'lower' })}. Unassign them first.`)
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

  function handleClearAll() {
    // Check if any positions are confirmed
    const confirmedPositions = positions.filter(p => p.status === 'confirmed' || p.musician_id)
    if (confirmedPositions.length > 0) {
      toast.error(`Cannot clear all positions. ${confirmedPositions.length} position(s) have confirmed ${term(terms, 'person', { plural: true, case: 'lower' })}. Unassign them first.`)
      return
    }
    setShowClearConfirm(true)
  }

  async function confirmClearAll() {
    setClearing(true)
    const supabase = createClient()
    const { error } = await supabase.from('project_positions').delete().eq('project_id', projectId)
    if (error) {
      toast.error('Failed to clear positions')
    } else {
      setShowClearConfirm(false)
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
        toast.error(result.error || `Failed to unassign ${term(terms, 'person', { case: 'lower' })}`)
        return
      }

      toast.success(`${term(terms, 'person')} unassigned and notified`)
      onPositionChange()
    } catch {
      toast.error(`Failed to unassign ${term(terms, 'person', { case: 'lower' })}`)
    } finally {
      setUnassigning(false)
      setUnassignPosition(null)
    }
  }

  /**
   * The chair's "don't auto-offer" switch, or null when it is not shown. Shown
   * while the organization has auto-offer on, and on any chair already switched
   * out (so it can be switched back even after the organization turns it off).
   */
  function autoOfferState(position: PositionJoined): { disabled: boolean } | null {
    if (!autoCascade) return null
    const disabled = autoCascade.disabledChairIds.includes(position.id)
    return autoCascade.orgEnabled || disabled ? { disabled } : null
  }

  // "chair" for verticals with chairs, "spot" for the ones without.
  const rankWord = term(terms, 'rank', { case: 'lower' }) || 'spot'

  async function handleToggleAutoOffer(position: PositionJoined, disabled: boolean) {
    setSavingAutoOfferId(position.id)
    try {
      const response = await fetch(`/api/positions/${position.id}/auto-cascade`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast.error(result.error || `Failed to update this ${rankWord}`)
        return
      }
      toast.success(disabled ? `This ${rankWord} will not be auto-offered` : `This ${rankWord} will be auto-offered again`)
      onPositionChange()
    } catch {
      toast.error(`Failed to update this ${rankWord}`)
    } finally {
      setSavingAutoOfferId(null)
    }
  }

  async function confirmRescind() {
    if (!rescindPosition) return
    setRescinding(true)

    try {
      const response = await fetch(`/api/positions/${rescindPosition.id}/rescind-offer`, {
        method: 'POST',
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || 'Failed to rescind offer')
        return
      }

      toast.success('Offer rescinded')
      onPositionChange()
    } catch {
      toast.error('Failed to rescind offer')
    } finally {
      setRescinding(false)
      setRescindPosition(null)
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
      toast.error(`Failed to add ${term(terms, 'rank', { case: 'lower' })}`)
      return
    }
    onPositionChange()
  }

  function checkForEnsembleDrift(updatedPositions: PositionJoined[]) {
    const positionsForDetection = updatedPositions.map(p => ({
      instrument_name: p.instrument?.name || '',
      chair_number: p.chair_number,
    }))
    const { drifted, suggestion } = checkGroupDrift(ensembleType, positionsForDetection)
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
            {callScope && (
              <Button size="sm" variant="outline" onClick={() => setAddCrewOpen(true)}>
                Add crew
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} disabled={!canUseSavedEnsembles(plan)} title={!canUseSavedEnsembles(plan) ? 'Pro feature' : undefined}>
              Import from {term(terms, 'groupList')}
            </Button>
            {totalPositions > 0 && (
              <Button size="sm" variant="outline" onClick={() => setSavePresetOpen(true)} disabled={!canUseSavedEnsembles(plan)} title={!canUseSavedEnsembles(plan) ? 'Pro feature' : undefined}>
                Save as Preset
              </Button>
            )}
          </div>
        )}
      </div>

      {projectRequirements.length > 0 && (
        <ul className="space-y-1 rounded-md border bg-muted/20 px-3 py-2 text-xs">
          {projectRequirements.map((r) => {
            const f = requirementFulfilment(r, positionsWithRequirement)
            const role = positions.find((p) => p.instrument_id === r.instrument_id)?.instrument?.name ?? term(terms, 'skill')
            const firstChair = positions.find((p) => callScope?.chairs[p.id]?.requirementId === r.id)
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-2">
                <span className="font-medium">{role} × {r.quantity}</span>
                {firstChair && <span className="text-muted-foreground">{callsLabel(firstChair)}</span>}
                <span className={f.state === 'filled' ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}>
                  {f.state === 'cancelled' ? 'Cancelled' : `${f.confirmed} of ${f.quantity} confirmed`}
                  {f.offered > 0 ? `, ${f.offered} offered` : ''}
                </span>
                {r.default_pay != null && (
                  <span className="text-muted-foreground tabular-nums">{`$${r.default_pay.toLocaleString()} each`}</span>
                )}
                {r.notes && <span className="text-muted-foreground italic">{r.notes}</span>}
              </li>
            )
          })}
        </ul>
      )}

      {totalPositions === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No positions defined. Import from a {term(terms, 'groupList', { case: 'lower' })} or add positions manually.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-xs whitespace-nowrap">{term(terms, 'skill')}</th>
                <th className="px-3 py-2 text-left font-medium text-xs whitespace-nowrap">{term(terms, 'rank')}</th>
                <th className="px-3 py-2 text-left font-medium text-xs w-full">{term(terms, 'person')}</th>
                <th className="px-3 py-2 text-left font-medium text-xs whitespace-nowrap">Status</th>
                <th className="px-3 py-2 text-left font-medium text-xs whitespace-nowrap">Pay</th>
                {canManage && (
                  <th className="px-3 py-2 text-right font-medium text-xs whitespace-nowrap">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {sections.map((section) => {
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
                        <td className="px-3 py-2 whitespace-nowrap">
                          {position.instrument?.name}
                          {callScope && (
                            <span className="block text-xs text-muted-foreground" title={`Which ${sessionsWord} this slot works`}>
                              {callsLabel(position)}
                            </span>
                          )}
                        </td>
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
                                  return (chairServices(position) ?? services).some((svc) => {
                                    const svcStart = new Date(svc.start_time).getTime()
                                    const svcEnd = svc.end_time ? new Date(svc.end_time).getTime() : svcStart + 3600000
                                    return schedStart < svcEnd && schedEnd > svcStart
                                  })
                                })
                                const isLoading = loadingMusicianId === position.musician_id
                                return (
                                  <span className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleEditMusician(position.musician!.id)}
                                      disabled={isLoading}
                                      className="text-left text-primary hover:underline disabled:opacity-60 disabled:cursor-wait"
                                      title={`Edit ${term(terms, 'person', { case: 'lower' })} details`}
                                    >
                                      {position.musician.first_name} {position.musician.last_name}
                                    </button>
                                    {isLoading && (
                                      <svg className="h-3 w-3 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                                      </svg>
                                    )}
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
                              o => hasLiveStatus(o.status)
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
                                  {position.status === 'offered' && canManage && pendingOffer && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 text-xs text-destructive"
                                      onClick={() => setRescindPosition(position)}
                                      title="Withdraw this outstanding offer"
                                    >
                                      Rescind
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
                              if (acceptedOffer?.custom_pay != null) return `$${acceptedOffer.custom_pay}`
                              const basePay = (chairServices(position) ?? []).reduce((sum, s) => sum + (s.base_pay ?? 0), 0)
                              return basePay > 0
                                ? <span title="The gig's base pay (no custom amount on the offer)">${basePay.toLocaleString()} <span className="text-xs">base</span></span>
                                : '—'
                            }
                            if (position.status === 'offered') {
                              const pendingOffer = position.contract_offers.find(o => hasLiveStatus(o.status))
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
                              {callScope && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={callsDisabledReason(position) !== null}
                                  onClick={() => openCalls(position)}
                                  title={callsDisabledReason(position) ?? `Choose which ${sessionsWord} this slot works`}
                                >
                                  {term(terms, 'session', { plural: true })}
                                </Button>
                              )}
                              {autoOfferState(position) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={savingAutoOfferId === position.id}
                                  onClick={() => handleToggleAutoOffer(position, !autoOfferState(position)!.disabled)}
                                  title={autoOfferState(position)!.disabled
                                    ? `Auto-offer is off for this ${rankWord}: if someone declines or drops out, you pick who is next. Click to turn it back on.`
                                    : `If someone declines or drops out, Podium offers this ${rankWord} to the next person automatically. Click to turn that off for this ${rankWord}.`}
                                >
                                  {autoOfferState(position)!.disabled ? 'Auto-offer off' : 'Auto-offer on'}
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDuplicatePosition(position)}
                                title={`Add another ${term(terms, 'rank', { case: 'lower' })} for this ${term(terms, 'skill', { case: 'lower' })}`}
                              >
                                + {term(terms, 'rank')}
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
                                  {callScope && (
                                    <DropdownMenuItem disabled={callsDisabledReason(position) !== null} onClick={() => openCalls(position)}>
                                      {term(terms, 'session', { plural: true })}
                                    </DropdownMenuItem>
                                  )}
                                  {autoOfferState(position) && (
                                    <DropdownMenuItem
                                      disabled={savingAutoOfferId === position.id}
                                      onClick={() => handleToggleAutoOffer(position, !autoOfferState(position)!.disabled)}
                                    >
                                      {autoOfferState(position)!.disabled
                                        ? `Auto-offer this ${rankWord} again`
                                        : `Don't auto-offer this ${rankWord}`}
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => handleDuplicatePosition(position)}>
                                    Add {term(terms, 'rank')}
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

      {callScope && (
        <>
          <AddRequirementDialog
            open={addCrewOpen}
            onOpenChange={setAddCrewOpen}
            projectId={projectId}
            organizationId={organizationId}
            services={services}
            timezone={timezone}
            onSuccess={onPositionChange}
          />
          <ChairCallsDialog
            chair={callsChair}
            onClose={() => setCallsChair(null)}
            services={services}
            timezone={timezone}
            onSuccess={onPositionChange}
          />
        </>
      )}

      <SavePresetDialog
        open={savePresetOpen}
        onOpenChange={setSavePresetOpen}
        positions={positions}
        organizationId={organizationId}
        onSuccess={() => {}}
      />

      <SendOfferDialog
        open={offerPositionId !== null}
        onOpenChange={(open) => { if (!open) { setOfferPositionId(null); setOfferInstrumentId(null); setOfferChairNumber(1); setOfferExistingIds([]); setPreSelectedMusicianId(null); setOfferAutoSelect(true); setIsFollowUp(false) } }}
        positionId={offerPositionId ?? ''}
        instrumentId={offerInstrumentId ?? ''}
        instrumentName={offerInstrumentId ? positions.find(p => p.instrument_id === offerInstrumentId)?.instrument?.name : undefined}
        chairNumber={offerChairNumber}
        musicians={musicians}
        existingOfferMusicianIds={offerExistingIds}
        basePay={offerBasePay}
        leaderFee={leaderFee}
        showLeaderFee={features.useLeaderFee}
        suggestedCustomPay={offerSuggestedPay}
        projectEndDate={projectEndDate}
        timezone={timezone}
        nextVacantCount={offerInstrumentId ? positions.filter(isNextForOffer).length : 0}
        nextInstrumentName={offerInstrumentId ? positions.find(p => p.instrument_id === offerInstrumentId)?.instrument?.name : undefined}
        preSelectedMusicianId={preSelectedMusicianId}
        autoSelect={offerAutoSelect}
        isFollowUp={isFollowUp}
        onSuccess={(applyPayToRemaining) => {
          if (applyPayToRemaining?.customPay) {
            setSuggestedCustomPay(applyPayToRemaining.customPay)
            setSuggestedPayRequirementId(offerRequirementId)
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
          // Find next vacant position for the same instrument (and requirement)
          const nextVacant = positions.find(isNextForOffer)
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
        existingOfferMusicianIds={
          // Exclude musicians booked/offered on OTHER chairs (prevents double-booking),
          // but allow the musician who holds THIS chair's offer to be selected — that's
          // the case where they accepted by text and the admin is confirming manually.
          [...new Set(
            positions
              .filter((p) => p.id !== assignPositionId)
              .flatMap((p) =>
                p.contract_offers
                  .filter((o) => hasLiveStatus(o.status) || o.status === 'accepted')
                  .map((o) => o.musician_id)
              )
          )]
        }
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

      {/* Clear All Positions Confirmation */}
      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove all positions?</DialogTitle>
            <DialogDescription>
              This will remove all {positions.length} position{positions.length === 1 ? '' : 's'} from
              this {term(terms, 'work', { case: 'lower' })}. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setShowClearConfirm(false)} disabled={clearing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmClearAll} disabled={clearing}>
              {clearing ? 'Removing…' : `Remove ${positions.length} position${positions.length === 1 ? '' : 's'}`}
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
              Are you sure you want to unassign this {term(terms, 'person', { case: 'lower' })}?
            </p>

            <div className="mt-4 rounded-lg border bg-muted/30 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{term(terms, 'person')}:</span>
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
              Both the {term(terms, 'person', { case: 'lower' })} and organization admins will be notified by email.
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

      {rescindPosition && (() => {
        const pendingOffer = rescindPosition.contract_offers.find(
          o => hasLiveStatus(o.status)
        )
        const musicianName = pendingOffer
          ? `${pendingOffer.musician.first_name} ${pendingOffer.musician.last_name}`
          : null

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
              <h3 className="text-lg font-semibold">Rescind Offer</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Withdraw this outstanding offer? The position will return to vacant and the offer link will stop working.
              </p>

              <div className="mt-4 rounded-lg border bg-muted/30 p-4 space-y-2">
                {musicianName && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{term(terms, 'person')}:</span>
                    <span className="font-medium">{musicianName}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Position:</span>
                  <span>
                    {rescindPosition.instrument?.name}
                    {(chairCountByInstrument.get(rescindPosition.instrument_id) || 0) > 1
                      ? `, ${getPositionTitle(rescindPosition.instrument?.name || '', rescindPosition.chair_number, rescindPosition.instrument?.section, undefined, positions.length).title}`
                      : ''
                    }
                  </span>
                </div>
              </div>

              <div className="mt-4 rounded bg-amber-50 dark:bg-amber-950/50 p-3 text-sm text-amber-700 dark:text-amber-300">
                The {term(terms, 'person', { case: 'lower' })} will be emailed that the offer was withdrawn.
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRescindPosition(null)} disabled={rescinding}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmRescind} disabled={rescinding}>
                  {rescinding ? 'Rescinding...' : 'Confirm Rescind'}
                </Button>
              </div>
            </div>
          </div>
        )
      })()}

      <MusicianFormDialog
        open={editFormOpen}
        onOpenChange={setEditFormOpen}
        musician={editingMusician}
        instruments={instrumentOptions}
        organizationId={organizationId}
        onSuccess={() => {
          setEditFormOpen(false)
          onPositionChange()
        }}
      />
    </div>
  )
}
