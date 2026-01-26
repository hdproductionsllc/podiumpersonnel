'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { onboardingSchema, type OnboardingInput } from '@/lib/validations/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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

export function OnboardingForm() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showOptionalFields, setShowOptionalFields] = useState(false)

  const form = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      organizationName: '',
      slug: '',
      musician_policy: '',
    },
  })

  const organizationName = form.watch('organizationName')

  // Auto-generate slug from organization name
  useEffect(() => {
    if (organizationName) {
      const slug = organizationName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim()
      form.setValue('slug', slug, { shouldValidate: true })
    }
  }, [organizationName, form])

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

    // Create organization
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: data.organizationName,
        slug: data.slug,
        musician_policy: data.musician_policy || null,
      })
      .select()
      .single()

    if (orgError) {
      if (orgError.code === '23505') {
        setError('An organization with this slug already exists')
      } else {
        setError(orgError.message)
      }
      setIsLoading(false)
      return
    }

    // Add user as owner
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: organization.id,
        user_id: user.id,
        role: 'owner',
      })

    if (memberError) {
      setError(memberError.message)
      setIsLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Create your organization</CardTitle>
        <CardDescription>
          Set up your orchestra or ensemble to get started
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
              name="organizationName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organization Name</FormLabel>
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
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL Slug</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="bay-area-symphony"
                      {...field}
                      onChange={(e) => {
                        const value = e.target.value
                          .toLowerCase()
                          .replace(/\s+/g, '-')
                          .replace(/[^a-z0-9-]/g, '')
                        field.onChange(value)
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    This will be used in your organization&apos;s URL
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!showOptionalFields ? (
              <button
                type="button"
                onClick={() => setShowOptionalFields(true)}
                className="text-sm text-primary hover:underline"
              >
                + Add musician policy (optional)
              </button>
            ) : (
              <FormField
                control={form.control}
                name="musician_policy"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Musician Policy</FormLabel>
                      <span className="text-xs text-muted-foreground">Optional</span>
                    </div>
                    <FormControl>
                      <Textarea
                        placeholder="Enter your organization's musician guidelines and policies..."
                        rows={6}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      This will be shown to musicians when they accept contract offers.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="pt-2">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Creating organization...' : 'Create organization'}
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                You can update all these settings later under Settings.
              </p>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
