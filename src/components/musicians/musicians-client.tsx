'use client'

import { useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { MusicianFormDialog } from './musician-form-dialog'
import { DeleteMusicianDialog } from './delete-musician-dialog'
import { ScheduleFormDialog } from '@/components/schedules/schedule-form-dialog'
import { DeleteScheduleDialog } from '@/components/schedules/delete-schedule-dialog'
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

  const canManage = userRole === 'owner' || userRole === 'admin'

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

  const colCount = canManage ? 7 : 6

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
          <Button onClick={handleAdd}>Add Musician</Button>
        )}
      </div>

      <Separator />

      {musicians.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground mb-4">
            No musicians have been added yet.
          </p>
          {canManage && (
            <Button onClick={handleAdd}>Add Your First Musician</Button>
          )}
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
                <th className="px-4 py-3 text-left font-medium">Status</th>
                {canManage && (
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {musicians.map((musician) => {
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
                        {musician.email || '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {musician.phone || '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {musician.musician_instruments.length > 0
                          ? musician.musician_instruments
                              .map((mi) => mi.instrument.abbreviation || mi.instrument.name)
                              .join(', ')
                          : '—'}
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
