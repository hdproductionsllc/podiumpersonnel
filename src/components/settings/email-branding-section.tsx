'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { updateEmailBrandingSchema, type UpdateEmailBrandingInput } from '@/lib/validations/settings'
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
import { EmailPreview } from './email-preview'

const DEFAULT_BRAND_COLOR = '#3b82f6'

const PRESET_COLORS = [
  { value: '#3b82f6', label: 'Blue' },
  { value: '#10b981', label: 'Green' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', label: 'Red' },
  { value: '#1a1a1a', label: 'Black' },
]

interface EmailBrandingSectionProps {
  organization: {
    id: string
    name: string
    email_logo_url?: string | null
    email_brand_color?: string | null
    email_footer_text?: string | null
  }
  role: 'owner' | 'admin' | 'member'
}

export function EmailBrandingSection({ organization, role }: EmailBrandingSectionProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const canEdit = role === 'owner' || role === 'admin'

  const form = useForm<UpdateEmailBrandingInput>({
    resolver: zodResolver(updateEmailBrandingSchema),
    defaultValues: {
      email_logo_url: organization.email_logo_url || '',
      email_brand_color: organization.email_brand_color || DEFAULT_BRAND_COLOR,
      email_footer_text: organization.email_footer_text || '',
    },
  })

  const watchedValues = form.watch()

  async function onSubmit(data: UpdateEmailBrandingInput) {
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    const response = await fetch('/api/settings/email-branding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email_logo_url: data.email_logo_url || null,
        email_brand_color: data.email_brand_color || DEFAULT_BRAND_COLOR,
        email_footer_text: data.email_footer_text || null,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(result.error || 'Failed to update email branding')
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
        <CardTitle>Email Branding</CardTitle>
        <CardDescription>
          Customize the appearance of emails sent to musicians
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-md bg-green-500/15 p-3 text-sm text-green-700 dark:text-green-400">
                Email branding saved successfully
              </div>
            )}

            <FormField
              control={form.control}
              name="email_logo_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Logo URL</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value || ''}
                      disabled={!canEdit}
                      placeholder="https://example.com/logo.png"
                    />
                  </FormControl>
                  <FormDescription>
                    URL of your organization&apos;s logo. Recommended size: 200x60 pixels. PNG or JPG format.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email_brand_color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brand Color</FormLabel>
                  <div className="flex gap-3 items-center">
                    <FormControl>
                      <div className="flex gap-2 items-center">
                        <Input
                          type="color"
                          {...field}
                          value={field.value || DEFAULT_BRAND_COLOR}
                          disabled={!canEdit}
                          className="w-14 h-10 p-1 cursor-pointer"
                        />
                        <Input
                          {...field}
                          value={field.value || DEFAULT_BRAND_COLOR}
                          disabled={!canEdit}
                          placeholder="#3b82f6"
                          className="w-28 font-mono"
                          onChange={(e) => {
                            const val = e.target.value
                            if (val.match(/^#[0-9A-Fa-f]{0,6}$/)) {
                              field.onChange(val)
                            }
                          }}
                        />
                      </div>
                    </FormControl>
                    <div className="flex gap-1">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color.value}
                          type="button"
                          disabled={!canEdit}
                          className="w-6 h-6 rounded-full border-2 border-transparent hover:border-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{ backgroundColor: color.value }}
                          onClick={() => field.onChange(color.value)}
                          title={color.label}
                        />
                      ))}
                    </div>
                  </div>
                  <FormDescription>
                    Used for buttons and accents in emails
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email_footer_text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Custom Footer Text</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value || ''}
                      disabled={!canEdit}
                      rows={3}
                      placeholder="Questions? Contact us at info@example.com"
                    />
                  </FormControl>
                  <FormDescription>
                    Additional text shown at the bottom of emails. Leave blank to use the default footer.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3">
              {canEdit && (
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? 'Hide Preview' : 'Show Preview'}
              </Button>
            </div>
          </form>
        </Form>

        {showPreview && (
          <div className="mt-6 border-t pt-6">
            <h4 className="font-medium mb-4">Email Preview</h4>
            <EmailPreview
              organizationName={organization.name}
              logoUrl={watchedValues.email_logo_url || undefined}
              brandColor={watchedValues.email_brand_color || DEFAULT_BRAND_COLOR}
              footerText={watchedValues.email_footer_text || undefined}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
