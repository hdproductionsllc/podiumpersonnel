import { z } from 'zod'

export const venueSchema = z.object({
  name: z
    .string()
    .min(1, 'Venue name is required')
    .max(255, 'Name must be less than 255 characters'),
  address: z
    .string()
    .max(500, 'Address must be less than 500 characters')
    .optional()
    .or(z.literal('')),
  city: z
    .string()
    .max(100, 'City must be less than 100 characters')
    .optional()
    .or(z.literal('')),
  state: z
    .string()
    .max(50, 'State must be less than 50 characters')
    .optional()
    .or(z.literal('')),
  zip: z
    .string()
    .max(20, 'ZIP must be less than 20 characters')
    .optional()
    .or(z.literal('')),
  google_maps_url: z
    .string()
    .url('Must be a valid URL')
    .optional()
    .or(z.literal('')),
  parking_info: z
    .string()
    .max(2000, 'Parking info must be less than 2000 characters')
    .optional()
    .or(z.literal('')),
  directions: z
    .string()
    .max(2000, 'Directions must be less than 2000 characters')
    .optional()
    .or(z.literal('')),
  notes: z
    .string()
    .max(2000, 'Notes must be less than 2000 characters')
    .optional()
    .or(z.literal('')),
})

export type VenueInput = z.infer<typeof venueSchema>
