import { z } from 'zod'

export const HOME_REGIONS = [
  'SF Bay Area',
  'Los Angeles',
  'Orange County',
  'San Diego',
  'Chicago',
  'St. Louis',
  'Kansas City',
] as const

export type HomeRegion = typeof HOME_REGIONS[number]

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
  street_address: z
    .string()
    .max(255, 'Street address must be less than 255 characters')
    .optional()
    .or(z.literal('')),
  city: z
    .string()
    .max(100, 'City must be less than 100 characters')
    .optional()
    .or(z.literal('')),
  state: z
    .string()
    .length(2, 'State must be a 2-letter code')
    .optional()
    .or(z.literal('')),
  zip_code: z
    .string()
    .max(10, 'Zip code must be less than 10 characters')
    .optional()
    .or(z.literal('')),
  home_region: z
    .string()
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
  w9_on_file: z.boolean(),
  zelle_method: z.enum(['email', 'phone', '']).optional().nullable(),
  zelle_verified: z.boolean(),
})

export type MusicianInput = z.infer<typeof musicianSchema>
