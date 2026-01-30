'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import {
  projectSchema,
  type ProjectInput,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
} from '@/lib/validations/projects'
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
import type { ProjectWithServices } from './projects-client'

interface ProjectFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: ProjectWithServices | null
  organizationId: string
  onSuccess: (newProject?: { id: string; start_date: string | null; end_date: string | null }) => void
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  organizationId,
  onSuccess,
}: ProjectFormDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isEditing = !!project

  const form = useForm<ProjectInput>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: '',
      description: '',
      start_date: '',
      end_date: '',
      status: 'active',
    },
  })

  useEffect(() => {
    if (open) {
      if (project) {
        form.reset({
          name: project.name,
          description: project.description || '',
          start_date: project.start_date || '',
          end_date: project.end_date || '',
          status: project.status,
        })
      } else {
        form.reset({
          name: '',
          description: '',
          start_date: '',
          end_date: '',
          status: 'active',
        })
      }
      setError(null)
    }
  }, [open, project, form])

  async function onSubmit(data: ProjectInput) {
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    if (isEditing) {
      const { error: updateError } = await supabase
        .from('projects')
        .update({
          name: data.name,
          description: data.description || null,
          start_date: data.start_date || null,
          end_date: data.end_date || null,
          status: data.status,
        })
        .eq('id', project.id)

      if (updateError) {
        setError(updateError.message)
        setIsLoading(false)
        return
      }
    } else {
      const { data: newProject, error: insertError } = await supabase
        .from('projects')
        .insert({
          organization_id: organizationId,
          name: data.name,
          description: data.description || null,
          start_date: data.start_date || null,
          end_date: data.end_date || null,
          status: data.status,
        })
        .select('id')
        .single()

      if (insertError) {
        setError(insertError.message)
        setIsLoading(false)
        return
      }

      setIsLoading(false)
      onSuccess({
        id: newProject.id,
        start_date: data.start_date || null,
        end_date: data.end_date || null,
      })
      return
    }

    setIsLoading(false)
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Project' : 'Add Project'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the project details.'
              : 'A project represents a gig, concert, or event — it can include one or more rehearsals and performances.'}
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
                    <Input placeholder="e.g. Spring Concert 2026" {...field} />
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
                      placeholder="Project description..."
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
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        value={field.value}
                        onChange={(e) => {
                          const newValue = e.target.value
                          field.onChange(e)
                          // Auto-populate end_date if not already set (only when complete date entered)
                          const currentEndDate = form.getValues('end_date')
                          if (!currentEndDate && newValue && newValue.length === 10) {
                            form.setValue('end_date', newValue)
                          }
                        }}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">First rehearsal date</p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Final performance date</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <FormControl>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      {...field}
                    >
                      {PROJECT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {PROJECT_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
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
                  ? isEditing ? 'Saving...' : 'Creating...'
                  : isEditing ? 'Save Changes' : 'Create Project'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
