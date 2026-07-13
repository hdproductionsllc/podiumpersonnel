'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/ui/empty-state'
import { useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'
import { ScheduleFormDialog } from './schedule-form-dialog'
import { DeleteScheduleDialog } from './delete-schedule-dialog'
import type { CompetingSchedule } from '@/types'

export type ScheduleWithMusician = CompetingSchedule & {
  musician: { id: string; first_name: string; last_name: string }
}

type MusicianOption = {
  id: string
  first_name: string
  last_name: string
}

interface SchedulesClientProps {
  schedules: ScheduleWithMusician[]
  musicians: MusicianOption[]
  canManage: boolean
}

export function SchedulesClient({
  schedules,
  musicians,
  canManage,
}: SchedulesClientProps) {
  const terms = useTerms()
  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<CompetingSchedule | null>(null)
  const [deletingSchedule, setDeletingSchedule] = useState<CompetingSchedule | null>(null)

  // Filter state
  const [search, setSearch] = useState('')
  const [musicianFilter, setMusicianFilter] = useState('')

  const hasFilters = search !== '' || musicianFilter !== ''

  const filteredSchedules = schedules.filter((s) => {
    if (search) {
      const q = search.toLowerCase()
      if (!s.title.toLowerCase().includes(q) && !(s.notes || '').toLowerCase().includes(q)) return false
    }
    if (musicianFilter && s.musician_id !== musicianFilter) return false
    return true
  })

  function handleAdd() {
    setEditingSchedule(null)
    setFormOpen(true)
  }

  function handleEdit(schedule: ScheduleWithMusician) {
    setEditingSchedule(schedule)
    setFormOpen(true)
  }

  function handleDelete(schedule: ScheduleWithMusician) {
    setDeletingSchedule(schedule)
    setDeleteOpen(true)
  }

  function handleSuccess() {
    setFormOpen(false)
    setDeleteOpen(false)
    setEditingSchedule(null)
    setDeletingSchedule(null)
    router.refresh()
  }

  // Sort: upcoming first, then past
  const sorted = [...filteredSchedules].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  )

  const now = new Date()
  const upcoming = sorted.filter((s) => new Date(s.end_time) >= now)
  const past = sorted.filter((s) => new Date(s.end_time) < now)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="page-header">
          <h2 className="text-3xl font-bold tracking-tight">Schedules</h2>
          <p className="text-muted-foreground mt-1">
            Track {term(terms, 'person', { case: 'lower' })} availability and external commitments.
          </p>
          <div className="mt-3 w-12 h-px bg-gold/50" />
        </div>
        {canManage && (
          <Button onClick={handleAdd}>Add Entry</Button>
        )}
      </div>

      <Separator />

      {schedules.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search by title or notes..."
            className="rounded-md border bg-background px-3 py-2 text-sm w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={musicianFilter}
            onChange={(e) => setMusicianFilter(e.target.value)}
          >
            <option value="">All {term(terms, 'person', { plural: true, case: 'lower' })}</option>
            {musicians.map((m) => (
              <option key={m.id} value={m.id}>{m.last_name}, {m.first_name}</option>
            ))}
          </select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(''); setMusicianFilter('') }}
            >
              Clear
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {filteredSchedules.length} of {schedules.length} entries
          </span>
        </div>
      )}

      {schedules.length === 0 ? (
        <EmptyState
          icon={
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
          }
          title="No schedule conflicts yet"
          description={`Track your ${term(terms, 'person', { plural: true, case: 'lower' })}' outside commitments to avoid double-booking.`}
          action={canManage ? <Button onClick={handleAdd}>Add First Entry</Button> : undefined}
        />
      ) : filteredSchedules.length === 0 ? (
        <EmptyState title="No schedule entries match your filters" />
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">Upcoming & Current</h3>
              <ScheduleTable
                schedules={upcoming}
                canManage={canManage}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            </div>
          )}

          {past.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">Past</h3>
              <ScheduleTable
                schedules={past}
                canManage={canManage}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            </div>
          )}
        </div>
      )}

      <ScheduleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        schedule={editingSchedule}
        musicians={musicians}
        onSuccess={handleSuccess}
      />

      <DeleteScheduleDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        schedule={deletingSchedule}
        onSuccess={handleSuccess}
      />
    </div>
  )
}

function ScheduleTable({
  schedules,
  canManage,
  onEdit,
  onDelete,
}: {
  schedules: ScheduleWithMusician[]
  canManage: boolean
  onEdit: (s: ScheduleWithMusician) => void
  onDelete: (s: ScheduleWithMusician) => void
}) {
  const terms = useTerms()
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left font-medium">{term(terms, 'person')}</th>
            <th className="px-4 py-3 text-left font-medium">Title</th>
            <th className="px-4 py-3 text-left font-medium">Start</th>
            <th className="px-4 py-3 text-left font-medium">End</th>
            <th className="px-4 py-3 text-left font-medium">Notes</th>
            {canManage && (
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y">
          {schedules.map((schedule) => (
            <tr key={schedule.id} className="hover:bg-muted/50">
              <td className="px-4 py-3 font-medium">
                {schedule.musician.first_name} {schedule.musician.last_name}
              </td>
              <td className="px-4 py-3">{schedule.title}</td>
              <td className="px-4 py-3 text-muted-foreground">
                {new Date(schedule.start_time).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {new Date(schedule.end_time).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {schedule.notes
                  ? schedule.notes.length > 40
                    ? schedule.notes.slice(0, 40) + '...'
                    : schedule.notes
                  : '—'}
              </td>
              {canManage && (
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(schedule)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onDelete(schedule)}
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
  )
}
