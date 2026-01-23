import { z } from 'zod'

export const musicianSchema = z.object({
  first_name: z
    .string()
    .min(1, 'First name is required')
    .max(255, 'First name must be less than 255 characters'),
  last_name: z
    .string()
    .min(1, 'Last name is required')
    .max(255, 'Last name must be less than 255 characters'),
  email: z
    .string()
    .email('Invalid email address')
    .max(255)
    .optional()
    .or(z.literal('')),
  phone: z
    .string()
    .max(50, 'Phone must be less than 50 characters')
    .optional()
    .or(z.literal('')),
  notes: z
    .string()
    .optional()
    .or(z.literal('')),
  is_active: z.boolean(),
  instrument_ids: z.array(z.string()).optional(),
})

export type MusicianInput = z.infer<typeof musicianSchema>
