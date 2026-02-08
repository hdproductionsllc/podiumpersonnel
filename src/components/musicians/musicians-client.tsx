'use client'

import { useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/ui/empty-state'
import { MusicianFormDialog } from './musician-form-dialog'
import { DeleteMusicianDialog } from './delete-musician-dialog'
import { BulkEditDialog } from './bulk-edit-dialog'
import { CallOrderDialog } from './call-order-dialog'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import type { Musician } from '@/types'
import { INSTRUMENT_SECTIONS, SECTION_LABELS, type InstrumentSection } from '@/lib/validations/instruments'

function formatPhoneNumber(phone: string | null): string {
  if (!phone) return '\u2014'
  const digits = phone.replace(/\D/g, '')
  // Handle 10-digit US numbers
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  // Handle 11-digit with leading 1
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  // Return original if can't format
  return phone
}

export type MusicianInstrumentJoin = {
  id: string
  instrument_id: string
  is_primary: boolean
  proficiency: string
  instrument: {
    id: string
    name: string
    abbreviation: string | null
    section: string | null
  }
}

export type MusicianWithInstruments = Musician & {
  musician_instruments: MusicianInstrumentJoin[]
  tags?: string[]
  zip_code?: string | null
  home_region?: string | null
  service_radius_miles?: number | null
  call_order?: number
  is_leader?: boolean
  w9_on_file?: boolean
  w9_file_url?: string | null
  zelle_method?: 'email' | 'phone' | null
  zelle_verified?: boolean
  user_id?: string | null
  portal_invite_token?: string | null
  portal_invite_sent_at?: string | null
  portal_invite_expires_at?: string | null
  portal_last_login?: string | null
  portal_enabled?: boolean
}

export type InstrumentOption = {
  id: string
  name: string
  section: string | null
  sort_order: number
}

export type BookOption = {
  id: string
  name: string
  book_entries: { musician_id: string }[]
}

interface MusiciansClientProps {
  musicians: MusicianWithInstruments[]
  instruments: InstrumentOption[]
  books: BookOption[]
  organizationId: string
  organizationName: string
  userRole: string
}

export function MusiciansClient({
  musicians,
  instruments,
  books,
  organizationId,
  organizationName,
  userRole,
}: MusiciansClientProps) {
  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editingMusician, setEditingMusician] = useState<MusicianWithInstruments | null>(null)
  const [deletingMusician, setDeletingMusician] = useState<MusicianWithInstruments | null>(null)

  // Collapsible section state for grouped-by-instrument view
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  // Filter state
  const [search, setSearch] = useState('')
  const [instrumentFilter, setInstrumentFilter] = useState('')
  const [sectionFilter, setSectionFilter] = useState<InstrumentSection | ''>('')
  const [bookFilter, setBookFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('')
  const [tagFilter, setTagFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [missingInfoFilter, setMissingInfoFilter] = useState(false)
  const [w9Filter, setW9Filter] = useState<'' | 'has_w9' | 'no_w9'>('')

  // Call order dialog state
  const [callOrderOpen, setCallOrderOpen] = useState(false)

  // Call order banner state
  const [callOrderBannerDismissed, setCallOrderBannerDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('podium_call_order_banner_dismissed') === 'true'
    }
    return false
  })

  // Selection state for bulk edit
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkEditOpen, setBulkEditOpen] = useState(false)

  // Sort state
  type SortColumn = 'name' | 'email' | 'phone' | 'tags' | 'status' | 'call_order' | 'home_region'
  const [sortColumn, setSortColumn] = useState<SortColumn>('call_order')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Get unique tags from all musicians
  const allTags = Array.from(
    new Set(musicians.flatMap((m) => m.tags || []))
  ).sort()

  // Get unique regions from all musicians
  const allRegions = Array.from(
    new Set(musicians.map((m) => m.home_region).filter((r): r is string => !!r))
  ).sort()

  // Get instruments that are actually used by musicians
  const usedInstrumentIds = new Set(
    musicians.flatMap((m) => m.musician_instruments.map((mi) => mi.instrument_id))
  )
  const usedInstruments = instruments.filter((i) => usedInstrumentIds.has(i.id))

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importTag, setImportTag] = useState('')
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showPostImportGuide, setShowPostImportGuide] = useState(false)
  const [importStats, setImportStats] = useState<{ total: number; withEmail: number; withoutEmail: number; withPhone: number; withoutPhone: number } | null>(null)

  const canManage = userRole === 'owner' || userRole === 'admin'

  // Check if call order has been configured for any active musician with instruments
  const callOrderNotConfigured = useMemo(() => {
    const activeWithInstruments = musicians.filter(
      (m) => m.is_active && m.musician_instruments.length > 0
    )
    if (activeWithInstruments.length === 0) return false
    return activeWithInstruments.every(
      (m) => m.call_order === null || m.call_order === undefined || m.call_order === 100
    )
  }, [musicians])

  const showCallOrderBanner = canManage && callOrderNotConfigured && !callOrderBannerDismissed

  const hasFilters = search !== '' || instrumentFilter !== '' || sectionFilter !== '' || bookFilter !== '' || statusFilter !== '' || tagFilter !== '' || regionFilter !== '' || missingInfoFilter || w9Filter !== ''

  // Get unique sections that are actually used by musicians' instruments
  const usedSections = Array.from(
    new Set(
      musicians.flatMap((m) =>
        m.musician_instruments.map((mi) => mi.instrument.section).filter((s): s is string => !!s)
      )
    )
  ).filter((s) => INSTRUMENT_SECTIONS.includes(s as InstrumentSection)) as InstrumentSection[]

  // Count musicians with missing info
  const missingInfoCount = musicians.filter((m) => !m.email || !m.phone).length

  // Count musicians without W-9 on file
  const noW9Count = musicians.filter((m) => !m.w9_on_file).length

  const filteredMusicians = musicians
    .filter((m) => {
      if (search) {
        const q = search.toLowerCase()
        const nameMatch = `${m.first_name} ${m.last_name}`.toLowerCase().includes(q)
          || `${m.last_name}, ${m.first_name}`.toLowerCase().includes(q)
        const emailMatch = m.email?.toLowerCase().includes(q)
        if (!nameMatch && !emailMatch) return false
      }
      if (instrumentFilter) {
        if (!m.musician_instruments.some((mi) => mi.instrument_id === instrumentFilter)) return false
      }
      if (sectionFilter) {
        if (!m.musician_instruments.some((mi) => mi.instrument.section === sectionFilter)) return false
      }
      if (bookFilter) {
        const book = books.find((b) => b.id === bookFilter)
        if (!book) return false
        const bookMusicianIds = new Set(book.book_entries.map((e) => e.musician_id))
        if (!bookMusicianIds.has(m.id)) return false
      }
      if (statusFilter) {
        if (statusFilter === 'active' && !m.is_active) return false
        if (statusFilter === 'inactive' && m.is_active) return false
      }
      if (tagFilter) {
        if (!m.tags || !m.tags.includes(tagFilter)) return false
      }
      if (regionFilter) {
        if (m.home_region !== regionFilter) return false
      }
      if (missingInfoFilter) {
        if (m.email && m.phone) return false
      }
      if (w9Filter) {
        if (w9Filter === 'has_w9' && !m.w9_on_file) return false
        if (w9Filter === 'no_w9' && m.w9_on_file) return false
      }
      return true
    })
    .sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1

      switch (sortColumn) {
        case 'name': {
          const aName = `${a.last_name}, ${a.first_name}`.toLowerCase()
          const bName = `${b.last_name}, ${b.first_name}`.toLowerCase()
          return aName.localeCompare(bName) * dir
        }
        case 'email': {
          const aEmail = (a.email || '').toLowerCase()
          const bEmail = (b.email || '').toLowerCase()
          if (!aEmail && !bEmail) return 0
          if (!aEmail) return 1
          if (!bEmail) return -1
          return aEmail.localeCompare(bEmail) * dir
        }
        case 'phone': {
          const aPhone = a.phone || ''
          const bPhone = b.phone || ''
          if (!aPhone && !bPhone) return 0
          if (!aPhone) return 1
          if (!bPhone) return -1
          return aPhone.localeCompare(bPhone) * dir
        }
        case 'tags': {
          const aTags = (a.tags || []).sort().join(', ').toLowerCase()
          const bTags = (b.tags || []).sort().join(', ').toLowerCase()
          if (!aTags && !bTags) return 0
          if (!aTags) return 1
          if (!bTags) return -1
          return aTags.localeCompare(bTags) * dir
        }
        case 'status': {
          const aActive = a.is_active ? 1 : 0
          const bActive = b.is_active ? 1 : 0
          return (aActive - bActive) * dir
        }
        case 'call_order': {
          const aOrder = a.call_order ?? 999999
          const bOrder = b.call_order ?? 999999
          return (aOrder - bOrder) * dir
        }
        case 'home_region': {
          const aRegion = (a.home_region || '').toLowerCase()
          const bRegion = (b.home_region || '').toLowerCase()
          if (!aRegion && !bRegion) return 0
          if (!aRegion) return 1
          if (!bRegion) return -1
          return aRegion.localeCompare(bRegion) * dir
        }
        default:
          return 0
      }
    })

  // Grouped by instrument family (e.g. "Violin 1" + "Violin 2" → "Violin")
  const groupedByInstrument = useMemo(() => {
    // Get the family name: strip trailing " 1", " 2", etc.
    function instrumentFamily(name: string): string {
      return name.replace(/\s+\d+$/, '')
    }

    // Build a map: instrument family → musicians who play any variant
    const groups = new Map<string, { instrument: InstrumentOption; musicians: MusicianWithInstruments[] }>()
    const unassigned: MusicianWithInstruments[] = []

    for (const musician of filteredMusicians) {
      if (musician.musician_instruments.length === 0) {
        unassigned.push(musician)
        continue
      }
      for (const mi of musician.musician_instruments) {
        const inst = instruments.find((i) => i.id === mi.instrument_id)
        if (!inst) continue
        const family = instrumentFamily(inst.name)
        if (!groups.has(family)) {
          // Use the first instrument in the family as the representative
          // but override the name to the family name
          groups.set(family, {
            instrument: { ...inst, name: family },
            musicians: [],
          })
        }
        const group = groups.get(family)!
        // Deduplicate: only add if this musician isn't already in the group
        if (!group.musicians.some((m) => m.id === musician.id)) {
          group.musicians.push(musician)
        }
      }
    }

    // Sort musicians within each group using current sort column/direction
    const sortFn = (a: MusicianWithInstruments, b: MusicianWithInstruments) => {
      const dir = sortDirection === 'asc' ? 1 : -1
      switch (sortColumn) {
        case 'name': {
          const aName = `${a.last_name}, ${a.first_name}`.toLowerCase()
          const bName = `${b.last_name}, ${b.first_name}`.toLowerCase()
          return aName.localeCompare(bName) * dir
        }
        case 'email': {
          const aEmail = (a.email || '').toLowerCase()
          const bEmail = (b.email || '').toLowerCase()
          if (!aEmail && !bEmail) return 0
          if (!aEmail) return 1
          if (!bEmail) return -1
          return aEmail.localeCompare(bEmail) * dir
        }
        case 'phone': {
          const aPhone = a.phone || ''
          const bPhone = b.phone || ''
          if (!aPhone && !bPhone) return 0
          if (!aPhone) return 1
          if (!bPhone) return -1
          return aPhone.localeCompare(bPhone) * dir
        }
        case 'tags': {
          const aTags = (a.tags || []).sort().join(', ').toLowerCase()
          const bTags = (b.tags || []).sort().join(', ').toLowerCase()
          if (!aTags && !bTags) return 0
          if (!aTags) return 1
          if (!bTags) return -1
          return aTags.localeCompare(bTags) * dir
        }
        case 'status': {
          const aActive = a.is_active ? 1 : 0
          const bActive = b.is_active ? 1 : 0
          return (aActive - bActive) * dir
        }
        case 'home_region': {
          const aRegion = (a.home_region || '').toLowerCase()
          const bRegion = (b.home_region || '').toLowerCase()
          if (!aRegion && !bRegion) return 0
          if (!aRegion) return 1
          if (!bRegion) return -1
          return aRegion.localeCompare(bRegion) * dir
        }
        case 'call_order':
        default: {
          const aOrder = a.call_order ?? 999999
          const bOrder = b.call_order ?? 999999
          if (aOrder !== bOrder) return (aOrder - bOrder) * dir
          return `${a.last_name}, ${a.first_name}`.localeCompare(`${b.last_name}, ${b.first_name}`)
        }
      }
    }

    for (const group of groups.values()) {
      group.musicians.sort(sortFn)
    }
    unassigned.sort(sortFn)

    // Sort groups: by INSTRUMENT_SECTIONS order, then by sort_order
    const sectionOrder = INSTRUMENT_SECTIONS as readonly string[]
    const sorted = Array.from(groups.values()).sort((a, b) => {
      const aSec = sectionOrder.indexOf(a.instrument.section || 'other')
      const bSec = sectionOrder.indexOf(b.instrument.section || 'other')
      if (aSec !== bSec) return aSec - bSec
      return a.instrument.sort_order - b.instrument.sort_order
    })

    return { groups: sorted, unassigned }
  }, [filteredMusicians, instruments, sortColumn, sortDirection])

  function toggleSection(instrumentId: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(instrumentId)) {
        next.delete(instrumentId)
      } else {
        next.add(instrumentId)
      }
      return next
    })
  }

  function handleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  function SortIcon({ column }: { column: SortColumn }) {
    if (sortColumn !== column) {
      return (
        <svg className="ml-1 h-3 w-3 opacity-30 inline-block" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
        </svg>
      )
    }
    return sortDirection === 'asc' ? (
      <svg className="ml-1 h-3 w-3 inline-block" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
      </svg>
    ) : (
      <svg className="ml-1 h-3 w-3 inline-block" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
      </svg>
    )
  }

  function renderMusicianRow(musician: MusicianWithInstruments) {
    return (
      <tr
        key={musician.id}
        className={`hover:bg-muted/30 ${selectMode && selectedIds.has(musician.id) ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}
        onClick={selectMode ? () => toggleSelect(musician.id) : undefined}
      >
        {selectMode && (
          <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300"
              checked={selectedIds.has(musician.id)}
              onChange={() => toggleSelect(musician.id)}
            />
          </td>
        )}
        <td className="px-4 py-2 text-center text-muted-foreground">
          {musician.call_order ?? '\u2014'}
        </td>
        <td className="px-4 py-2 font-medium">
          <div className="flex items-center gap-2">
            {canManage && !selectMode ? (
              <button
                onClick={(e) => { e.stopPropagation(); handleEdit(musician) }}
                className="text-left hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
              >
                {musician.last_name}, {musician.first_name}
              </button>
            ) : (
              <span>{musician.last_name}, {musician.first_name}</span>
            )}
            {(!musician.email || !musician.phone) && (
              <button
                onClick={(e) => { e.stopPropagation(); handleEdit(musician) }}
                className="inline-flex items-center rounded bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors"
                title={`Missing: ${[!musician.email && 'email', !musician.phone && 'phone'].filter(Boolean).join(', ')} - Click to edit`}
              >
                <svg className="h-3 w-3 mr-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                Info
              </button>
            )}
          </div>
        </td>
        <td className="px-4 py-2 text-muted-foreground">
          {musician.email ? (
            <a
              href={`mailto:${musician.email}`}
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {musician.email}
            </a>
          ) : '\u2014'}
        </td>
        <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
          {musician.phone ? (
            <a
              href={`tel:${musician.phone.replace(/[^\d+]/g, '')}`}
              className="hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {formatPhoneNumber(musician.phone)}
            </a>
          ) : '\u2014'}
        </td>
        <td className="px-4 py-2 text-muted-foreground">
          {musician.home_region || '\u2014'}
        </td>
        <td className="px-4 py-2">
          <div className="flex flex-wrap gap-1">
            {canManage && !selectMode ? (
              <button
                onClick={(e) => { e.stopPropagation(); handleEdit(musician) }}
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer transition-opacity hover:opacity-80 ${
                  musician.is_active
                    ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                }`}
              >
                {musician.is_active ? 'Active' : 'Inactive'}
              </button>
            ) : (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  musician.is_active
                    ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                }`}
              >
                {musician.is_active ? 'Active' : 'Inactive'}
              </span>
            )}
            {canManage && !selectMode ? (
              <button
                onClick={(e) => { e.stopPropagation(); handleEdit(musician) }}
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer transition-opacity hover:opacity-80 ${
                  musician.w9_on_file
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-orange-950 dark:text-orange-300'
                }`}
              >
                {musician.w9_on_file ? 'W-9 \u2713' : 'No W-9'}
              </button>
            ) : (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  musician.w9_on_file
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-orange-950 dark:text-orange-300'
                }`}
              >
                {musician.w9_on_file ? 'W-9 \u2713' : 'No W-9'}
              </span>
            )}
            {canManage && !selectMode ? (
              <button
                onClick={(e) => { e.stopPropagation(); handleEdit(musician) }}
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer transition-opacity hover:opacity-80 ${
                  musician.zelle_verified
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : musician.zelle_method
                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
                      : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                }`}
              >
                {musician.zelle_verified
                  ? `Zelle \u2713 (${musician.zelle_method})`
                  : musician.zelle_method
                    ? `Zelle (${musician.zelle_method})`
                    : 'No Zelle'}
              </button>
            ) : (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  musician.zelle_verified
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : musician.zelle_method
                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
                      : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                }`}
              >
                {musician.zelle_verified
                  ? `Zelle \u2713 (${musician.zelle_method})`
                  : musician.zelle_method
                    ? `Zelle (${musician.zelle_method})`
                    : 'No Zelle'}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-2">
          {musician.tags && musician.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {musician.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : '\u2014'}
        </td>
        <td className="px-4 py-2">
          {musician.user_id ? (
            canManage ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-blue-600 hover:text-blue-700"
                onClick={(e) => { e.stopPropagation(); window.open(`/musician?impersonate=${musician.id}`, '_blank') }}
                title="View portal as this musician"
              >
                <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
                View As
              </Button>
            ) : (
              <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
                Active
              </span>
            )
          ) : (
            <span className="text-muted-foreground">{'\u2014'}</span>
          )}
        </td>
        {canManage && (
          <td className="px-4 py-2 text-right">
            <div
              className="flex items-center justify-end gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleEdit(musician)}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => handleDelete(musician)}
              >
                Delete
              </Button>
            </div>
          </td>
        )}
      </tr>
    )
  }

  function handleAdd() {
    setEditingMusician(null)
    setFormOpen(true)
  }

  function handleEdit(musician: MusicianWithInstruments) {
    setEditingMusician(musician)
    setFormOpen(true)
  }

  function handleDelete(musician: MusicianWithInstruments) {
    setDeletingMusician(musician)
    setDeleteOpen(true)
  }

  function handleSuccess() {
    // Celebrate first musician added
    if (!editingMusician && musicians.length === 0) {
      toast.success('Your roster is started!')
    }
    setFormOpen(false)
    setDeleteOpen(false)
    setEditingMusician(null)
    setDeletingMusician(null)
    router.refresh()
  }

  // Selection handlers for bulk edit
  function toggleSelectAll() {
    if (selectedIds.size === filteredMusicians.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredMusicians.map((m) => m.id)))
    }
  }

  function toggleSelect(musicianId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(musicianId)) {
        next.delete(musicianId)
      } else {
        next.add(musicianId)
      }
      return next
    })
  }

  function handleBulkEditSuccess() {
    setBulkEditOpen(false)
    setSelectedIds(new Set())
    setSelectMode(false)
    router.refresh()
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const selectedMusicians = musicians.filter((m) => selectedIds.has(m.id))

  // W-9 request state
  const [isSendingW9, setIsSendingW9] = useState(false)
  const [showW9Confirm, setShowW9Confirm] = useState(false)


  // Count selected musicians who need W-9 and have email
  const selectedNeedW9 = selectedMusicians.filter((m) => !m.w9_on_file && m.email)

  function handleSendW9Request() {
    if (selectedNeedW9.length === 0) {
      toast.error('No selected musicians need a W-9 request (must have email and no W-9 on file)')
      return
    }
    setShowW9Confirm(true)
  }

  async function confirmSendW9Request() {
    setShowW9Confirm(false)
    setIsSendingW9(true)

    try {
      const response = await fetch('/api/musicians/send-w9-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ musicianIds: selectedNeedW9.map((m) => m.id) }),
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || 'Failed to send W-9 requests')
        return
      }

      if (result.sent > 0) {
        toast.success(`Sent W-9 request to ${result.sent} musician${result.sent !== 1 ? 's' : ''}`)
      }
      if (result.failed > 0) {
        toast.warning(`Failed to send to ${result.failed} musician${result.failed !== 1 ? 's' : ''}`)
      }
    } catch {
      toast.error('Failed to send W-9 requests')
    } finally {
      setIsSendingW9(false)
    }
  }

  function handleImportClick() {
    setShowImportDialog(true)
  }

  function handleSelectFile() {
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    setShowImportDialog(false)

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (importTag.trim()) {
        formData.append('tag', importTag.trim())
      }
      const response = await fetch('/api/musicians/import', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        let errorMsg = result.error || 'Import failed'
        if (result.detectedColumns) {
          errorMsg += ` (Found columns: ${result.detectedColumns.join(', ')})`
        }
        toast.error(errorMsg)
        return
      }

      if (result.success > 0) {
        const tagMsg = importTag.trim() ? ` with tag "${importTag.trim()}"` : ''
        toast.success(`Successfully imported ${result.success} musician${result.success !== 1 ? 's' : ''}${tagMsg}`)
        setImportStats({
          total: result.success,
          withEmail: result.stats?.withEmail ?? 0,
          withoutEmail: result.stats?.withoutEmail ?? 0,
          withPhone: result.stats?.withPhone ?? 0,
          withoutPhone: result.stats?.withoutPhone ?? 0,
        })
        setShowPostImportGuide(true)
      }

      if (result.errors > 0) {
        const errorMsg = result.errorRows
          .slice(0, 3)
          .map((err: { row: number; reason: string }) => `Row ${err.row}: ${err.reason}`)
          .join('; ')
        toast.warning(`${result.errors} row${result.errors !== 1 ? 's' : ''} skipped: ${errorMsg}${result.totalErrorRows > 3 ? '...' : ''}`)
      }

      if (result.success > 0) {
        router.refresh()
      }
    } catch {
      toast.error('Failed to import file')
    } finally {
      setIsImporting(false)
      setImportTag('')
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }


  return (
    <div className="space-y-6">
      {isImporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg bg-background p-6 shadow-lg text-center space-y-3">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="font-medium">Importing musicians...</p>
            <p className="text-sm text-muted-foreground">Parsing your spreadsheet and adding musicians to your roster.</p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="page-header">
          <h2 className="text-3xl font-bold tracking-tight">Musicians</h2>
          <p className="text-muted-foreground mt-1">
            Manage your musicians. Details can be updated anytime — focus on getting names in first.
          </p>
          <div className="mt-3 w-12 h-px bg-gold/50" />
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.vcf,.vcard"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="relative">
              <Button variant="outline" onClick={handleImportClick} disabled={isImporting}>
                {isImporting ? 'Importing...' : 'Import'}
              </Button>
              {showImportDialog && (
                <div className="absolute right-0 top-full mt-2 w-72 rounded-md border bg-background p-4 shadow-lg z-50">
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium">Tag / Label (optional)</label>
                      <input
                        type="text"
                        placeholder="e.g., LA Symphony, Region 1"
                        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={importTag}
                        onChange={(e) => setImportTag(e.target.value)}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        All imported musicians will be tagged with this label
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" onClick={handleSelectFile}>
                        Select File
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            if ('contacts' in navigator && 'ContactsManager' in window) {
                              const contacts = await (navigator as any).contacts.select(
                                ['name', 'email', 'tel'],
                                { multiple: true }
                              )
                              if (contacts && contacts.length > 0) {
                                let vcf = ''
                                for (const c of contacts) {
                                  vcf += 'BEGIN:VCARD\nVERSION:3.0\n'
                                  if (c.name?.[0]) vcf += `FN:${c.name[0]}\n`
                                  if (c.email?.[0]) vcf += `EMAIL:${c.email[0]}\n`
                                  if (c.tel?.[0]) vcf += `TEL:${c.tel[0]}\n`
                                  vcf += 'END:VCARD\n'
                                }
                                const blob = new Blob([vcf], { type: 'text/vcard' })
                                const file = new File([blob], 'contacts.vcf', { type: 'text/vcard' })
                                const formData = new FormData()
                                formData.append('file', file)
                                if (importTag.trim()) formData.append('tag', importTag.trim())
                                setShowImportDialog(false)
                                setIsImporting(true)
                                try {
                                  const response = await fetch('/api/musicians/import', { method: 'POST', body: formData })
                                  const result = await response.json()
                                  if (!response.ok) { toast.error(result.error || 'Import failed'); return }
                                  if (result.success > 0) { toast.success(`Imported ${result.success} contact${result.success !== 1 ? 's' : ''}`); router.refresh() }
                                } catch { toast.error('Failed to import contacts') }
                                finally { setIsImporting(false); setImportTag('') }
                              }
                            } else {
                              fileInputRef.current?.click()
                            }
                          } catch { toast.error('Contact picker not supported on this device') }
                        }}
                      >
                        From Contacts
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowImportDialog(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <Button onClick={handleAdd}>Add Musician</Button>
          </div>
        )}
      </div>

      <Separator />

      {showCallOrderBanner && (
        <div className="relative rounded-lg border border-gold/30 bg-gradient-to-r from-gold/10 via-gold/5 to-transparent p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/20 shrink-0">
              <svg className="h-5 w-5 text-gold" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Set your call order</p>
              <p className="text-sm text-muted-foreground">
                Rank musicians by instrument so the best fit gets called first when filling gig positions.
              </p>
            </div>
            <Button
              size="sm"
              className="shrink-0 bg-gold hover:bg-gold/90 text-black"
              onClick={() => setCallOrderOpen(true)}
            >
              <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
              </svg>
              Set Call Order
            </Button>
            <button
              onClick={() => {
                setCallOrderBannerDismissed(true)
                localStorage.setItem('podium_call_order_banner_dismissed', 'true')
              }}
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Dismiss"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {musicians.length > 0 && (
        <div className="space-y-3">
          {/* Search and filters */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Search by name or email..."
              className="rounded-md border bg-background px-3 py-2 text-sm w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={instrumentFilter}
              onChange={(e) => setInstrumentFilter(e.target.value)}
            >
              <option value="">All instruments</option>
              {instruments.map((inst) => (
                <option key={inst.id} value={inst.id}>{inst.name}</option>
              ))}
            </select>
            {usedSections.length > 0 && (
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value as InstrumentSection | '')}
              >
                <option value="">All sections</option>
                {usedSections.map((section) => (
                  <option key={section} value={section}>{SECTION_LABELS[section]}</option>
                ))}
              </select>
            )}
            {books.length > 0 && (
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={bookFilter}
                onChange={(e) => setBookFilter(e.target.value)}
              >
                <option value="">All books</option>
                {books.map((book) => (
                  <option key={book.id} value={book.id}>{book.name}</option>
                ))}
              </select>
            )}
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as '' | 'active' | 'inactive')}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            {missingInfoCount > 0 && (
              <button
                onClick={() => setMissingInfoFilter(!missingInfoFilter)}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  missingInfoFilter
                    ? 'bg-amber-500 text-white'
                    : 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:hover:bg-amber-900'
                }`}
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                {missingInfoCount} missing info
              </button>
            )}
            {noW9Count > 0 && (
              <button
                onClick={() => setW9Filter(w9Filter === 'no_w9' ? '' : 'no_w9')}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  w9Filter === 'no_w9'
                    ? 'bg-orange-500 text-white'
                    : 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/50 dark:text-orange-300 dark:hover:bg-orange-900'
                }`}
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                {noW9Count} no W-9
              </button>
            )}
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearch(''); setInstrumentFilter(''); setSectionFilter(''); setBookFilter(''); setStatusFilter(''); setTagFilter(''); setRegionFilter(''); setMissingInfoFilter(false); setW9Filter('') }}
              >
                Clear all
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {filteredMusicians.length} of {musicians.length} musicians
            </span>
          </div>

          {/* Tag filter chips */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-xs text-muted-foreground mr-1 shrink-0">Filter by tag:</span>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    tagFilter === tag
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900'
                  }`}
                >
                  {tag}
                  {tagFilter === tag && (
                    <svg className="ml-1 h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Instrument filter chips - only show instruments that musicians have */}
          {usedInstruments.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-xs text-muted-foreground mr-1 shrink-0">Filter by instrument:</span>
              {usedInstruments.map((inst) => (
                <button
                  key={inst.id}
                  onClick={() => setInstrumentFilter(instrumentFilter === inst.id ? '' : inst.id)}
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    instrumentFilter === inst.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950 dark:text-purple-300 dark:hover:bg-purple-900'
                  }`}
                >
                  {inst.name}
                  {instrumentFilter === inst.id && (
                    <svg className="ml-1 h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Region filter chips - only show regions that musicians have */}
          {allRegions.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-xs text-muted-foreground mr-1 shrink-0">Filter by region:</span>
              {allRegions.map((region) => (
                <button
                  key={region}
                  onClick={() => setRegionFilter(regionFilter === region ? '' : region)}
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    regionFilter === region
                      ? 'bg-green-600 text-white'
                      : 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950 dark:text-green-300 dark:hover:bg-green-900'
                  }`}
                >
                  {region}
                  {regionFilter === region && (
                    <svg className="ml-1 h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Active filters summary */}
          {hasFilters && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Active filters:</span>
              {search && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs">
                  Search: "{search}"
                  <button onClick={() => setSearch('')} className="hover:text-destructive">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              {instrumentFilter && (
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 dark:bg-purple-900 px-2 py-0.5 text-xs text-purple-700 dark:text-purple-300">
                  {instruments.find((i) => i.id === instrumentFilter)?.name}
                  <button onClick={() => setInstrumentFilter('')} className="hover:text-destructive">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              {sectionFilter && (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 dark:bg-indigo-900 px-2 py-0.5 text-xs text-indigo-700 dark:text-indigo-300">
                  Section: {SECTION_LABELS[sectionFilter]}
                  <button onClick={() => setSectionFilter('')} className="hover:text-destructive">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              {bookFilter && (
                <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 dark:bg-cyan-900 px-2 py-0.5 text-xs text-cyan-700 dark:text-cyan-300">
                  Book: {books.find((b) => b.id === bookFilter)?.name}
                  <button onClick={() => setBookFilter('')} className="hover:text-destructive">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              {statusFilter && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900 px-2 py-0.5 text-xs text-green-700 dark:text-green-300">
                  {statusFilter === 'active' ? 'Active' : 'Inactive'}
                  <button onClick={() => setStatusFilter('')} className="hover:text-destructive">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              {tagFilter && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-300">
                  Tag: {tagFilter}
                  <button onClick={() => setTagFilter('')} className="hover:text-destructive">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              {regionFilter && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900 px-2 py-0.5 text-xs text-green-700 dark:text-green-300">
                  Region: {regionFilter}
                  <button onClick={() => setRegionFilter('')} className="hover:text-destructive">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
              {w9Filter && (
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 dark:bg-orange-900 px-2 py-0.5 text-xs text-orange-700 dark:text-orange-300">
                  {w9Filter === 'no_w9' ? 'No W-9' : 'Has W-9'}
                  <button onClick={() => setW9Filter('')} className="hover:text-destructive">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {musicians.length === 0 ? (
        <EmptyState
          icon={
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
          }
          title="No musicians yet"
          description="Add musicians to your roster to start assigning them to projects."
          action={canManage ? <Button onClick={handleAdd}>Add Your First Musician</Button> : undefined}
        />
      ) : filteredMusicians.length === 0 ? (
        <EmptyState title="No musicians match your filters" />
      ) : (
        <>
          {/* Select & Batch Edit Button */}
          {canManage && musicians.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant={selectMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
              >
                {selectMode ? 'Done Selecting' : 'Select & Batch Edit'}
              </Button>
              {selectMode && (
                <span className="text-sm text-muted-foreground">
                  Click rows to select, or use checkboxes
                </span>
              )}
            </div>
          )}

          {/* Bulk Actions Bar */}
          {selectMode && selectedIds.size > 0 && (
            <div className="flex items-center gap-4 rounded-lg bg-gold/10 border border-gold/20 dark:bg-gold/5 p-3 mb-4">
              <span className="text-sm font-medium">
                {selectedIds.size} musician{selectedIds.size !== 1 ? 's' : ''} selected
              </span>
              <Button size="sm" onClick={() => setBulkEditOpen(true)}>
                Bulk Edit
              </Button>
              {selectedNeedW9.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSendW9Request}
                  disabled={isSendingW9}
                >
                  {isSendingW9 ? 'Sending...' : `Send W-9 Request (${selectedNeedW9.length})`}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear Selection
              </Button>
            </div>
          )}

          <div className="space-y-4">
              {groupedByInstrument.groups.map(({ instrument, musicians: groupMusicians }) => {
                const groupKey = instrument.name
                const isCollapsed = collapsedSections.has(groupKey)
                const sectionLabel = instrument.section ? SECTION_LABELS[instrument.section as InstrumentSection] : ''
                const allGroupSelected = groupMusicians.length > 0 && groupMusicians.every((m) => selectedIds.has(m.id))
                return (
                  <div key={groupKey} className="rounded-lg border bg-background">
                    <button
                      onClick={() => toggleSection(groupKey)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                    >
                      <svg
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                      </svg>
                      <span className="font-semibold">{instrument.name}</span>
                      {sectionLabel && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {sectionLabel}
                        </span>
                      )}
                      <span className="ml-auto text-sm text-muted-foreground">
                        {groupMusicians.length} musician{groupMusicians.length !== 1 ? 's' : ''}
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className="border-t overflow-x-auto">
                        <table className="w-full text-sm table-fixed">
                          <thead className="bg-muted/30">
                            <tr>
                              {selectMode && (
                                <th className="w-[40px] px-2 py-2">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-gray-300"
                                    checked={allGroupSelected}
                                    onChange={() => {
                                      setSelectedIds((prev) => {
                                        const next = new Set(prev)
                                        if (allGroupSelected) {
                                          groupMusicians.forEach((m) => next.delete(m.id))
                                        } else {
                                          groupMusicians.forEach((m) => next.add(m.id))
                                        }
                                        return next
                                      })
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </th>
                              )}
                              <th
                                className="w-[70px] px-4 py-2 text-left text-xs font-medium text-muted-foreground select-none"
                                title="Call order determines the waterfall sequence"
                              >
                                <span className="cursor-pointer hover:text-foreground" onClick={() => handleSort('call_order')}>
                                  Order <SortIcon column="call_order" />
                                </span>
                              </th>
                              <th
                                className="px-4 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => handleSort('name')}
                              >
                                Name <SortIcon column="name" />
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Email</th>
                              <th className="w-[140px] px-4 py-2 text-left text-xs font-medium text-muted-foreground">Phone</th>
                              <th
                                className="w-[100px] px-4 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => handleSort('home_region')}
                              >
                                Region <SortIcon column="home_region" />
                              </th>
                              <th
                                className="w-[240px] px-4 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => handleSort('status')}
                              >
                                Status <SortIcon column="status" />
                              </th>
                              <th
                                className="w-[120px] px-4 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => handleSort('tags')}
                              >
                                Tags <SortIcon column="tags" />
                              </th>
                              <th className="w-[80px] px-4 py-2 text-left text-xs font-medium text-muted-foreground">Portal</th>
                              {canManage && (
                                <th className="w-[150px] px-4 py-2 text-right text-xs font-medium text-muted-foreground">Actions</th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {groupMusicians.map((musician) => renderMusicianRow(musician))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Unassigned section */}
              {groupedByInstrument.unassigned.length > 0 && (() => {
                const isCollapsed = collapsedSections.has('__unassigned__')
                const unassigned = groupedByInstrument.unassigned
                const allGroupSelected = unassigned.length > 0 && unassigned.every((m) => selectedIds.has(m.id))
                return (
                  <div className="rounded-lg border bg-background border-dashed">
                    <button
                      onClick={() => toggleSection('__unassigned__')}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                    >
                      <svg
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                      </svg>
                      <span className="font-semibold text-muted-foreground">Unassigned</span>
                      <span className="rounded-full bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                        No instrument
                      </span>
                      <span className="ml-auto text-sm text-muted-foreground">
                        {unassigned.length} musician{unassigned.length !== 1 ? 's' : ''}
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className="border-t overflow-x-auto">
                        <table className="w-full text-sm table-fixed">
                          <thead className="bg-muted/30">
                            <tr>
                              {selectMode && (
                                <th className="w-[40px] px-2 py-2">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-gray-300"
                                    checked={allGroupSelected}
                                    onChange={() => {
                                      setSelectedIds((prev) => {
                                        const next = new Set(prev)
                                        if (allGroupSelected) {
                                          unassigned.forEach((m) => next.delete(m.id))
                                        } else {
                                          unassigned.forEach((m) => next.add(m.id))
                                        }
                                        return next
                                      })
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </th>
                              )}
                              <th className="w-[70px] px-4 py-2 text-left text-xs font-medium text-muted-foreground select-none">
                                <span className="cursor-pointer hover:text-foreground" onClick={() => handleSort('call_order')}>
                                  Order <SortIcon column="call_order" />
                                </span>
                              </th>
                              <th
                                className="px-4 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => handleSort('name')}
                              >
                                Name <SortIcon column="name" />
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Email</th>
                              <th className="w-[140px] px-4 py-2 text-left text-xs font-medium text-muted-foreground">Phone</th>
                              <th
                                className="w-[100px] px-4 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => handleSort('home_region')}
                              >
                                Region <SortIcon column="home_region" />
                              </th>
                              <th
                                className="w-[240px] px-4 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => handleSort('status')}
                              >
                                Status <SortIcon column="status" />
                              </th>
                              <th
                                className="w-[120px] px-4 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:bg-muted/80 select-none"
                                onClick={() => handleSort('tags')}
                              >
                                Tags <SortIcon column="tags" />
                              </th>
                              <th className="w-[80px] px-4 py-2 text-left text-xs font-medium text-muted-foreground">Portal</th>
                              {canManage && (
                                <th className="w-[150px] px-4 py-2 text-right text-xs font-medium text-muted-foreground">Actions</th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {unassigned.map((musician) => renderMusicianRow(musician))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })()}

              {groupedByInstrument.groups.length === 0 && groupedByInstrument.unassigned.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No musicians match the current filters.
                </p>
              )}
            </div>
        </>
      )}

      <MusicianFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        musician={editingMusician}
        instruments={instruments}
        organizationId={organizationId}
        onSuccess={handleSuccess}
      />

      <DeleteMusicianDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        musician={deletingMusician}
        onSuccess={handleSuccess}
      />

      <BulkEditDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        musicians={selectedMusicians}
        instruments={instruments}
        onSuccess={handleBulkEditSuccess}
      />

      <CallOrderDialog
        open={callOrderOpen}
        onOpenChange={setCallOrderOpen}
        musicians={musicians}
        instruments={instruments}
      />

      {/* Post-Import Guidance Modal */}
      <Dialog open={showPostImportGuide} onOpenChange={setShowPostImportGuide}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {importStats ? `${importStats.total} Musician${importStats.total !== 1 ? 's' : ''} Imported!` : 'Musicians Imported!'}
            </DialogTitle>
            <DialogDescription>
              Your musicians are in. Here&apos;s a summary and what to do next:
            </DialogDescription>
          </DialogHeader>

          {importStats && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">With email:</span>
                  <span className="font-medium">{importStats.withEmail}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Without email:</span>
                  <span className={`font-medium ${importStats.withoutEmail > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>{importStats.withoutEmail}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">With phone:</span>
                  <span className="font-medium">{importStats.withPhone}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Without phone:</span>
                  <span className={`font-medium ${importStats.withoutPhone > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>{importStats.withoutPhone}</span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3 py-2">
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex-shrink-0">1</div>
              <div>
                <p className="text-sm font-medium">Assign instruments</p>
                <p className="text-xs text-muted-foreground">Use the batch edit tool to assign instruments to multiple musicians at once.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex-shrink-0">2</div>
              <div>
                <p className="text-sm font-medium">Fill in missing details later</p>
                <p className="text-xs text-muted-foreground">Phone numbers, emails, and other info can be added anytime.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-700 text-xs font-bold flex-shrink-0">3</div>
              <div>
                <p className="text-sm font-medium">Create a project</p>
                <p className="text-xs text-muted-foreground">Head to Projects to set up your first gig or concert and start sending calls.</p>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowPostImportGuide(false)}>Close</Button>
            <Button onClick={() => {
              setShowPostImportGuide(false)
              setSelectMode(true)
            }}>
              Start Batch Edit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* W-9 Request Confirmation Dialog */}
      {showW9Confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-2xl rounded-lg border bg-background p-6 shadow-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold">Confirm W-9 Request Email</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Review the email that will be sent to {selectedNeedW9.length} musician{selectedNeedW9.length !== 1 ? 's' : ''}.
            </p>

            {/* Email Preview */}
            <div className="mt-4 rounded-lg border bg-white dark:bg-gray-900">
              <div className="border-b bg-muted/30 px-4 py-2">
                <p className="text-xs text-muted-foreground">Subject:</p>
                <p className="text-sm font-medium">W-9 Form Request - {organizationName}</p>
              </div>
              <div className="p-4 space-y-3 text-sm">
                <p>Dear <span className="italic text-muted-foreground">[Musician Name]</span>,</p>
                <p className="text-muted-foreground">
                  We hope this message finds you well. As part of our record-keeping requirements,
                  we need to have a completed <strong>W-9 form</strong> on file for all musicians
                  we work with.
                </p>
                <div className="rounded bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3">
                  <p className="font-medium text-blue-800 dark:text-blue-200 text-xs">What is a W-9?</p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    Form W-9 is used to provide your taxpayer identification number (TIN) to
                    organizations that will pay you for your services.
                  </p>
                </div>
                <p className="text-muted-foreground">
                  <strong>Please complete and return your W-9 form at your earliest convenience.</strong>
                </p>
                <p className="text-xs text-muted-foreground italic">
                  [Instructions for downloading and submitting the form will be included]
                </p>
              </div>
            </div>

            {/* Recipients */}
            <div className="mt-4">
              <p className="text-sm font-medium mb-2">Recipients ({selectedNeedW9.length}):</p>
              <div className="max-h-32 overflow-y-auto rounded border bg-muted/50 p-2">
                <ul className="space-y-1 text-sm">
                  {selectedNeedW9.map((m) => (
                    <li key={m.id} className="flex justify-between">
                      <span>{m.first_name} {m.last_name}</span>
                      <span className="text-muted-foreground">{m.email}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowW9Confirm(false)}>
                Cancel
              </Button>
              <Button onClick={confirmSendW9Request}>
                Confirm & Send {selectedNeedW9.length} Email{selectedNeedW9.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
