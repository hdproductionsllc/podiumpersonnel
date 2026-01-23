import { z } from 'zod'

export const bookSchema = z.object({
  name: z
    .string()
    .min(1, 'Book name is required')
    .max(255, 'Book name must be less than 255 characters'),
  description: z
    .string()
    .optional()
    .or(z.literal('')),
  is_default: z.boolean(),
})

export type BookInput = z.infer<typeof bookSchema>
