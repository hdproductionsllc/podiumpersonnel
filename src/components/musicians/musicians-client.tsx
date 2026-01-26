'use client'

import { useState, Fragment, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { MusicianFormDialog } from './musician-form-dialog'
import { DeleteMusicianDialog } from './delete-musician-dialog'
import { ScheduleFormDialog } from '@/components/schedules/schedule-form-dialog'
import { DeleteScheduleDialog } from '@/components/schedules/delete-schedule-dialog'
import { toast } from 'sonner'
import type { Musician, CompetingSchedule } from '@/types'

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

export type MusicianSchedule = {
  id: string
  title: string
  start_time: string
  end_time: string
  notes: string | null
}

export type MusicianWithInstruments = Musician & {
  musician_instruments: MusicianInstrumentJoin[]
  competing_schedules: MusicianSchedule[]
  tags?: string[]
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
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // Schedule dialog state
  const [scheduleFormOpen, setScheduleFormOpen] = useState(false)
  const [scheduleDeleteOpen, setScheduleDeleteOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<CompetingSchedule | null>(null)
  const [deletingSchedule, setDeletingSchedule] = useState<CompetingSchedule | null>(null)
  const [scheduleMusician, setScheduleMusician] = useState<MusicianWithInstruments | null>(null)

  // Filter state
  const [search, setSearch] = useState('')
  const [instrumentFilter, setInstrumentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'inactive'>('')
  const [tagFilter, setTagFilter] = useState('')

  // Get unique tags from all musicians
  const allTags = Array.from(
    new Set(musicians.flatMap((m) => m.tags || []))
  ).sort()

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importTag, setImportTag] = useState('')
  const [showImportDialog, setShowImportDialog] = useState(false)

  const canManage = userRole === 'owner' || userRole === 'admin'

  const hasFilters = search !== '' || instrumentFilter !== '' || statusFilter !== '' || tagFilter !== ''

  const filteredMusicians = musicians.filter((m) => {
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
    return true
  })

  function toggleRow(musicianId: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(musicianId)) next.delete(musicianId)
      else next.add(musicianId)
      return next
    })
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

  function handleAddSchedule(musician: MusicianWithInstruments) {
    setScheduleMusician(musician)
    setEditingSchedule(null)
    setScheduleFormOpen(true)
  }

  function handleEditSchedule(musician: MusicianWithInstruments, schedule: MusicianSchedule) {
    setScheduleMusician(musician)
    setEditingSchedule({ ...schedule, musician_id: musician.id, created_at: '', updated_at: '' })
    setScheduleFormOpen(true)
  }

  function handleDeleteSchedule(schedule: MusicianSchedule, musicianId: string) {
    setDeletingSchedule({ ...schedule, musician_id: musicianId, created_at: '', updated_at: '' })
    setScheduleDeleteOpen(true)
  }

  function handleScheduleSuccess() {
    setScheduleFormOpen(false)
    setScheduleDeleteOpen(false)
    setEditingSchedule(null)
    setDeletingSchedule(null)
    setScheduleMusician(null)
    router.refresh()
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

  const colCount = canManage ? 8 : 7

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
            <Button onClick={handleAdd}>Add Musician</Button>
          </div>
        )}
      </div>

      <Separator />

      {musicians.length > 0 && (
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
          {allTags.length > 0 && (
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
            >
              <option value="">All tags</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          )}
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(''); setInstrumentFilter(''); setStatusFilter(''); setTagFilter('') }}
            >
              Clear
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {filteredMusicians.length} of {musicians.length} musicians
          </span>
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
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="w-10 px-2 py-3"></th>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Phone</th>
                <th className="px-4 py-3 text-left font-medium">Instruments</th>
                <th className="px-4 py-3 text-left font-medium">Tags</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                {canManage && (
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredMusicians.map((musician) => {
                const isExpanded = expandedRows.has(musician.id)
                const upcomingSchedules = (musician.competing_schedules || [])
                  .filter((s) => new Date(s.end_time) >= new Date())
                  .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                return (
                  <Fragment key={musician.id}>
                    <tr
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => toggleRow(musician.id)}
                    >
                      <td className="px-2 py-3 text-center">
                        <svg
                          className={`h-4 w-4 transition-transform inline-block ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                        </svg>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {musician.last_name}, {musician.first_name}
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

                    {isExpanded && (
                      <tr>
                        <td colSpan={colCount} className="bg-muted/20 px-4 py-4">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-semibold">Schedule Conflicts</h4>
                              {canManage && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleAddSchedule(musician)}
                                >
                                  Add Entry
                                </Button>
                              )}
                            </div>
                            {upcomingSchedules.length === 0 ? (
                              <p className="text-sm text-muted-foreground py-2">
                                No upcoming schedule conflicts.
                              </p>
                            ) : (
                              <div className="rounded-md border bg-background">
                                <table className="w-full text-sm">
                                  <thead className="border-b bg-muted/30">
                                    <tr>
                                      <th className="px-3 py-2 text-left font-medium text-xs">Title</th>
                                      <th className="px-3 py-2 text-left font-medium text-xs">Start</th>
                                      <th className="px-3 py-2 text-left font-medium text-xs">End</th>
                                      <th className="px-3 py-2 text-left font-medium text-xs">Notes</th>
                                      {canManage && (
                                        <th className="px-3 py-2 text-right font-medium text-xs">Actions</th>
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {upcomingSchedules.map((schedule) => (
                                      <tr key={schedule.id} className="hover:bg-muted/30">
                                        <td className="px-3 py-2">{schedule.title}</td>
                                        <td className="px-3 py-2 text-muted-foreground">
                                          {new Date(schedule.start_time).toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2 text-muted-foreground">
                                          {new Date(schedule.end_time).toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2 text-muted-foreground">
                                          {schedule.notes || '—'}
                                        </td>
                                        {canManage && (
                                          <td className="px-3 py-2 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleEditSchedule(musician, schedule)}
                                              >
                                                Edit
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive hover:text-destructive"
                                                onClick={() => handleDeleteSchedule(schedule, musician.id)}
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
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
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

      <ScheduleFormDialog
        open={scheduleFormOpen}
        onOpenChange={setScheduleFormOpen}
        schedule={editingSchedule}
        musicians={scheduleMusician ? [{ id: scheduleMusician.id, first_name: scheduleMusician.first_name, last_name: scheduleMusician.last_name }] : []}
        preselectedMusicianId={scheduleMusician?.id}
        onSuccess={handleScheduleSuccess}
      />

      <DeleteScheduleDialog
        open={scheduleDeleteOpen}
        onOpenChange={setScheduleDeleteOpen}
        schedule={deletingSchedule}
        onSuccess={handleScheduleSuccess}
      />
    </div>
  )
}
