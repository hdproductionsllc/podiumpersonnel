'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { bookSchema, type BookInput } from '@/lib/validations/books'
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
import type { BookWithEntries } from './books-client'

// Ensemble presets with instrument names and chair counts
const ENSEMBLE_PRESETS = [
  { id: 'empty', name: 'Empty (add instruments manually)', instruments: [] },
  { id: 'string-quartet', name: 'String Quartet', instruments: [
    { name: 'Violin 1', chairs: 1 },
    { name: 'Violin 2', chairs: 1 },
    { name: 'Viola', chairs: 1 },
    { name: 'Cello', chairs: 1 },
  ]},
  { id: 'string-trio', name: 'String Trio', instruments: [
    { name: 'Violin 1', chairs: 1 },
    { name: 'Viola', chairs: 1 },
    { name: 'Cello', chairs: 1 },
  ]},
  { id: 'piano-trio', name: 'Piano Trio', instruments: [
    { name: 'Violin 1', chairs: 1 },
    { name: 'Cello', chairs: 1 },
    { name: 'Piano', chairs: 1 },
  ]},
  { id: 'piano-quartet', name: 'Piano Quartet', instruments: [
    { name: 'Violin 1', chairs: 1 },
    { name: 'Viola', chairs: 1 },
    { name: 'Cello', chairs: 1 },
    { name: 'Piano', chairs: 1 },
  ]},
  { id: 'piano-quintet', name: 'Piano Quintet', instruments: [
    { name: 'Violin 1', chairs: 1 },
    { name: 'Violin 2', chairs: 1 },
    { name: 'Viola', chairs: 1 },
    { name: 'Cello', chairs: 1 },
    { name: 'Piano', chairs: 1 },
  ]},
  { id: 'string-quintet', name: 'String Quintet (with Bass)', instruments: [
    { name: 'Violin 1', chairs: 1 },
    { name: 'Violin 2', chairs: 1 },
    { name: 'Viola', chairs: 1 },
    { name: 'Cello', chairs: 1 },
    { name: 'Double Bass', chairs: 1 },
  ]},
  { id: 'woodwind-quintet', name: 'Woodwind Quintet', instruments: [
    { name: 'Flute', chairs: 1 },
    { name: 'Oboe', chairs: 1 },
    { name: 'Clarinet', chairs: 1 },
    { name: 'Bassoon', chairs: 1 },
    { name: 'French Horn', chairs: 1 },
  ]},
  { id: 'brass-quintet', name: 'Brass Quintet', instruments: [
    { name: 'Trumpet', chairs: 2 },
    { name: 'French Horn', chairs: 1 },
    { name: 'Trombone', chairs: 1 },
    { name: 'Tuba', chairs: 1 },
  ]},
  { id: 'jazz-trio', name: 'Jazz Trio', instruments: [
    { name: 'Piano', chairs: 1 },
    { name: 'Double Bass', chairs: 1 },
    { name: 'Drum Set', chairs: 1 },
  ]},
  { id: 'jazz-quartet', name: 'Jazz Quartet', instruments: [
    { name: 'Piano', chairs: 1 },
    { name: 'Double Bass', chairs: 1 },
    { name: 'Drum Set', chairs: 1 },
    { name: 'Alto Saxophone', chairs: 1 },
  ]},
  { id: 'chamber-orchestra', name: 'Chamber Orchestra', instruments: [
    { name: 'Violin 1', chairs: 4 },
    { name: 'Violin 2', chairs: 4 },
    { name: 'Viola', chairs: 3 },
    { name: 'Cello', chairs: 2 },
    { name: 'Double Bass', chairs: 1 },
  ]},
]

interface BookFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  book: BookWithEntries | null
  organizationId: string
  onSuccess: () => void
}

export function BookFormDialog({
  open,
  onOpenChange,
  book,
  organizationId,
  onSuccess,
}: BookFormDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPreset, setSelectedPreset] = useState('empty')
  const isEditing = !!book

  const form = useForm<BookInput>({
    resolver: zodResolver(bookSchema),
    defaultValues: {
      name: '',
      description: '',
      is_default: false,
    },
  })

  useEffect(() => {
    if (open) {
      if (book) {
        form.reset({
          name: book.name,
          description: book.description || '',
          is_default: book.is_default,
        })
      } else {
        form.reset({
          name: '',
          description: '',
          is_default: false,
        })
        setSelectedPreset('empty')
      }
      setError(null)
    }
  }, [open, book, form])

  // Auto-fill name when preset changes
  function handlePresetChange(presetId: string) {
    setSelectedPreset(presetId)
    const preset = ENSEMBLE_PRESETS.find(p => p.id === presetId)
    if (preset && presetId !== 'empty' && !form.getValues('name')) {
      form.setValue('name', preset.name)
    }
  }

  async function onSubmit(data: BookInput) {
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    // If setting as default, unset any existing default
    if (data.is_default) {
      await supabase
        .from('books')
        .update({ is_default: false })
        .eq('organization_id', organizationId)
        .eq('is_default', true)
    }

    if (isEditing) {
      const { error: updateError } = await supabase
        .from('books')
        .update({
          name: data.name,
          description: data.description || null,
          is_default: data.is_default,
        })
        .eq('id', book.id)

      if (updateError) {
        setError(updateError.message)
        setIsLoading(false)
        return
      }
    } else {
      // Create new book
      const { data: newBook, error: insertError } = await supabase
        .from('books')
        .insert({
          organization_id: organizationId,
          name: data.name,
          description: data.description || null,
          is_default: data.is_default,
        })
        .select('id')
        .single()

      if (insertError || !newBook) {
        setError(insertError?.message || 'Failed to create ensemble')
        setIsLoading(false)
        return
      }

      // If a preset was selected, add the instruments
      const preset = ENSEMBLE_PRESETS.find(p => p.id === selectedPreset)
      if (preset && preset.instruments.length > 0) {
        // Fetch all instruments to get their IDs
        const { data: instruments } = await supabase
          .from('instruments')
          .select('id, name')
          .eq('organization_id', organizationId)

        if (instruments) {
          const instrumentMap = new Map(instruments.map(i => [i.name, i.id]))

          // Create book entries for each instrument in the preset
          const entries: { book_id: string; instrument_id: string; chair_number: number; priority: number }[] = []

          for (const item of preset.instruments) {
            const instrumentId = instrumentMap.get(item.name)
            if (instrumentId) {
              // Add entries for each chair
              for (let chair = 1; chair <= item.chairs; chair++) {
                entries.push({
                  book_id: newBook.id,
                  instrument_id: instrumentId,
                  chair_number: chair,
                  priority: 1,
                })
              }
            }
          }

          if (entries.length > 0) {
            await supabase.from('book_entries').insert(entries)
          }
        }
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
            {isEditing ? 'Ensemble Settings' : 'Add Ensemble'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Rename, add description, or set as default.'
              : 'Create a new saved ensemble.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {!isEditing && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Start from preset</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={selectedPreset}
                  onChange={(e) => handlePresetChange(e.target.value)}
                >
                  {ENSEMBLE_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                      {preset.instruments.length > 0 && ` (${preset.instruments.reduce((sum, i) => sum + i.chairs, 0)} positions)`}
                    </option>
                  ))}
                </select>
                {selectedPreset !== 'empty' && (
                  <p className="text-xs text-muted-foreground">
                    Includes: {ENSEMBLE_PRESETS.find(p => p.id === selectedPreset)?.instruments.map(i =>
                      i.chairs > 1 ? `${i.name} (${i.chairs})` : i.name
                    ).join(', ')}
                  </p>
                )}
              </div>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Main Roster" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <textarea
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Description of this personnel list..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_default"
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
                  <FormLabel className="!mt-0">Set as default ensemble</FormLabel>
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
                  ? isEditing ? 'Saving...' : 'Creating...'
                  : isEditing ? 'Save Changes' : 'Create Ensemble'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
