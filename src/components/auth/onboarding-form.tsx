'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { onboardingSchema, type OnboardingInput } from '@/lib/validations/auth'
import { VERTICALS, DEFAULT_VERTICAL } from '@/lib/verticals'
import { DEFAULT_TIMEZONE, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
]

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)
}

function detectTimezone(): string {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    const supported = TIMEZONE_OPTIONS.map((tz) => tz.value)
    if (supported.includes(detected)) return detected
  } catch {
    // Intl not available
  }
  return DEFAULT_TIMEZONE
}

export function OnboardingForm() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const detectedTimezone = useMemo(detectTimezone, [])

  const form = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      fullName: '',
      organizationName: '',
      timezone: detectedTimezone,
      vertical: DEFAULT_VERTICAL,
    },
  })

  async function onSubmit(data: OnboardingInput) {
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      setError('You must be logged in to create an organization')
      setIsLoading(false)
      return
    }

    // Update user's display name
    const { error: updateUserError } = await supabase.auth.updateUser({
      data: { full_name: data.fullName }
    })

    if (updateUserError) {
      console.error('Failed to update user name:', updateUserError)
      // Continue anyway, not critical
    }

    // Generate slug from organization name
    const slug = generateSlug(data.organizationName)

    // Create organization and add user as owner atomically via RPC
    const { data: organization, error: orgError } = await supabase
      .rpc('create_organization_with_owner', {
        p_name: data.organizationName,
        p_slug: slug,
        p_timezone: data.timezone,
        p_vertical: data.vertical,
      })

    if (orgError) {
      if (orgError.code === '23505') {
        setError('An organization with this name already exists. Please try a different name.')
      } else {
        setError(orgError.message)
      }
      setIsLoading(false)
      return
    }

    // Seed the org's starter skills for the chosen vertical. Await it (an empty
    // skills list is a bad first-run) but never let a failure block onboarding —
    // the org is already usable and the route is idempotent, so a later retry
    // (or the SQL-seeded verticals) fills it in.
    try {
      await fetch('/api/organization/seed-skills', { method: 'POST' })
    } catch {
      // Ignore — seeding is best-effort and idempotent
    }

    // Send welcome email (don't await — don't block the redirect)
    fetch('/api/auth/welcome-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationName: data.organizationName,
        userName: data.fullName,
      }),
    }).catch(() => {
      // Ignore — welcome email is non-critical
    })

    // Redirect to dashboard where the setup wizard will guide them
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Welcome to Podium</CardTitle>
        <CardDescription>
          Let&apos;s set up your organization
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Your Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="John Smith"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="vertical"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>What kind of organization are you?</FormLabel>
                  <FormControl>
                    <div
                      role="radiogroup"
                      aria-label="Organization type"
                      className="grid gap-2 sm:grid-cols-2"
                    >
                      {Object.values(VERTICALS).map((vertical) => {
                        const selected = field.value === vertical.key
                        return (
                          <button
                            type="button"
                            key={vertical.key}
                            role="radio"
                            aria-checked={selected}
                            onClick={() => field.onChange(vertical.key)}
                            className={cn(
                              'flex flex-col rounded-md border p-3 text-left text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                              selected
                                ? 'border-primary bg-primary/5'
                                : 'border-input hover:bg-accent hover:text-accent-foreground'
                            )}
                          >
                            <span className="font-medium">{vertical.displayName}</span>
                            <span className="mt-0.5 text-xs text-muted-foreground">
                              {vertical.description}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="organizationName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Organization Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Bay Area Symphony"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Timezone</FormLabel>
                  <FormControl>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      {...field}
                    >
                      {TIMEZONE_OPTIONS.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormDescription>
                    Used for displaying dates and times
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="pt-2">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Creating...' : 'Get Started'}
              </Button>
            </div>
          </form>
        </Form>
        <div className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <button
            type="button"
            className="text-primary underline-offset-4 hover:underline"
            onClick={async () => {
              const supabase = createClient()
              await supabase.auth.signOut()
              router.push('/login')
            }}
          >
            Sign in
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
