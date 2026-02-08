'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Building, Check, Loader2, Upload, FileText, X, DollarSign } from 'lucide-react'

function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return phone
}

const profileSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  phone: z.string().optional(),
})

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type ProfileFormValues = z.infer<typeof profileSchema>
type PasswordFormValues = z.infer<typeof passwordSchema>

interface ProfileFormProps {
  user: {
    id: string
    email: string
    hasGoogleLinked: boolean
  }
  musician: {
    id: string
    first_name: string
    last_name: string
    email: string | null
    phone: string | null
    profile_photo_url: string | null
    w9_on_file: boolean
    w9_file_url: string | null
    zelle_method: 'email' | 'phone' | null
    zelle_verified: boolean
  }
  organizations: {
    id: string
    name: string
    musicianId: string
  }[]
  notificationPreferences: {
    email_new_offers: boolean
    email_offer_reminders: boolean
    email_schedule_changes: boolean
    email_payment_updates: boolean
  }
  isReadOnly?: boolean
}

export function ProfileForm({
  user,
  musician,
  organizations,
  notificationPreferences,
  isReadOnly = false,
}: ProfileFormProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const [notifications, setNotifications] = useState(notificationPreferences)

  // W9 & Zelle state
  const [zelleMethod, setZelleMethod] = useState<string>(musician.zelle_method || '')
  const [isUploadingW9, setIsUploadingW9] = useState(false)
  const [w9Uploaded, setW9Uploaded] = useState(musician.w9_on_file)
  const [w9FileUrl, setW9FileUrl] = useState<string | null>(musician.w9_file_url)

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: musician.first_name,
      last_name: musician.last_name,
      phone: musician.phone || '',
    },
  })

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })

  // Watch phone field for live Zelle display
  const watchedPhone = profileForm.watch('phone')

  // Unsaved changes warning
  const hasUnsavedChanges = useCallback(() => {
    // Check profile form fields
    if (profileForm.formState.isDirty) return true
    // Check notification preferences
    if (
      notifications.email_new_offers !== notificationPreferences.email_new_offers ||
      notifications.email_offer_reminders !== notificationPreferences.email_offer_reminders ||
      notifications.email_schedule_changes !== notificationPreferences.email_schedule_changes ||
      notifications.email_payment_updates !== notificationPreferences.email_payment_updates
    ) return true
    // Check zelle method
    if (zelleMethod !== (musician.zelle_method || '')) return true
    return false
  }, [profileForm.formState.isDirty, notifications, notificationPreferences, zelleMethod, musician.zelle_method])

  useEffect(() => {
    // Warn on tab close / browser refresh
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault()
      }
    }

    // Warn on in-app navigation (sidebar links, etc.)
    const handleLinkClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return
      // Only intercept same-origin navigation links
      if (anchor.getAttribute('target') === '_blank') return
      if (!anchor.href || !anchor.href.startsWith(window.location.origin)) return
      // Don't block same-page anchors
      if (anchor.pathname === window.location.pathname) return

      if (hasUnsavedChanges()) {
        const confirmed = window.confirm('You have unsaved changes. Are you sure you want to leave this page?')
        if (!confirmed) {
          e.preventDefault()
          e.stopPropagation()
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('click', handleLinkClick, true)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('click', handleLinkClick, true)
    }
  }, [hasUnsavedChanges])

  async function onSaveAll() {
    // Validate profile form first
    const isValid = await profileForm.trigger()
    if (!isValid) return

    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    const profileData = profileForm.getValues()

    try {
      // Save profile + payment data in one call
      const profileResponse = await fetch('/api/musician/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: profileData.first_name,
          last_name: profileData.last_name,
          phone: profileData.phone ? formatPhoneNumber(profileData.phone) : '',
          zelle_method: zelleMethod,
        }),
      })

      if (!profileResponse.ok) {
        const result = await profileResponse.json()
        throw new Error(result.error || 'Failed to save profile')
      }

      // Save notification preferences
      const notifResponse = await fetch('/api/musician/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifications),
      })

      if (!notifResponse.ok) {
        throw new Error('Failed to save notification preferences')
      }

      // Reset dirty state so beforeunload warning clears
      profileForm.reset(profileData)

      setSaveSuccess(true)
      router.refresh()
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  async function onChangePassword(data: PasswordFormValues) {
    setIsChangingPassword(true)
    setPasswordError(null)

    try {
      const supabase = createClient()

      // First verify current password by trying to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: data.currentPassword,
      })

      if (signInError) {
        throw new Error('Current password is incorrect')
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: data.newPassword,
      })

      if (updateError) {
        throw new Error(updateError.message)
      }

      setShowPasswordDialog(false)
      passwordForm.reset()
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setIsChangingPassword(false)
    }
  }

  async function handleLinkGoogle() {
    const supabase = createClient()
    await supabase.auth.linkIdentity({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/musician/auth/callback?next=/musician/profile`,
      },
    })
  }

  async function handleW9Upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png']
    if (!allowedTypes.includes(file.type)) {
      setSaveError('Please upload a PDF, JPEG, or PNG file')
      return
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setSaveError('File must be under 5MB')
      return
    }

    setIsUploadingW9(true)
    setSaveError(null)

    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() || 'pdf'
      const filePath = `${user.id}/w9.${ext}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('w9-documents')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw new Error(uploadError.message)

      // Update the musician record
      const response = await fetch('/api/musician/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ w9_on_file: true, w9_file_url: filePath }),
      })

      if (!response.ok) throw new Error('Failed to update profile')

      setW9Uploaded(true)
      setW9FileUrl(filePath)
      setSaveSuccess(true)
      router.refresh()
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to upload W-9')
    } finally {
      setIsUploadingW9(false)
      // Reset the file input
      e.target.value = ''
    }
  }

  async function handleW9Remove() {
    setIsUploadingW9(true)
    setSaveError(null)

    try {
      if (w9FileUrl) {
        const supabase = createClient()
        await supabase.storage.from('w9-documents').remove([w9FileUrl])
      }

      const response = await fetch('/api/musician/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ w9_on_file: false, w9_file_url: null }),
      })

      if (!response.ok) throw new Error('Failed to update profile')

      setW9Uploaded(false)
      setW9FileUrl(null)
      router.refresh()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to remove W-9')
    } finally {
      setIsUploadingW9(false)
    }
  }

  return (
    <div className="space-y-6">
      {isReadOnly && (
        <div className="rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3 text-sm text-blue-800 dark:text-blue-200">
          You are viewing this profile as an admin. Changes cannot be made in this mode.
        </div>
      )}

      {/* Global save feedback */}
      {saveError && (
        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {saveError}
        </div>
      )}
      {saveSuccess && (
        <div className="rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-3 text-sm text-green-800 dark:text-green-200 flex items-center gap-2">
          <Check className="h-4 w-4" />
          Changes saved successfully
        </div>
      )}

      {/* Save All Button */}
      {!isReadOnly && (
        <Button
          onClick={onSaveAll}
          disabled={isSaving}
          size="lg"
          className="w-full"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </Button>
      )}

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>
            Update your personal information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...profileForm}>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={profileForm.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={isReadOnly} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={isReadOnly} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormItem>
                <FormLabel>Email</FormLabel>
                <Input value={user.email} disabled />
                <FormDescription>
                  Contact your organization to update your email address
                </FormDescription>
              </FormItem>

              <FormField
                control={profileForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input
                        type="tel"
                        placeholder="(555) 123-4567"
                        disabled={isReadOnly}
                        {...field}
                        onBlur={(e) => {
                          if (e.target.value) {
                            field.onChange(formatPhoneNumber(e.target.value))
                          }
                          field.onBlur()
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

            </div>
          </Form>
        </CardContent>
      </Card>

      {/* Connected Organizations */}
      <Card>
        <CardHeader>
          <CardTitle>Connected Organizations</CardTitle>
          <CardDescription>
            Organizations you work with on Podium
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {organizations.map((org) => (
              <div
                key={org.id}
                className="flex items-center gap-3 p-3 rounded-lg border"
              >
                <div className="rounded-full bg-primary/10 p-2">
                  <Building className="h-4 w-4 text-primary" />
                </div>
                <span className="font-medium">{org.name}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Payment & Tax Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Payment & Tax Information
          </CardTitle>
          <CardDescription>
            Upload your W-9 and set up your Zelle payment preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* W-9 Section */}
          <div className="space-y-3">
            <Label className="text-base font-medium">W-9 Form</Label>
            <p className="text-sm text-muted-foreground">
              Upload your W-9 form for tax purposes. Accepted formats: PDF, JPEG, PNG (max 5MB).
            </p>

            {w9Uploaded ? (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
                <FileText className="h-5 w-5 text-green-600 dark:text-green-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">W-9 uploaded</p>
                  <p className="text-xs text-green-600 dark:text-green-400">Your W-9 is on file</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleW9Remove}
                  disabled={isUploadingW9 || isReadOnly}
                  className="text-muted-foreground hover:text-destructive"
                >
                  {isUploadingW9 ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  disabled={isUploadingW9 || isReadOnly}
                  onClick={() => document.getElementById('w9-upload')?.click()}
                >
                  {isUploadingW9 ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload W-9
                    </>
                  )}
                </Button>
                <input
                  id="w9-upload"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={handleW9Upload}
                />
              </div>
            )}
          </div>

          <div className="border-t" />

          {/* Zelle Section */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Zelle Payment</Label>
            <p className="text-sm text-muted-foreground">
              Select how you&apos;d like to receive Zelle payments. Your organization will use the {zelleMethod === 'phone' ? 'phone number' : 'email address'} from your profile above.
            </p>

            <div className="space-y-2">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="zelle_method"
                    value="email"
                    checked={zelleMethod === 'email'}
                    onChange={() => setZelleMethod('email')}
                    disabled={isReadOnly}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">
                    Email
                    {user.email && <span className="text-muted-foreground ml-1">({user.email})</span>}
                  </span>
                </label>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="zelle_method"
                    value="phone"
                    checked={zelleMethod === 'phone'}
                    onChange={() => setZelleMethod('phone')}
                    disabled={isReadOnly}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">
                    Phone
                    {watchedPhone && <span className="text-muted-foreground ml-1">({formatPhoneNumber(watchedPhone)})</span>}
                  </span>
                </label>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="zelle_method"
                    value=""
                    checked={zelleMethod === ''}
                    onChange={() => setZelleMethod('')}
                    disabled={isReadOnly}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-muted-foreground">Not using Zelle</span>
                </label>
              </div>
            </div>

            {zelleMethod === '' && (
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
                If you prefer a different payment method, please contact your organization to make arrangements.
              </p>
            )}

            {musician.zelle_verified && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <Check className="h-4 w-4" />
                Verified by your organization
              </div>
            )}

          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>
            Choose what emails you receive
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">New Offers</p>
                <p className="text-sm text-muted-foreground">Get notified when you receive new gig offers</p>
              </div>
              <Switch
                checked={notifications.email_new_offers}
                disabled={isReadOnly}
                onCheckedChange={(checked) =>
                  setNotifications((prev) => ({ ...prev, email_new_offers: checked }))
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Offer Reminders</p>
                <p className="text-sm text-muted-foreground">Reminders about offers expiring soon</p>
              </div>
              <Switch
                checked={notifications.email_offer_reminders}
                disabled={isReadOnly}
                onCheckedChange={(checked) =>
                  setNotifications((prev) => ({ ...prev, email_offer_reminders: checked }))
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Schedule Changes</p>
                <p className="text-sm text-muted-foreground">Updates about your confirmed gigs</p>
              </div>
              <Switch
                checked={notifications.email_schedule_changes}
                disabled={isReadOnly}
                onCheckedChange={(checked) =>
                  setNotifications((prev) => ({ ...prev, email_schedule_changes: checked }))
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Payment Updates</p>
                <p className="text-sm text-muted-foreground">Information about payments</p>
              </div>
              <Switch
                checked={notifications.email_payment_updates}
                disabled={isReadOnly}
                onCheckedChange={(checked) =>
                  setNotifications((prev) => ({ ...prev, email_payment_updates: checked }))
                }
              />
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Account Security — hidden when admin is impersonating */}
      {!isReadOnly && <Card id="settings">
        <CardHeader>
          <CardTitle>Account Security</CardTitle>
          <CardDescription>
            Manage your password and connected accounts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              <div>
                <p className="font-medium text-sm">Google</p>
                <p className="text-sm text-muted-foreground">
                  {user.hasGoogleLinked ? 'Connected' : 'Not connected'}
                </p>
              </div>
            </div>
            {user.hasGoogleLinked ? (
              <Badge variant="secondary">Connected</Badge>
            ) : (
              <Button variant="outline" size="sm" onClick={handleLinkGoogle}>
                Connect
              </Button>
            )}
          </div>

          <Button variant="outline" onClick={() => setShowPasswordDialog(true)}>
            Change Password
          </Button>
        </CardContent>
      </Card>}

      {/* Password Change Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new one
            </DialogDescription>
          </DialogHeader>
          <Form {...passwordForm}>
            <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className="space-y-4">
              {passwordError && (
                <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                  {passwordError}
                </div>
              )}
              <FormField
                control={passwordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPasswordDialog(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isChangingPassword}>
                  {isChangingPassword ? 'Changing...' : 'Change Password'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
