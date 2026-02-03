'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import {
  projectSchema,
  type ProjectInput,
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

type TemplateType = 'string-quartet' | 'orchestra' | 'custom'

const TEMPLATES: Record<TemplateType, { label: string; description: string; defaultName: string }> = {
  'string-quartet': {
    label: 'String Quartet Gig',
    description: '1 rehearsal + 1 performance, quartet positions',
    defaultName: 'String Quartet Gig',
  },
  'orchestra': {
    label: 'Orchestra Concert',
    description: '2 rehearsals + 1 performance',
    defaultName: 'Orchestra Concert',
  },
  'custom': {
    label: 'Custom Project',
    description: 'Blank form — set up everything yourself',
    defaultName: '',
  },
}

interface ProjectFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: ProjectWithServices | null
  organizationId: string
  isFirstProject?: boolean
  onSuccess: (newProject?: { id: string; start_date: string | null; end_date: string | null; template?: TemplateType }) => void
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  organizationId,
  isFirstProject,
  onSuccess,
}: ProjectFormDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType | null>(null)
  const [isSingleDay, setIsSingleDay] = useState(false)
  const isEditing = !!project

  const form = useForm<ProjectInput>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: '',
      description: '',
      internal_notes: '',
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
          internal_notes: project.internal_notes || '',
          start_date: project.start_date || '',
          end_date: project.end_date || '',
          status: project.status,
        })
        setShowTemplatePicker(false)
        setSelectedTemplate(null)
        // Auto-detect single-day event
        setIsSingleDay(
          !!project.start_date && !!project.end_date && project.start_date === project.end_date
        )
      } else {
        form.reset({
          name: '',
          description: '',
          internal_notes: '',
          start_date: '',
          end_date: '',
          status: 'active',
        })
        // Show template picker for first project
        setShowTemplatePicker(!!isFirstProject)
        setSelectedTemplate(null)
        setIsSingleDay(false)
      }
      setError(null)
    }
  }, [open, project, form, isFirstProject])

  function handleTemplateSelect(template: TemplateType) {
    setSelectedTemplate(template)
    setShowTemplatePicker(false)
    if (template !== 'custom') {
      form.setValue('name', TEMPLATES[template].defaultName)
    }
  }

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
          internal_notes: data.internal_notes || null,
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
          internal_notes: data.internal_notes || null,
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
        template: selectedTemplate || undefined,
      })
      return
    }

    setIsLoading(false)
    onSuccess()
  }

  // Template picker step
  if (showTemplatePicker) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose a Template</DialogTitle>
            <DialogDescription>
              Start with a template or create from scratch.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {(Object.keys(TEMPLATES) as TemplateType[]).map((key) => {
              const t = TEMPLATES[key]
              return (
                <button
                  key={key}
                  type="button"
                  className="w-full rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 hover:border-primary/30"
                  onClick={() => handleTemplateSelect(key)}
                >
                  <p className="font-medium">{t.label}</p>
                  <p className="text-sm text-muted-foreground">{t.description}</p>
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    )
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
                  <div className="flex items-center gap-2">
                    <FormLabel>Description</FormLabel>
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                      Shared with musicians
                    </span>
                  </div>
                  <FormControl>
                    <textarea
                      className="flex min-h-[80px] w-full rounded-md border border-input border-l-4 border-l-blue-400 dark:border-l-blue-600 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Project description..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="internal_notes"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormLabel>Internal Notes</FormLabel>
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                      </svg>
                      Team only
                    </span>
                  </div>
                  <FormControl>
                    <textarea
                      className="flex min-h-[80px] w-full rounded-md border border-input border-l-4 border-l-gray-300 dark:border-l-gray-600 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Internal notes..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSingleDay}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setIsSingleDay(checked)
                    if (checked) {
                      // Sync end_date to start_date
                      const startDate = form.getValues('start_date')
                      if (startDate) {
                        form.setValue('end_date', startDate)
                      }
                    }
                  }}
                  className="rounded border-input"
                />
                Single-day event
              </label>

              {isSingleDay ? (
                <FormField
                  control={form.control}
                  name="start_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          value={field.value}
                          onChange={(e) => {
                            field.onChange(e)
                            form.setValue('end_date', e.target.value)
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
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
