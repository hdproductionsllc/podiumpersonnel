'use client'

import { useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ProjectFormDialog } from './project-form-dialog'
import { DeleteProjectDialog } from './delete-project-dialog'
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
  userRole: string
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
  if (!start && !end) return '—'
  if (start && !end) return new Date(start).toLocaleDateString()
  if (!start && end) return `until ${new Date(end).toLocaleDateString()}`
  return `${new Date(start!).toLocaleDateString()} – ${new Date(end!).toLocaleDateString()}`
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
  userRole,
}: ProjectsClientProps) {
  const router = useRouter()

  // Project dialog state
  const [projectFormOpen, setProjectFormOpen] = useState(false)
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<ProjectWithServices | null>(null)
  const [deletingProject, setDeletingProject] = useState<ProjectWithServices | null>(null)

  // Service dialog state
  const [serviceFormOpen, setServiceFormOpen] = useState(false)
  const [deleteServiceOpen, setDeleteServiceOpen] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [deletingService, setDeletingService] = useState<Service | null>(null)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)

  // Expandable row state
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const canManage = userRole === 'owner' || userRole === 'admin'

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
    setActiveProjectId(projectId)
    setEditingService(null)
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
    setServiceFormOpen(false)
    setDeleteServiceOpen(false)
    setEditingProject(null)
    setDeletingProject(null)
    setEditingService(null)
    setDeletingService(null)
    setActiveProjectId(null)
    router.refresh()
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

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground mb-4">
            No projects have been added yet.
          </p>
          {canManage && (
            <Button onClick={handleAddProject}>Add Your First Project</Button>
          )}
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
              {projects.map((project) => {
                const isExpanded = expandedRows.has(project.id)
                return (
                  <Fragment key={project.id}>
                    <tr
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
                            musicians={musicians}
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
        onSuccess={handleSuccess}
      />

      <DeleteProjectDialog
        open={deleteProjectOpen}
        onOpenChange={setDeleteProjectOpen}
        project={deletingProject}
        onSuccess={handleSuccess}
      />

      <ServiceFormDialog
        open={serviceFormOpen}
        onOpenChange={setServiceFormOpen}
        service={editingService}
        projectId={activeProjectId}
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
