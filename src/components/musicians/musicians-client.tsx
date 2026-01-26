'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { MusicianFormDialog } from './musician-form-dialog'
import { DeleteMusicianDialog } from './delete-musician-dialog'
import { BulkEditDialog } from './bulk-edit-dialog'
import { toast } from 'sonner'
import type { Musician } from '@/types'

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
}

export type InstrumentOption = {
  id: string
  name: string
  section: string | null
  sort_order: number
}

interface MusiciansClientProps {
  musicians: MusicianWithInstruments[]
  instruments: InstrumentOption[]
  organizationId: string
  userRole: string
}

export function MusiciansClient({
  musicians,
  instruments,
  organizationId,
  userRole,
}: MusiciansClientProps) {
  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editingMusician, setEditingMusician] = useState<MusicianWithInstruments | null>(null)
  const [deletingMusician, setDeletingMusician] = useState<MusicianWithInstruments | null>(null)

  // Filter state
  const [search, setSearch] = useState('')
  const [instrumentFilter, setInstrumentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('')
  const [tagFilter, setTagFilter] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [missingInfoFilter, setMissingInfoFilter] = useState(false)

  // Selection state for bulk edit
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkEditOpen, setBulkEditOpen] = useState(false)

  // Sort state
  type SortColumn = 'name' | 'email' | 'phone' | 'instruments' | 'tags' | 'status' | 'call_order' | 'home_region'
  const [sortColumn, setSortColumn] = useState<SortColumn>('name')
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

  const canManage = userRole === 'owner' || userRole === 'admin'

  const hasFilters = search !== '' || instrumentFilter !== '' || statusFilter !== '' || tagFilter !== '' || regionFilter !== '' || missingInfoFilter

  // Count musicians with missing info
  const missingInfoCount = musicians.filter((m) => !m.email || !m.phone).length

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
        case 'instruments': {
          const aInst = a.musician_instruments.map((mi) => mi.instrument.name).sort().join(', ').toLowerCase()
          const bInst = b.musician_instruments.map((mi) => mi.instrument.name).sort().join(', ').toLowerCase()
          if (!aInst && !bInst) return 0
          if (!aInst) return 1
          if (!bInst) return -1
          return aInst.localeCompare(bInst) * dir
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Musicians</h2>
          <p className="text-muted-foreground">
            Manage the musicians in your orchestra.
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="relative">
              <Button variant="outline" onClick={handleImportClick} disabled={isImporting}>
                {isImporting ? 'Importing...' : 'Import from Excel'}
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
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSelectFile}>
                        Select File
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowImportDialog(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {musicians.length > 0 && (
              <Button
                variant={selectMode ? 'default' : 'outline'}
                onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
              >
                {selectMode ? 'Done' : 'Select'}
              </Button>
            )}
            <Button onClick={handleAdd}>Add Musician</Button>
          </div>
        )}
      </div>

      <Separator />

      {musicians.length > 0 && (
        <div className="space-y-3">
          {/* Search and dropdown filters */}
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
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearch(''); setInstrumentFilter(''); setStatusFilter(''); setTagFilter(''); setRegionFilter(''); setMissingInfoFilter(false) }}
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">Filter by tag:</span>
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">Filter by instrument:</span>
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">Filter by region:</span>
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
            </div>
          )}
        </div>
      )}

      {musicians.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground mb-4">
            No musicians have been added yet.
          </p>
          {canManage && (
            <Button onClick={handleAdd}>Add Your First Musician</Button>
          )}
        </div>
      ) : filteredMusicians.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">No musicians match your filters.</p>
        </div>
      ) : (
        <>
          {/* Bulk Actions Bar */}
          {selectMode && selectedIds.size > 0 && (
            <div className="flex items-center gap-4 rounded-lg bg-blue-50 dark:bg-blue-950 p-3 mb-4">
              <span className="text-sm font-medium">
                {selectedIds.size} musician{selectedIds.size !== 1 ? 's' : ''} selected
              </span>
              <Button size="sm" onClick={() => setBulkEditOpen(true)}>
                Bulk Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear Selection
              </Button>
            </div>
          )}

          <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                {selectMode && (
                  <th className="w-10 px-2 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300"
                      checked={selectedIds.size === filteredMusicians.length && filteredMusicians.length > 0}
                      onChange={toggleSelectAll}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                )}
                <th
                  className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-muted/80 select-none"
                  onClick={() => handleSort('name')}
                >
                  Name <SortIcon column="name" />
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  Email
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  Phone
                </th>
                <th
                  className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-muted/80 select-none"
                  onClick={() => handleSort('instruments')}
                >
                  Instruments <SortIcon column="instruments" />
                </th>
                <th
                  className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-muted/80 select-none"
                  onClick={() => handleSort('home_region')}
                >
                  Region <SortIcon column="home_region" />
                </th>
                <th
                  className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-muted/80 select-none"
                  onClick={() => handleSort('status')}
                >
                  Status <SortIcon column="status" />
                </th>
                <th
                  className="px-4 py-3 text-left font-medium cursor-pointer hover:bg-muted/80 select-none"
                  onClick={() => handleSort('tags')}
                >
                  Tags <SortIcon column="tags" />
                </th>
                {canManage && (
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredMusicians.map((musician) => (
                  <tr
                    key={musician.id}
                    className={`hover:bg-muted/50 ${selectMode && selectedIds.has(musician.id) ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}
                    onClick={selectMode ? () => toggleSelect(musician.id) : undefined}
                  >
                    {selectMode && (
                      <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300"
                          checked={selectedIds.has(musician.id)}
                            onChange={() => toggleSelect(musician.id)}
                          />
                        </td>
                    )}
                    <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          {musician.last_name}, {musician.first_name}
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
                      <td className="px-4 py-3 text-muted-foreground">
                        {musician.email ? (
                          <a
                            href={`mailto:${musician.email}`}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {musician.email}
                          </a>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {musician.phone ? (
                          <a
                            href={`tel:${musician.phone.replace(/[^\d+]/g, '')}`}
                            className="hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {musician.phone}
                          </a>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {musician.musician_instruments.length > 0
                          ? musician.musician_instruments
                              .map((mi) => mi.instrument.abbreviation || mi.instrument.name)
                              .join(', ')
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {musician.home_region || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                            musician.is_active
                              ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                          }`}
                        >
                          {musician.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
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
                        ) : '—'}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
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
              ))}
            </tbody>
          </table>
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
    </div>
  )
}
