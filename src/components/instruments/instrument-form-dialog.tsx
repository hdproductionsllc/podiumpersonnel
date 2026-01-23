'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import {
  instrumentSchema,
  type InstrumentInput,
  INSTRUMENT_SECTIONS,
  SECTION_LABELS,
} from '@/lib/validations/instruments'
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
import type { Instrument } from '@/types'

interface InstrumentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instrument: Instrument | null
  organizationId: string
  onSuccess: () => void
}

export function InstrumentFormDialog({
  open,
  onOpenChange,
  instrument,
  organizationId,
  onSuccess,
}: InstrumentFormDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEditing = !!instrument

  const form = useForm<InstrumentInput>({
    resolver: zodResolver(instrumentSchema),
    defaultValues: {
      name: '',
      abbreviation: '',
      section: undefined,
      sort_order: 0,
    },
  })

  useEffect(() => {
    if (open) {
      if (instrument) {
        form.reset({
          name: instrument.name,
          abbreviation: instrument.abbreviation || '',
          section: (instrument.section as InstrumentInput['section']) || undefined,
          sort_order: instrument.sort_order,
        })
      } else {
        form.reset({
          name: '',
          abbreviation: '',
          section: undefined,
          sort_order: 0,
        })
      }
      setError(null)
    }
  }, [open, instrument, form])

  async function onSubmit(data: InstrumentInput) {
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    if (isEditing) {
      const { error: updateError } = await supabase
        .from('instruments')
        .update({
          name: data.name,
          abbreviation: data.abbreviation || null,
          section: data.section || null,
          sort_order: data.sort_order,
        })
        .eq('id', instrument.id)

      if (updateError) {
        setError(updateError.message)
        setIsLoading(false)
        return
      }
    } else {
      const { error: insertError } = await supabase
        .from('instruments')
        .insert({
          organization_id: organizationId,
          name: data.name,
          abbreviation: data.abbreviation || null,
          section: data.section || null,
          sort_order: data.sort_order,
        })

      if (insertError) {
        setError(insertError.message)
        setIsLoading(false)
        return
      }
    }

    setIsLoading(false)
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Instrument' : 'Add Instrument'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the instrument details.'
              : 'Add a new instrument to your orchestra.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Violin 1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="abbreviation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Abbreviation</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Vln 1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="section"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Section</FormLabel>
                  <FormControl>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={field.value || ''}
                      onChange={field.onChange}
                    >
                      <option value="">No section</option>
                      {INSTRUMENT_SECTIONS.map((s) => (
                        <option key={s} value={s}>
                          {SECTION_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sort_order"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sort Order</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                  : isEditing ? 'Save Changes' : 'Add Instrument'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
