import { z } from 'zod'

export const scheduleSchema = z.object({
  musician_id: z.string().min(1, 'Musician is required'),
  title: z.string().min(1, 'Title is required').max(255),
  start_time: z.string().min(1, 'Start time is required'),
  end_time: z.string().min(1, 'End time is required'),
  notes: z.string().optional().or(z.literal('')),
})

export type ScheduleInput = z.infer<typeof scheduleSchema>
