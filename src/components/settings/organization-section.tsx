'use client'

import { reloadPage } from '@/lib/reload-page'
import { useState } from 'react'
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
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { resolveVertical, term } from '@/lib/verticals'
import { useTerms } from '@/components/providers/vertical-provider'
import type { OrgStaffingSettings } from '@/lib/staffing/settings'

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
]

interface OrganizationSectionProps {
  organization: { id: string; name: string; slug: string; timezone: string; vertical?: string; musician_policy?: string | null; disable_staffing_alerts?: boolean }
  /** Migration 096's switches; null when they could not be read (the switches are then not shown). */
  staffingSettings?: OrgStaffingSettings | null
  role: 'owner' | 'admin' | 'member'
}

export function OrganizationSection({ organization, staffingSettings = null, role }: OrganizationSectionProps) {
  const terms = useTerms()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const canEdit = role === 'owner' || role === 'admin'
  // "chair" for verticals with chairs, "spot" for the ones without.
  const rankOrSpot = term(terms, 'rank', { case: 'lower' }) || 'spot'

  const form = useForm<UpdateOrganizationInput>({
    resolver: zodResolver(updateOrganizationSchema),
    defaultValues: {
      name: organization.name,
      slug: organization.slug,
      timezone: organization.timezone,
      musician_policy: organization.musician_policy || '',
      disable_staffing_alerts: organization.disable_staffing_alerts || false,
      // Left undefined when unreadable, so a save never writes columns that may not exist.
      auto_cascade: staffingSettings?.autoCascade,
      allow_worker_drop: staffingSettings?.allowWorkerDrop,
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
    reloadPage()
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
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled={!canEdit}
                      placeholder="my-organization"
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
                    Used in URLs. Only lowercase letters, numbers, and hyphens allowed.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Timezone</FormLabel>
                  <FormControl>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      {...field}
                      disabled={!canEdit}
                    >
                      {TIMEZONE_OPTIONS.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormDescription>
                    Used for displaying dates and times in emails and the {term(terms, 'person', { case: 'lower' })} portal.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-2">
              <Label htmlFor="organization-type">Organization type</Label>
              <Input
                id="organization-type"
                value={resolveVertical(organization.vertical).displayName}
                disabled
                readOnly
              />
              <p className="text-muted-foreground text-sm">
                Contact support to change your organization type.
              </p>
            </div>
            <FormField
              control={form.control}
              name="musician_policy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{term(terms, 'person')} Policy</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value || ''}
                      disabled={!canEdit}
                      rows={10}
                      placeholder={`Enter your organization's ${term(terms, 'person', { case: 'lower' })} policy here. This will be shown to ${term(terms, 'person', { plural: true, case: 'lower' })} when they accept contract offers.`}
                    />
                  </FormControl>
                  <FormDescription>
                    Customize the policy that {term(terms, 'person', { plural: true, case: 'lower' })} agree to when accepting offers. Leave blank to use the default policy.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="disable_staffing_alerts"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="disable_staffing_alerts">Staffing Alert Emails</Label>
                      <FormDescription>
                        Receive email alerts when upcoming gigs have unfilled positions (14, 7, and 3 days out).
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        id="disable_staffing_alerts"
                        checked={!field.value}
                        onCheckedChange={(checked) => field.onChange(!checked)}
                        disabled={!canEdit}
                      />
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />
            {staffingSettings && (
              <>
                <FormField
                  control={form.control}
                  name="auto_cascade"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <Label htmlFor="auto_cascade">Auto-offer to the next person</Label>
                          <FormDescription>
                            When someone declines, lets an offer run out, or drops out, Podium offers the {rankOrSpot} to the next available {term(terms, 'person', { case: 'lower' })} on your list at the same pay and emails you who it went to.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            id="auto_cascade"
                            checked={!!field.value}
                            onCheckedChange={field.onChange}
                            disabled={!canEdit}
                          />
                        </FormControl>
                      </div>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="allow_worker_drop"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <Label htmlFor="allow_worker_drop">Let people drop out themselves</Label>
                          <FormDescription>
                            Lets a {term(terms, 'person', { case: 'lower' })} who has accepted release themselves from a {term(terms, 'work', { case: 'lower' })} on their offer page, and emails you straight away; when off, they have to ask you or request a substitute instead.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            id="allow_worker_drop"
                            checked={!!field.value}
                            onCheckedChange={field.onChange}
                            disabled={!canEdit}
                          />
                        </FormControl>
                      </div>
                    </FormItem>
                  )}
                />
              </>
            )}
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
