'use client'

import { useState, useEffect, Fragment } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ProjectFormDialog } from './project-form-dialog'
import { DeleteProjectDialog } from './delete-project-dialog'
import { ServiceTypeDialog } from './service-type-dialog'
import { ServiceFormDialog } from './service-form-dialog'
import { DeleteServiceDialog } from './delete-service-dialog'
import { ProjectPositions } from './project-positions'
import { ProjectOffers } from './project-offers'
import { SubRequests } from './sub-requests'
import { ConflictsSummary } from './conflicts-summary'
import { detectConflicts } from './project-positions'
import type { PositionJoined, BookForImport } from './project-positions'
import type { MusicianForOffer } from './send-offer-dialog'
import type { Project, Service } from '@/types'
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
    draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    active: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
    completed: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    cancelled: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
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
        <p className="text-sm text-muted-foreground py-2">No services yet.</p>
      ) : (
        <div className="rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-xs">Name</th>
                <th className="px-3 py-2 text-left font-medium text-xs">Type</th>
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
                    {new Date(service.start_time).toLocaleString()}
                    {service.end_time && ` – ${new Date(service.end_time).toLocaleTimeString()}`}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {service.venue || '—'}
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

  function handleProjectSuccess(newProject?: { id: string; start_date: string | null; end_date: string | null }) {
    setProjectFormOpen(false)
    setEditingProject(null)
    router.refresh()

    // If a new project was created, prompt to add a service
    if (newProject) {
      setActiveProjectId(newProject.id)
      setActiveProjectDates({
        start: newProject.start_date,
        end: newProject.end_date,
      })
      setEditingService(null)
      setServiceTypeOpen(true)
    }
  }

  const colCount = canManage ? 6 : 5

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Projects</h2>
          <p className="text-muted-foreground">
            Manage your orchestra projects and their services.
          </p>
        </div>
        {canManage && (
          <Button onClick={handleAddProject}>Add Project</Button>
        )}
      </div>

      <Separator />

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
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground mb-4">
            No projects have been added yet.
          </p>
          {canManage && (
            <Button onClick={handleAddProject}>Add Your First Project</Button>
          )}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">No projects match your filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
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
                              Edit
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
        onSuccess={handleSuccess}
      />

      <DeleteServiceDialog
        open={deleteServiceOpen}
        onOpenChange={setDeleteServiceOpen}
        service={deletingService}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
