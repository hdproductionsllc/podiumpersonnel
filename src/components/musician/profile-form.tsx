'use client'

import { useState } from 'react'
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
import { Building, Check, Loader2 } from 'lucide-react'

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
}

export function ProfileForm({
  user,
  musician,
  organizations,
  notificationPreferences,
}: ProfileFormProps) {
  const router = useRouter()
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingNotifications, setIsSavingNotifications] = useState(false)
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [notificationSuccess, setNotificationSuccess] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)

  const [notifications, setNotifications] = useState(notificationPreferences)

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

  async function onSaveProfile(data: ProfileFormValues) {
    setIsSavingProfile(true)
    setProfileError(null)
    setProfileSuccess(false)

    try {
      const response = await fetch('/api/musician/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Failed to save profile')
      }

      setProfileSuccess(true)
      router.refresh()
      setTimeout(() => setProfileSuccess(false), 3000)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to save profile')
    } finally {
      setIsSavingProfile(false)
    }
  }

  async function onSaveNotifications() {
    setIsSavingNotifications(true)
    setNotificationSuccess(false)

    try {
      const response = await fetch('/api/musician/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifications),
      })

      if (!response.ok) {
        throw new Error('Failed to save preferences')
      }

      setNotificationSuccess(true)
      setTimeout(() => setNotificationSuccess(false), 3000)
    } catch (err) {
      console.error('Failed to save notifications:', err)
    } finally {
      setIsSavingNotifications(false)
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

  return (
    <div className="space-y-6">
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
            <form onSubmit={profileForm.handleSubmit(onSaveProfile)} className="space-y-4">
              {profileError && (
                <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                  {profileError}
                </div>
              )}
              {profileSuccess && (
                <div className="rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-3 text-sm text-green-800 dark:text-green-200 flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Profile updated successfully
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={profileForm.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
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
                        <Input {...field} />
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
                      <Input type="tel" placeholder="(555) 123-4567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={isSavingProfile}>
                {isSavingProfile ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </form>
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

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>
            Choose what emails you receive
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {notificationSuccess && (
            <div className="rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-3 text-sm text-green-800 dark:text-green-200 flex items-center gap-2">
              <Check className="h-4 w-4" />
              Preferences saved
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">New Offers</p>
                <p className="text-sm text-muted-foreground">Get notified when you receive new gig offers</p>
              </div>
              <Switch
                checked={notifications.email_new_offers}
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
                onCheckedChange={(checked) =>
                  setNotifications((prev) => ({ ...prev, email_payment_updates: checked }))
                }
              />
            </div>
          </div>

          <Button
            onClick={onSaveNotifications}
            disabled={isSavingNotifications}
            variant="outline"
          >
            {isSavingNotifications ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Preferences'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Account Security */}
      <Card id="settings">
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
      </Card>

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
