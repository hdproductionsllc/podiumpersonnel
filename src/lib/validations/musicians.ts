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
  zip_code: z
    .string()
    .max(10, 'Zip code must be less than 10 characters')
    .optional()
    .or(z.literal('')),
  service_radius_miles: z
    .number()
    .min(0, 'Service radius must be positive')
    .max(500, 'Service radius must be less than 500 miles')
    .optional()
    .nullable(),
  call_order: z
    .number()
    .min(1, 'Call order must be at least 1')
    .max(999, 'Call order must be less than 1000'),
  is_leader: z.boolean(),
})

export type MusicianInput = z.infer<typeof musicianSchema>
