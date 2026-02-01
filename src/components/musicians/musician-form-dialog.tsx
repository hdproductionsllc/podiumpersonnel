'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { musicianSchema, type MusicianInput, HOME_REGIONS } from '@/lib/validations/musicians'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import type { MusicianWithInstruments, InstrumentOption } from './musicians-client'

interface MusicianFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  musician: MusicianWithInstruments | null
  instruments: InstrumentOption[]
  organizationId: string
  onSuccess: () => void
}

export function MusicianFormDialog({
  open,
  onOpenChange,
  musician,
  instruments,
  organizationId,
  onSuccess,
}: MusicianFormDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [moreDetailsOpen, setMoreDetailsOpen] = useState(false)
  const [complianceOpen, setComplianceOpen] = useState(false)
  const isEditing = !!musician

  const form = useForm<MusicianInput>({
    resolver: zodResolver(musicianSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      notes: '',
      is_active: true,
      instrument_ids: [],
      zip_code: '',
      home_region: '',
      service_radius_miles: 50,
      call_order: 50,
      is_leader: false,
      w9_on_file: false,
      zelle_method: '',
      zelle_verified: false,
    },
  })

  // Determine if sections should auto-expand based on existing data
  function hasMoreDetailsData(m: MusicianWithInstruments): boolean {
    return !!(
      m.phone ||
      m.notes ||
      (m.call_order !== undefined && m.call_order !== null && m.call_order !== 50) ||
      m.is_leader ||
      m.home_region ||
      m.zip_code ||
      (m.service_radius_miles !== undefined && m.service_radius_miles !== null && m.service_radius_miles !== 50) ||
      !m.is_active
    )
  }

  function hasComplianceData(m: MusicianWithInstruments): boolean {
    return !!(m.w9_on_file || m.zelle_method || m.zelle_verified)
  }

  useEffect(() => {
    if (open) {
      if (musician) {
        form.reset({
          first_name: musician.first_name,
          last_name: musician.last_name,
          email: musician.email || '',
          phone: musician.phone || '',
          notes: musician.notes || '',
          is_active: musician.is_active,
          instrument_ids: musician.musician_instruments.map((mi) => mi.instrument_id),
          zip_code: (musician as any).zip_code || '',
          home_region: (musician as any).home_region || '',
          service_radius_miles: (musician as any).service_radius_miles ?? 50,
          call_order: (musician as any).call_order ?? 50,
          is_leader: (musician as any).is_leader ?? false,
          w9_on_file: (musician as any).w9_on_file ?? false,
          zelle_method: (musician as any).zelle_method || '',
          zelle_verified: (musician as any).zelle_verified ?? false,
        })
        // Auto-expand sections with data
        setMoreDetailsOpen(hasMoreDetailsData(musician))
        setComplianceOpen(hasComplianceData(musician))
      } else {
        form.reset({
          first_name: '',
          last_name: '',
          email: '',
          phone: '',
          notes: '',
          is_active: true,
          instrument_ids: [],
          zip_code: '',
          home_region: '',
          service_radius_miles: 50,
          call_order: 50,
          is_leader: false,
          w9_on_file: false,
          zelle_method: '',
          zelle_verified: false,
        })
        setMoreDetailsOpen(false)
        setComplianceOpen(false)
      }
      setError(null)
    }
  }, [open, musician, form])

  async function onSubmit(data: MusicianInput) {
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    if (isEditing) {
      const { error: updateError } = await supabase
        .from('musicians')
        .update({
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email || null,
          phone: data.phone || null,
          notes: data.notes || null,
          is_active: data.is_active,
          zip_code: data.zip_code || null,
          home_region: data.home_region || null,
          service_radius_miles: data.service_radius_miles ?? 50,
          call_order: data.call_order ?? 50,
          is_leader: data.is_leader ?? false,
          w9_on_file: data.w9_on_file ?? false,
          zelle_method: data.zelle_method || null,
          zelle_verified: data.zelle_verified ?? false,
        })
        .eq('id', musician.id)

      if (updateError) {
        setError(updateError.message)
        setIsLoading(false)
        return
      }

      // Delete existing instrument assignments
      const { error: deleteError } = await supabase
        .from('musician_instruments')
        .delete()
        .eq('musician_id', musician.id)

      if (deleteError) {
        setError(deleteError.message)
        setIsLoading(false)
        return
      }

      // Re-insert selected instruments
      if (data.instrument_ids && data.instrument_ids.length > 0) {
        const { error: insertError } = await supabase
          .from('musician_instruments')
          .insert(
            data.instrument_ids.map((instrument_id) => ({
              musician_id: musician.id,
              instrument_id,
            }))
          )

        if (insertError) {
          setError(insertError.message)
          setIsLoading(false)
          return
        }
      }

    } else {
      const { data: newMusician, error: insertError } = await supabase
        .from('musicians')
        .insert({
          organization_id: organizationId,
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email || null,
          phone: data.phone || null,
          notes: data.notes || null,
          is_active: data.is_active,
          zip_code: data.zip_code || null,
          home_region: data.home_region || null,
          service_radius_miles: data.service_radius_miles ?? 50,
          call_order: data.call_order ?? 50,
          is_leader: data.is_leader ?? false,
          w9_on_file: data.w9_on_file ?? false,
          zelle_method: data.zelle_method || null,
          zelle_verified: data.zelle_verified ?? false,
        })
        .select('id')
        .single()

      if (insertError || !newMusician) {
        setError(insertError?.message || 'Failed to create musician')
        setIsLoading(false)
        return
      }

      if (data.instrument_ids && data.instrument_ids.length > 0) {
        const { error: instrError } = await supabase
          .from('musician_instruments')
          .insert(
            data.instrument_ids.map((instrument_id) => ({
              musician_id: newMusician.id,
              instrument_id,
            }))
          )

        if (instrError) {
          setError(instrError.message)
          setIsLoading(false)
          return
        }
      }

    }

    setIsLoading(false)
    onSuccess()
  }

  const watchedInstrumentIds = form.watch('instrument_ids') || []
  const watchedEmail = form.watch('email')
  const watchedPhone = form.watch('phone')
  const watchedZelleMethod = form.watch('zelle_method')

  // Determine if zelle_verified can be checked
  const canVerifyZelle =
    (watchedZelleMethod === 'email' && !!watchedEmail) ||
    (watchedZelleMethod === 'phone' && !!watchedPhone)

  // Auto-uncheck zelle_verified if conditions are no longer met
  useEffect(() => {
    if (!canVerifyZelle && form.getValues('zelle_verified')) {
      form.setValue('zelle_verified', false)
    }
  }, [canVerifyZelle, form])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Musician' : 'Add Musician'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the musician details.'
              : 'Add a new musician to your orchestra.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Essential Fields - Always Visible */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. John" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Smith" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="musician@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <FormLabel>Instruments</FormLabel>
              <div className="max-h-48 overflow-y-auto rounded-md border p-3 space-y-2">
                {instruments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No instruments defined yet. You can add instruments later in the Instruments page.
                  </p>
                ) : (
                  instruments.map((instrument) => {
                    const isChecked = watchedInstrumentIds.includes(instrument.id)
                    return (
                      <label
                        key={instrument.id}
                        className="flex items-center gap-2 cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300"
                          checked={isChecked}
                          onChange={(e) => {
                            const updated = e.target.checked
                              ? [...watchedInstrumentIds, instrument.id]
                              : watchedInstrumentIds.filter((id) => id !== instrument.id)
                            form.setValue('instrument_ids', updated)
                          }}
                        />
                        {instrument.name}
                      </label>
                    )
                  })
                )}
              </div>
            </div>

            {/* More Details - Collapsible */}
            <div className="border rounded-md">
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
                onClick={() => setMoreDetailsOpen(!moreDetailsOpen)}
              >
                <span>More Details</span>
                <svg
                  className={`h-4 w-4 transition-transform ${moreDetailsOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {moreDetailsOpen && (
                <div className="px-4 pb-4 space-y-4 border-t">
                  <div className="pt-4">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. (555) 123-4567" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <textarea
                            className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            placeholder="Additional notes..."
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="call_order"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Call Order</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={999}
                              placeholder="1-999 (lower = higher priority)"
                              {...field}
                              onChange={(e) => field.onChange(Number(e.target.value) || 50)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="is_leader"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 pt-8">
                          <FormControl>
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300"
                              checked={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel className="!mt-0">Can Lead (Violin 1)</FormLabel>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="home_region"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Home Region</FormLabel>
                        <FormControl>
                          <select
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value)}
                          >
                            <option value="">Select a region...</option>
                            {HOME_REGIONS.map((region) => (
                              <option key={region} value={region}>{region}</option>
                            ))}
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="zip_code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Zip Code</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. 90210" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="service_radius_miles"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Service Radius (miles)</FormLabel>
                          <FormControl>
                            <select
                              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              value={field.value ?? 50}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                            >
                              <option value={25}>25 miles</option>
                              <option value={50}>50 miles</option>
                              <option value={75}>75 miles</option>
                              <option value={100}>100 miles</option>
                              <option value={150}>150+ miles</option>
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="is_active"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormControl>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300"
                            checked={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Active</FormLabel>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            {/* Compliance & Payment - Collapsible */}
            <div className="border rounded-md">
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
                onClick={() => setComplianceOpen(!complianceOpen)}
              >
                <span>Compliance & Payment</span>
                <svg
                  className={`h-4 w-4 transition-transform ${complianceOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {complianceOpen && (
                <div className="px-4 pb-4 space-y-4 border-t">
                  <div className="pt-4">
                    <FormField
                      control={form.control}
                      name="w9_on_file"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2">
                          <FormControl>
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300"
                              checked={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel className="!mt-0">W-9 on File</FormLabel>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="zelle_method"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Zelle Method</FormLabel>
                          <FormControl>
                            <select
                              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              value={field.value ?? ''}
                              onChange={(e) => field.onChange(e.target.value)}
                            >
                              <option value="">Not set</option>
                              <option value="email">Email</option>
                              <option value="phone">Phone</option>
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="zelle_verified"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 pt-8">
                          <FormControl>
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                              checked={field.value}
                              onChange={field.onChange}
                              disabled={!canVerifyZelle}
                            />
                          </FormControl>
                          <FormLabel className={`!mt-0 ${!canVerifyZelle ? 'text-muted-foreground' : ''}`}>
                            Verified
                          </FormLabel>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading
                  ? isEditing ? 'Saving...' : 'Adding...'
                  : isEditing ? 'Save Changes' : 'Add Musician'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>

    </Dialog>
  )
}
