'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { updateOrganizationSchema, type UpdateOrganizationInput } from '@/lib/validations/settings'
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

interface OrganizationSectionProps {
  organization: { id: string; name: string; slug: string; musician_policy?: string | null }
  role: 'owner' | 'admin' | 'member'
}

export function OrganizationSection({ organization, role }: OrganizationSectionProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const canEdit = role === 'owner' || role === 'admin'

  const form = useForm<UpdateOrganizationInput>({
    resolver: zodResolver(updateOrganizationSchema),
    defaultValues: {
      name: organization.name,
      musician_policy: organization.musician_policy || '',
    },
  })

  async function onSubmit(data: UpdateOrganizationInput) {
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    const response = await fetch('/api/settings/organization', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Failed to update organization')
      setIsLoading(false)
      return
    }

    setSuccess(true)
    setIsLoading(false)
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization</CardTitle>
        <CardDescription>Manage your organization settings</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-md bg-green-500/15 p-3 text-sm text-green-700 dark:text-green-400">
                Organization settings saved successfully
              </div>
            )}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organization Name</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={!canEdit} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div>
              <label className="text-sm font-medium">Slug</label>
              <Input value={organization.slug} disabled className="mt-1.5" />
              <p className="mt-1 text-sm text-muted-foreground">
                The slug cannot be changed
              </p>
            </div>
            <FormField
              control={form.control}
              name="musician_policy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Musician Policy</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value || ''}
                      disabled={!canEdit}
                      rows={10}
                      placeholder="Enter your organization's musician policy here. This will be shown to musicians when they accept contract offers."
                    />
                  </FormControl>
                  <FormDescription>
                    Customize the policy that musicians agree to when accepting offers. Leave blank to use the default policy.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {canEdit && (
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
