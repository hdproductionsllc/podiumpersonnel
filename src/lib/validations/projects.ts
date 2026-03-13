import { z } from 'zod'

export const PROJECT_STATUSES = ['draft', 'active', 'completed', 'cancelled'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const SERVICE_TYPES = ['rehearsal', 'performance', 'dress_rehearsal', 'sectional', 'other'] as const
export type ServiceType = (typeof SERVICE_TYPES)[number]

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const EVENT_TYPES = [
  'Ceremony',
  'Cocktail Hour',
  'Ceremony & Cocktail Hour',
  'Reception',
  'Special Event',
  'Concert',
  'Corporate Event',
  'Other',
] as const

export const PAYMENT_STATUSES = ['pending', 'deposit_paid', 'fully_paid'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  deposit_paid: 'Deposit Paid',
  fully_paid: 'Fully Paid',
}

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  rehearsal: 'Rehearsal',
  performance: 'Performance',
  dress_rehearsal: 'Dress Rehearsal',
  sectional: 'Sectional',
  other: 'Other',
}

export const projectSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(255, 'Project name must be less than 255 characters'),
  description: z
    .string()
    .optional()
    .or(z.literal('')),
  internal_notes: z
    .string()
    .optional()
    .or(z.literal('')),
  start_date: z
    .string()
    .optional()
    .or(z.literal('')),
  end_date: z
    .string()
    .optional()
    .or(z.literal('')),
  status: z.enum(PROJECT_STATUSES),
  client_name: z
    .string()
    .optional()
    .or(z.literal('')),
  client_email: z
    .string()
    .email('Invalid email')
    .optional()
    .or(z.literal('')),
  client_phone: z
    .string()
    .optional()
    .or(z.literal('')),
  event_type: z
    .string()
    .optional()
    .or(z.literal('')),
  contract_amount: z
    .number()
    .min(0)
    .optional()
    .nullable(),
  deposit_amount: z
    .number()
    .min(0)
    .optional()
    .nullable(),
  deposit_paid_at: z
    .string()
    .optional()
    .or(z.literal('')),
  payment_status: z.enum(PAYMENT_STATUSES),
  payment_notes: z
    .string()
    .optional()
    .or(z.literal('')),
})

export const serviceSchema = z.object({
  name: z
    .string()
    .min(1, 'Service name is required')
    .max(255, 'Service name must be less than 255 characters'),
  service_type: z.enum(SERVICE_TYPES),
  venue: z
    .string()
    .max(255, 'Venue must be less than 255 characters')
    .optional()
    .or(z.literal('')),
  venue_id: z
    .string()
    .uuid()
    .optional()
    .nullable(),
  call_time: z
    .string()
    .optional()
    .or(z.literal('')),
  start_time: z
    .string()
    .min(1, 'Start time is required'),
  end_time: z
    .string()
    .optional()
    .or(z.literal('')),
  notes: z
    .string()
    .optional()
    .or(z.literal('')),
  base_pay: z
    .number()
    .min(0, 'Base pay must be positive')
    .optional()
    .nullable(),
  leader_fee: z
    .number()
    .min(0, 'Leader fee must be positive')
    .default(50)
    .optional()
    .nullable(),
})

export type ProjectInput = z.infer<typeof projectSchema>
export type ServiceInput = z.infer<typeof serviceSchema>
