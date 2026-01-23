'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { musicianSchema, type MusicianInput } from '@/lib/validations/musicians'
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
    },
  })

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
        })
      } else {
        form.reset({
          first_name: '',
          last_name: '',
          email: '',
          phone: '',
          notes: '',
          is_active: true,
          instrument_ids: [],
        })
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

            <div className="space-y-2">
              <FormLabel>Instruments</FormLabel>
              <div className="max-h-48 overflow-y-auto rounded-md border p-3 space-y-2">
                {instruments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No instruments available. Add instruments first.
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
