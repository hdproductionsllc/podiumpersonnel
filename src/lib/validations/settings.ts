import { z } from 'zod'

export const updateOrganizationSchema = z.object({
  name: z.string().min(1, 'Organization name is required').max(255),
})

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>

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
