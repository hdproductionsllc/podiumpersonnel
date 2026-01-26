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
      }
      setError(null)
    }
  }, [open, book, form])

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
      const { error: insertError } = await supabase
        .from('books')
        .insert({
          organization_id: organizationId,
          name: data.name,
          description: data.description || null,
          is_default: data.is_default,
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

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
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
