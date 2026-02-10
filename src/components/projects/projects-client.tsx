'use client'

import { useState, useEffect, Fragment } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/ui/empty-state'
import { ProjectFormDialog } from './project-form-dialog'
import { DeleteProjectDialog } from './delete-project-dialog'
import { ServiceTypeDialog } from './service-type-dialog'
import { ServiceFormDialog } from './service-form-dialog'
import { DeleteServiceDialog } from './delete-service-dialog'
import { ProjectPositions } from './project-positions'
import { ProjectOffers } from './project-offers'
import { SubRequests } from './sub-requests'
import { ConflictsSummary } from './conflicts-summary'
import { SendGigDetailsDialog } from './send-gig-details-dialog'
import { detectConflicts } from './project-positions'
import type { PositionJoined, BookForImport } from './project-positions'
import type { MusicianForOffer } from './send-offer-dialog'
import type { Project, Service } from '@/types'
import { toast } from 'sonner'
import { AddressLink } from '@/components/ui/address-link'
import { ContextualTooltip } from '@/components/onboarding/contextual-tooltip'
import { TOOLTIP_DEFINITIONS } from '@/lib/tooltips'
import {
  PROJECT_STATUS_LABELS,
  SERVICE_TYPE_LABELS,
  type ProjectStatus,
  type ServiceType,
} from '@/lib/validations/projects'

export type ProjectWithServices = Project & {
  services: Service[]
  project_positions: PositionJoined[]
}

interface ProjectsClientProps {
  projects: ProjectWithServices[]
  books: BookForImport[]
  musicians: MusicianForOffer[]
  organizationId: string
  organizationName: string
  timezone: string
  userRole: string
  userId?: string
  dismissedTooltips?: string[]
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  )
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  const colors: Record<ProjectStatus, string> = {
    draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    active: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
    completed: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${colors[status]}`}>
      {PROJECT_STATUS_LABELS[status]}
    </span>
  )
}

function formatDateRange(start: string | null, end: string | null): string {
  // Append T12:00:00 to date strings to avoid timezone shifting issues
  // (date-only strings are interpreted as midnight UTC, which shifts back a day in US timezones)
  const parseDate = (d: string) => new Date(d + 'T12:00:00')

  if (!start && !end) return '—'
  if (start && !end) return parseDate(start).toLocaleDateString()
  if (!start && end) return `until ${parseDate(end).toLocaleDateString()}`
  if (start === end) return parseDate(start!).toLocaleDateString()
  return `${parseDate(start!).toLocaleDateString()} – ${parseDate(end!).toLocaleDateString()}`
}

function ServicesList({
  services,
  projectId,
  canManage,
  onAddService,
  onEditService,
  onDeleteService,
}: {
  services: Service[]
  projectId: string
  canManage: boolean
  onAddService: (projectId: string) => void
  onEditService: (projectId: string, service: Service) => void
  onDeleteService: (service: Service) => void
}) {
  const sorted = [...services].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Services</h4>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => onAddService(projectId)}>
            Add Service
          </Button>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No services yet. Add rehearsals and performances to this project — these are the events your musicians need to attend.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-xs">Name</th>
                <th className="px-3 py-2 text-left font-medium text-xs">Type</th>
                <th className="px-3 py-2 text-left font-medium text-xs">Call Time</th>
                <th className="px-3 py-2 text-left font-medium text-xs">Date/Time</th>
                <th className="px-3 py-2 text-left font-medium text-xs">Venue</th>
                {canManage && (
                  <th className="px-3 py-2 text-right font-medium text-xs">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((service) => (
                <tr key={service.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2">{service.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {SERVICE_TYPE_LABELS[service.service_type as ServiceType] || service.service_type}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {service.call_time
                      ? new Date(service.call_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(service.start_time).toLocaleDateString()} {new Date(service.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    {service.end_time && ` – ${new Date(service.end_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {service.venue ? (
                      <AddressLink address={service.venue} className="text-sm" />
                    ) : (
                      '—'
                    )}
                  </td>
                  {canManage && (
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEditService(projectId, service)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => onDeleteService(service)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function ProjectsClient({
  projects,
  books,
  musicians,
  organizationId,
  organizationName,
  timezone,
  userRole,
  userId,
  dismissedTooltips = [],
}: ProjectsClientProps) {
  const router = useRouter()

  // Project dialog state
  const [projectFormOpen, setProjectFormOpen] = useState(false)
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<ProjectWithServices | null>(null)
  const [deletingProject, setDeletingProject] = useState<ProjectWithServices | null>(null)

  // Service dialog state
  const [serviceTypeOpen, setServiceTypeOpen] = useState(false)
  const [serviceFormOpen, setServiceFormOpen] = useState(false)
  const [deleteServiceOpen, setDeleteServiceOpen] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [deletingService, setDeletingService] = useState<Service | null>(null)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [activeProjectDates, setActiveProjectDates] = useState<{ start: string | null; end: string | null }>({ start: null, end: null })
  const [selectedServiceType, setSelectedServiceType] = useState<'rehearsal' | 'performance'>('rehearsal')

  // Expandable row state
  const searchParams = useSearchParams()
  const expandProjectId = searchParams.get('expand')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => {
    // Initialize with the project ID from query param if present
    if (expandProjectId) {
      return new Set([expandProjectId])
    }
    return new Set()
  })

  // Auto-expand and scroll to project from URL query param
  useEffect(() => {
    if (expandProjectId) {
      if (!expandedRows.has(expandProjectId)) {
        setExpandedRows((prev) => new Set([...prev, expandProjectId]))
      }
      // Scroll to the project row after a brief delay for render
      setTimeout(() => {
        const element = document.getElementById(`project-${expandProjectId}`)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 100)
    }
  }, [expandProjectId])

  // Gig details dialog state
  const [gigDetailsOpen, setGigDetailsOpen] = useState(false)
  const [gigDetailsProject, setGigDetailsProject] = useState<ProjectWithServices | null>(null)

  // Filter state
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const canManage = userRole === 'owner' || userRole === 'admin'

  const hasFilters = search !== '' || statusFilter !== ''

  const filteredProjects = projects.filter((p) => {
    if (search) {
      const q = search.toLowerCase()
      if (!p.name.toLowerCase().includes(q)) return false
    }
    if (statusFilter && p.status !== statusFilter) return false
    return true
  })

  function toggleRow(projectId: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  // Project handlers
  function handleAddProject() {
    setEditingProject(null)
    setProjectFormOpen(true)
  }
  function handleEditProject(project: ProjectWithServices) {
    setEditingProject(project)
    setProjectFormOpen(true)
  }
  function handleDeleteProject(project: ProjectWithServices) {
    setDeletingProject(project)
    setDeleteProjectOpen(true)
  }

  // Service handlers
  function handleAddService(projectId: string) {
    const project = projects.find(p => p.id === projectId)
    setActiveProjectId(projectId)
    setActiveProjectDates({
      start: project?.start_date || null,
      end: project?.end_date || null,
    })
    setEditingService(null)
    setServiceTypeOpen(true)
  }

  function handleServiceTypeSelect(type: 'rehearsal' | 'performance') {
    setSelectedServiceType(type)
    setServiceTypeOpen(false)
    setServiceFormOpen(true)
  }
  function handleEditService(projectId: string, service: Service) {
    setActiveProjectId(projectId)
    setEditingService(service)
    setServiceFormOpen(true)
  }
  function handleDeleteService(service: Service) {
    setDeletingService(service)
    setDeleteServiceOpen(true)
  }

  function handleSuccess() {
    setProjectFormOpen(false)
    setDeleteProjectOpen(false)
    setServiceTypeOpen(false)
    setServiceFormOpen(false)
    setDeleteServiceOpen(false)
    setEditingProject(null)
    setDeletingProject(null)
    setEditingService(null)
    setDeletingService(null)
    setActiveProjectId(null)
    setActiveProjectDates({ start: null, end: null })
    router.refresh()
  }

  async function handleProjectSuccess(newProject?: { id: string; start_date: string | null; end_date: string | null; template?: string; callTime?: string; startTime?: string; endTime?: string; venueName?: string; venueId?: string | null }) {
    setProjectFormOpen(false)
    setEditingProject(null)

    // Celebrate first project created
    if (newProject && projects.length === 0) {
      toast.success('Your first project is created!')
    }

    // Auto-create services and positions based on template
    if (newProject?.template) {
      const supabase = (await import('@/lib/supabase/client')).createClient()

      const venueFields = {
        ...(newProject.venueName ? { venue: newProject.venueName } : {}),
        ...(newProject.venueId ? { venue_id: newProject.venueId } : {}),
      }

      if (newProject.template === 'string-quartet') {
        // Performance only — most gigs are straight performances
        const dateStr = newProject.start_date || newProject.end_date
        if (dateStr) {
          const ct = newProject.callTime || '18:30'
          const st = newProject.startTime || '19:00'
          const et = newProject.endTime || '22:00'
          await supabase.from('services').insert({
            project_id: newProject.id,
            name: 'Performance',
            service_type: 'performance',
            start_time: new Date(`${dateStr}T${st}:00`).toISOString(),
            end_time: new Date(`${dateStr}T${et}:00`).toISOString(),
            call_time: new Date(`${dateStr}T${ct}:00`).toISOString(),
            ...venueFields,
          })
        }

        // Create quartet positions: Violin 1, Violin 2, Viola, Cello
        const { data: orgInstruments } = await supabase
          .from('instruments')
          .select('id, name')
          .eq('organization_id', organizationId)
          .in('name', ['Violin 1', 'Violin 2', 'Viola', 'Cello'])

        if (orgInstruments && orgInstruments.length > 0) {
          // Deduplicate by name (org may have duplicate instrument entries)
          const uniqueByName = new Map<string, typeof orgInstruments[0]>()
          for (const inst of orgInstruments) {
            if (!uniqueByName.has(inst.name)) uniqueByName.set(inst.name, inst)
          }
          await supabase.from('project_positions').insert(
            Array.from(uniqueByName.values()).map((inst) => ({
              project_id: newProject.id,
              instrument_id: inst.id,
              chair_number: 1,
              status: 'vacant',
            }))
          )
        }
      } else if (newProject.template === 'string-trio') {
        // Performance only
        const dateStr = newProject.start_date || newProject.end_date
        if (dateStr) {
          const ct = newProject.callTime || '18:30'
          const st = newProject.startTime || '19:00'
          const et = newProject.endTime || '22:00'
          await supabase.from('services').insert({
            project_id: newProject.id,
            name: 'Performance',
            service_type: 'performance',
            start_time: new Date(`${dateStr}T${st}:00`).toISOString(),
            end_time: new Date(`${dateStr}T${et}:00`).toISOString(),
            call_time: new Date(`${dateStr}T${ct}:00`).toISOString(),
            ...venueFields,
          })
        }

        // Create trio positions: Violin 1, Violin 2, Cello
        const { data: trioInstruments } = await supabase
          .from('instruments')
          .select('id, name')
          .eq('organization_id', organizationId)
          .in('name', ['Violin 1', 'Violin 2', 'Cello'])

        if (trioInstruments && trioInstruments.length > 0) {
          const uniqueByName = new Map<string, typeof trioInstruments[0]>()
          for (const inst of trioInstruments) {
            if (!uniqueByName.has(inst.name)) uniqueByName.set(inst.name, inst)
          }
          await supabase.from('project_positions').insert(
            Array.from(uniqueByName.values()).map((inst) => ({
              project_id: newProject.id,
              instrument_id: inst.id,
              chair_number: 1,
              status: 'vacant',
            }))
          )
        }
      } else if (newProject.template === 'duo') {
        // Performance only
        const dateStr = newProject.start_date || newProject.end_date
        if (dateStr) {
          const ct = newProject.callTime || '18:30'
          const st = newProject.startTime || '19:00'
          const et = newProject.endTime || '22:00'
          await supabase.from('services').insert({
            project_id: newProject.id,
            name: 'Performance',
            service_type: 'performance',
            start_time: new Date(`${dateStr}T${st}:00`).toISOString(),
            end_time: new Date(`${dateStr}T${et}:00`).toISOString(),
            call_time: new Date(`${dateStr}T${ct}:00`).toISOString(),
            ...venueFields,
          })
        }

        // Create duo positions: Violin 1, Cello
        const { data: duoInstruments } = await supabase
          .from('instruments')
          .select('id, name')
          .eq('organization_id', organizationId)
          .in('name', ['Violin 1', 'Cello'])

        if (duoInstruments && duoInstruments.length > 0) {
          const uniqueByName = new Map<string, typeof duoInstruments[0]>()
          for (const inst of duoInstruments) {
            if (!uniqueByName.has(inst.name)) uniqueByName.set(inst.name, inst)
          }
          await supabase.from('project_positions').insert(
            Array.from(uniqueByName.values()).map((inst) => ({
              project_id: newProject.id,
              instrument_id: inst.id,
              chair_number: 1,
              status: 'vacant',
            }))
          )
        }
      } else if (newProject.template === 'solo') {
        // Performance only — no positions created, admin picks the instrument
        const dateStr = newProject.start_date || newProject.end_date
        if (dateStr) {
          const ct = newProject.callTime || '18:30'
          const st = newProject.startTime || '19:00'
          const et = newProject.endTime || '22:00'
          await supabase.from('services').insert({
            project_id: newProject.id,
            name: 'Performance',
            service_type: 'performance',
            start_time: new Date(`${dateStr}T${st}:00`).toISOString(),
            end_time: new Date(`${dateStr}T${et}:00`).toISOString(),
            call_time: new Date(`${dateStr}T${ct}:00`).toISOString(),
            ...venueFields,
          })
        }
      } else if (newProject.template === 'orchestra') {
        // 2 rehearsals + 1 performance
        const dateStr = newProject.start_date || newProject.end_date
        if (dateStr) {
          await supabase.from('services').insert([
            {
              project_id: newProject.id,
              name: 'Rehearsal 1',
              service_type: 'rehearsal',
              start_time: new Date(dateStr + 'T10:00:00').toISOString(),
              end_time: new Date(dateStr + 'T13:00:00').toISOString(),
              call_time: new Date(dateStr + 'T09:30:00').toISOString(),
              ...venueFields,
            },
            {
              project_id: newProject.id,
              name: 'Dress Rehearsal',
              service_type: 'rehearsal',
              start_time: new Date(dateStr + 'T10:00:00').toISOString(),
              end_time: new Date(dateStr + 'T13:00:00').toISOString(),
              call_time: new Date(dateStr + 'T09:30:00').toISOString(),
              ...venueFields,
            },
            {
              project_id: newProject.id,
              name: 'Performance',
              service_type: 'performance',
              start_time: new Date(dateStr + 'T19:00:00').toISOString(),
              end_time: new Date(dateStr + 'T22:00:00').toISOString(),
              call_time: new Date(dateStr + 'T18:30:00').toISOString(),
              ...venueFields,
            },
          ])
        }
      } else if (newProject.template === 'custom') {
        // Auto-create a performance with default times
        const dateStr = newProject.start_date || newProject.end_date
        if (dateStr) {
          await supabase.from('services').insert({
            project_id: newProject.id,
            name: 'Performance',
            service_type: 'performance',
            start_time: new Date(dateStr + 'T19:00:00').toISOString(),
            end_time: new Date(dateStr + 'T22:00:00').toISOString(),
            call_time: new Date(dateStr + 'T18:30:00').toISOString(),
            ...venueFields,
          })
        }
      }
    }

    router.refresh()

    // If a new project was created, auto-expand and prompt to add a service (unless template already created services)
    if (newProject) {
      // Auto-expand the new project
      setExpandedRows((prev) => new Set([...prev, newProject.id]))

      // Only prompt service type dialog if no template was used
      if (!newProject.template) {
        setActiveProjectId(newProject.id)
        setActiveProjectDates({
          start: newProject.start_date,
          end: newProject.end_date,
        })
        setEditingService(null)
        setServiceTypeOpen(true)
      }
    }
  }

  const colCount = canManage ? 7 : 6

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="page-header">
          <h2 className="text-3xl font-bold tracking-tight">Projects</h2>
          <p className="text-muted-foreground mt-1">
            Manage your projects and their services.
          </p>
          <div className="mt-3 w-12 h-px bg-gold/50" />
        </div>
        {canManage && (
          <Button onClick={handleAddProject}>Add Project</Button>
        )}
      </div>

      <Separator />

      <ContextualTooltip
        tooltipId="projects"
        text={TOOLTIP_DEFINITIONS.projects}
        userId={userId}
        organizationId={organizationId}
        dismissedTooltips={dismissedTooltips}
      />

      <ContextualTooltip
        tooltipId="workflow"
        text={TOOLTIP_DEFINITIONS.workflow}
        userId={userId}
        organizationId={organizationId}
        dismissedTooltips={dismissedTooltips}
      />

      {projects.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search projects..."
            className="rounded-md border bg-background px-3 py-2 text-sm w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(''); setStatusFilter('') }}
            >
              Clear
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {filteredProjects.length} of {projects.length} projects
          </span>
        </div>
      )}

      {projects.length === 0 ? (
        <EmptyState
          icon={
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
            </svg>
          }
          title="No projects yet"
          description="Create your first project to start managing rehearsals, performances, and musicians."
          action={canManage ? <Button onClick={handleAddProject}>Add Your First Project</Button> : undefined}
        />
      ) : filteredProjects.length === 0 ? (
        <EmptyState title="No projects match your filters" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="w-10 px-2 py-3"></th>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Dates</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Services</th>
                {canManage && (
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredProjects.map((project) => {
                const isExpanded = expandedRows.has(project.id)
                return (
                  <Fragment key={project.id}>
                    <tr
                      id={`project-${project.id}`}
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => toggleRow(project.id)}
                    >
                      <td className="px-2 py-3 text-center">
                        <ChevronIcon expanded={isExpanded} />
                      </td>
                      <td className="px-4 py-3 font-medium">{project.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDateRange(project.start_date, project.end_date)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={project.status} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {project.services.length}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <div
                            className="flex items-center justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditProject(project)}
                            >
                              Edit Details
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteProject(project)}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={colCount} className="bg-muted/20 px-4 py-4 space-y-6">
                          <ServicesList
                            services={project.services}
                            projectId={project.id}
                            canManage={canManage}
                            onAddService={handleAddService}
                            onEditService={handleEditService}
                            onDeleteService={handleDeleteService}
                          />
                          <ProjectPositions
                            positions={project.project_positions}
                            projectId={project.id}
                            organizationId={organizationId}
                            books={books}
                            musicians={musicians}
                            services={project.services}
                            canManage={canManage}
                            onPositionChange={handleSuccess}
                          />
                          <ProjectOffers
                            offers={project.project_positions.flatMap((p) =>
                              (p.contract_offers || []).map((o) => ({
                                ...o,
                                project_position_id: p.id,
                                position_instrument: p.instrument?.name ?? '',
                                position_chair: p.chair_number,
                              }))
                            )}
                            organizationName={organizationName}
                            canManage={canManage}
                            onOfferChange={handleSuccess}
                          />
                          <SubRequests
                            requests={project.project_positions.flatMap((p) =>
                              (p.substitution_requests || []).map((r) => ({
                                ...r,
                                project_position_id: p.id,
                                position_instrument: p.instrument?.name ?? '',
                                position_chair: p.chair_number,
                                position_instrument_id: p.instrument_id,
                              }))
                            )}
                            canManage={canManage}
                            onRequestChange={handleSuccess}
                          />
                          <ConflictsSummary
                            conflicts={detectConflicts(project.project_positions, musicians, project.services)}
                          />
                          {/* Send Gig Details */}
                          {canManage && project.project_positions.length > 0 && project.project_positions.every((p) => p.status === 'confirmed') && (
                            <div className="flex items-center gap-3 pt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setGigDetailsProject(project)
                                  setGigDetailsOpen(true)
                                }}
                              >
                                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                                </svg>
                                Send Gig Details
                              </Button>
                              {(() => {
                                const phones = project.project_positions
                                  .filter((p) => p.status === 'confirmed' && p.musician?.phone)
                                  .map((p) => p.musician!.phone!.replace(/\D/g, ''))
                                  .filter((p) => p.length >= 10)
                                if (phones.length === 0) return null
                                const smsUri = `sms:${phones.join(',')}`
                                return (
                                  <a href={smsUri}>
                                    <Button variant="outline" size="sm" type="button">
                                      <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                                      </svg>
                                      Group Text ({phones.length})
                                    </Button>
                                  </a>
                                )
                              })()}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ProjectFormDialog
        open={projectFormOpen}
        onOpenChange={setProjectFormOpen}
        project={editingProject}
        organizationId={organizationId}
        isFirstProject={projects.length === 0 && !editingProject}
        onSuccess={handleProjectSuccess}
      />

      <DeleteProjectDialog
        open={deleteProjectOpen}
        onOpenChange={setDeleteProjectOpen}
        project={deletingProject}
        onSuccess={handleSuccess}
      />

      <ServiceTypeDialog
        open={serviceTypeOpen}
        onOpenChange={setServiceTypeOpen}
        onSelect={handleServiceTypeSelect}
      />

      <ServiceFormDialog
        open={serviceFormOpen}
        onOpenChange={setServiceFormOpen}
        service={editingService}
        projectId={activeProjectId}
        projectStartDate={activeProjectDates.start || projects.find(p => p.id === activeProjectId)?.start_date}
        projectEndDate={activeProjectDates.end || projects.find(p => p.id === activeProjectId)?.end_date}
        organizationId={organizationId}
        timezone={timezone}
        initialServiceType={editingService ? undefined : selectedServiceType}
        existingServiceCounts={(() => {
          const p = projects.find(proj => proj.id === activeProjectId)
          if (!p) return { rehearsal: 0, performance: 0 }
          return {
            rehearsal: p.services.filter(s => s.service_type === 'rehearsal').length,
            performance: p.services.filter(s => s.service_type === 'performance').length,
          }
        })()}
        onSuccess={handleSuccess}
      />

      <DeleteServiceDialog
        open={deleteServiceOpen}
        onOpenChange={setDeleteServiceOpen}
        service={deletingService}
        onSuccess={handleSuccess}
      />

      {gigDetailsProject && (
        <SendGigDetailsDialog
          open={gigDetailsOpen}
          onOpenChange={setGigDetailsOpen}
          projectId={gigDetailsProject.id}
          projectName={gigDetailsProject.name}
          positions={gigDetailsProject.project_positions}
          services={gigDetailsProject.services}
          organizationId={organizationId}
          timezone={timezone}
        />
      )}
    </div>
  )
}
