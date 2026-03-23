import { z } from 'zod'

export const updateOrganizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(255),
  slug: z.string().min(1, 'Slug is required').max(100).regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  timezone: z.string().min(1, 'Timezone is required'),
  musician_policy: z.string().max(10000).optional().nullable(),
  disable_staffing_alerts: z.boolean().optional(),
})

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>

export const updateEmailBrandingSchema = z.object({
  email_logo_url: z.string().url('Please enter a valid URL').max(500).optional().nullable().or(z.literal('')),
  email_brand_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Please enter a valid hex color (e.g., #1E293B)').optional().nullable(),
  email_footer_text: z.string().max(500, 'Footer text must be 500 characters or less').optional().nullable(),
})

export type UpdateEmailBrandingInput = z.infer<typeof updateEmailBrandingSchema>

export const addMemberSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  role: z.enum(['admin', 'member']),
})

export type AddMemberInput = z.infer<typeof addMemberSchema>

export const changeMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
})

export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
