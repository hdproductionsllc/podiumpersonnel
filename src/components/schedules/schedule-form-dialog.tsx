'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { scheduleSchema, type ScheduleInput } from '@/lib/validations/schedules'
import type { CompetingSchedule } from '@/types'

type MusicianOption = {
  id: string
  first_name: string
  last_name: string
}

interface ScheduleFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  schedule: CompetingSchedule | null
  musicians: MusicianOption[]
  preselectedMusicianId?: string
  onSuccess: () => void
}

function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ScheduleFormDialog({
  open,
  onOpenChange,
  schedule,
  musicians,
  preselectedMusicianId,
  onSuccess,
}: ScheduleFormDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const isEdit = !!schedule

  const form = useForm<ScheduleInput>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: schedule
      ? {
          musician_id: schedule.musician_id,
          title: schedule.title,
          start_time: isoToDatetimeLocal(schedule.start_time),
          end_time: isoToDatetimeLocal(schedule.end_time),
          notes: schedule.notes || '',
        }
      : {
          musician_id: preselectedMusicianId || '',
          title: '',
          start_time: '',
          end_time: '',
          notes: '',
        },
  })

  if (!open) return null

  async function onSubmit(data: ScheduleInput) {
    setError(null)
    const supabase = createClient()

    const payload = {
      musician_id: data.musician_id,
      title: data.title,
      start_time: new Date(data.start_time).toISOString(),
      end_time: new Date(data.end_time).toISOString(),
      notes: data.notes || null,
    }

    const result = isEdit
      ? await supabase.from('competing_schedules').update(payload).eq('id', schedule!.id)
      : await supabase.from('competing_schedules').insert(payload)

    if (result.error) {
      setError(result.error.message)
      return
    }

    onOpenChange(false)
    onSuccess()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className="relative bg-background rounded-lg border shadow-lg w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-semibold">
          {isEdit ? 'Edit Schedule Entry' : 'Add Schedule Entry'}
        </h3>

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Musician</label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              {...form.register('musician_id')}
              disabled={!!preselectedMusicianId}
            >
              <option value="">Select a musician...</option>
              {musicians.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.last_name}, {m.first_name}
                </option>
              ))}
            </select>
            {form.formState.errors.musician_id && (
              <p className="text-xs text-destructive">{form.formState.errors.musician_id.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <input
              type="text"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="e.g. Symphony XYZ Concert"
              {...form.register('title')}
            />
            {form.formState.errors.title && (
              <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Start</label>
              <input
                type="datetime-local"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                {...form.register('start_time')}
              />
              {form.formState.errors.start_time && (
                <p className="text-xs text-destructive">{form.formState.errors.start_time.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">End</label>
              <input
                type="datetime-local"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                {...form.register('end_time')}
              />
              {form.formState.errors.end_time && (
                <p className="text-xs text-destructive">{form.formState.errors.end_time.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Notes</label>
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[60px]"
              placeholder="Optional notes..."
              {...form.register('notes')}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Entry'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
