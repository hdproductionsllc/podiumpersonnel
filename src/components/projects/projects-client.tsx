'use client'

import { useState, useEffect, Fragment } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/ui/empty-state'
import { fromZonedTime } from 'date-fns-tz/fromZonedTime'
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
import { GroupTextDialog } from './group-text-dialog'
import { ApproveReminderDialog } from './approve-reminder-dialog'
import { ProjectFilesSection } from './project-files-section'
import { IntakePanel } from '@/components/intake/intake-panel'
import { detectConflicts } from './project-positions'
import type { PositionJoined, BookForImport, AutoCascadeSwitches } from './project-positions'
import { chairFirstCalls, type CallScopeView } from '@/lib/staffing/requirement-rules'
import type { MusicianForOffer } from './send-offer-dialog'
import type { Project, Service } from '@/types'
import { toast } from 'sonner'
import { AddressLink } from '@/components/ui/address-link'
import { getVenueMapsUrl, getVenueDisplay, type ServiceWithVenue } from '@/lib/venue-helpers'
import { ContextualTooltip } from '@/components/onboarding/contextual-tooltip'
import { TOOLTIP_DEFINITIONS } from '@/lib/tooltips'
import {
  PROJECT_STATUS_LABELS,
  SERVICE_TYPE_LABELS,
  type ProjectStatus,
  type ServiceType,
} from '@/lib/validations/projects'
import { usePlan } from '@/components/providers/plan-provider'
import { useOrgFlags } from '@/components/providers/org-flags-provider'
import { useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'
import { canCreateProject, canUseEmailFeatures, PLAN_LIMITS } from '@/lib/plan'
import { UpgradePrompt } from '@/components/billing/upgrade-prompt'
import { GigReportPanel, type GigReportRow } from '@/components/projects/gig-report-panel'
import { localDate } from '@/lib/projects/archive'
import { isLiveOffer } from '@/lib/staffing/live'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type ProjectWithServices = Project & {
  services: ServiceWithVenue[]
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
  gigReports?: GigReportRow[]
  /** The auto-offer switches (096); null when they could not be read. */
  autoCascade?: AutoCascadeSwitches | null
  /**
   * Chairs' calls and requirements (098/099), only for an organization with
   * call_scoped_requirements on; null everywhere else, and nothing about calls
   * or requirements is shown.
   */
  callScope?: CallScopeView | null
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

/**
 * "Sat, Oct 11" (year only when it is not this year), and for a range
 * "Sat, Oct 11 – Sun, Oct 12". Date-only strings get T12:00 so a US time zone
 * never shifts them back a day.
 */
function formatGigDates(start: string | null, end: string | null): string {
  const parse = (d: string) => new Date(d + 'T12:00:00')
  const thisYear = new Date().getFullYear()
  const fmt = (d: string) => {
    const date = parse(d)
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(date.getFullYear() !== thisYear ? { year: 'numeric' } : {}),
    })
  }
  if (!start && !end) return '—'
  if (start && (!end || start === end)) return fmt(start)
  if (!start && end) return `until ${fmt(end)}`
  return `${fmt(start!)} – ${fmt(end!)}`
}

/** "today", "tomorrow", "in 12 days", "3 days ago", counted in the org's time zone. */
function relativeDays(date: string | null, timeZone: string): string | null {
  if (!date) return null
  const today = localDate(new Date(), timeZone)
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days > 1 && days <= 60) return `in ${days} days`
  if (days < -1 && days >= -60) return `${-days} days ago`
  return null
}

/** Music / Parts has something in it: a file (e.g. a book from Prepare Gig Music) or a past send. */
function hasMusic(project: ProjectWithServices): boolean {
  const p = project as ProjectWithServices & { project_files?: unknown[]; music_sends?: unknown[] }
  return (p.project_files?.length ?? 0) > 0 || (p.music_sends?.length ?? 0) > 0
}

const SECTION_ACCENTS = {
  schedule: 'border-l-slate-400',
  staffing: 'border-l-blue-500',
  music: 'border-l-violet-500',
  send: 'border-l-teal-500',
  after: 'border-l-amber-500',
} as const

/** One block of the opened gig: a white card with a colored stripe, optionally titled. */
function GigSection({ title, hint, accent, children }: {
  title?: string
  hint?: string
  accent: keyof typeof SECTION_ACCENTS
  children: React.ReactNode
}) {
  return (
    <section className={`rounded-lg border border-l-4 ${SECTION_ACCENTS[accent]} bg-card p-4 shadow-sm space-y-4`}>
      {title && (
        <div>
          <h4 className="text-sm font-semibold">{title}</h4>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      )}
      {children}
    </section>
  )
}

/**
 * Chairs that still need someone: vacant or declined, with no offer out that
 * is still waiting on an answer. Next-in-line suggestions only appear for these.
 */
function openChairIds(positions: PositionJoined[]): string[] {
  const now = new Date()
  return positions
    .filter((p) => p.status === 'vacant' || p.status === 'declined')
    .filter((p) => !(p.contract_offers || []).some((o) => isLiveOffer(o, now)))
    .map((p) => p.id)
}

/** The project's first call (ISO), for the date in a "Text from my phone" message. */
function firstServiceStart(services: { start_time: string }[] | null | undefined): string | null {
  const starts = (services || []).map((s) => s.start_time).filter(Boolean)
  if (starts.length === 0) return null
  return starts.reduce((a, b) => (new Date(a).getTime() <= new Date(b).getTime() ? a : b))
}

function ServicesList({
  services,
  projectId,
  canManage,
  timezone,
  onAddService,
  onEditService,
  onDeleteService,
}: {
  services: ServiceWithVenue[]
  projectId: string
  canManage: boolean
  timezone: string
  onAddService: (projectId: string) => void
  onEditService: (projectId: string, service: Service) => void
  onDeleteService: (service: Service) => void
}) {
  const terms = useTerms()
  const sorted = [...services].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{term(terms, 'session', { plural: true })}</h4>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => onAddService(projectId)}>
            Add {term(terms, 'session')}
          </Button>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No {term(terms, 'session', { plural: true, case: 'lower' })} yet. Add rehearsals and performances to this {term(terms, 'work', { case: 'lower' })} — these are the events your {term(terms, 'person', { plural: true, case: 'lower' })} need to attend.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-xs">Name</th>
                <th className="hidden md:table-cell px-3 py-2 text-left font-medium text-xs">Type</th>
                <th className="hidden md:table-cell px-3 py-2 text-left font-medium text-xs">Call Time</th>
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
                  <td className="hidden md:table-cell px-3 py-2 text-muted-foreground">
                    {SERVICE_TYPE_LABELS[service.service_type as ServiceType] || service.service_type}
                  </td>
                  <td className="hidden md:table-cell px-3 py-2 text-muted-foreground">
                    {service.call_time
                      ? new Date(service.call_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone })
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(service.start_time).toLocaleDateString('en-US', { timeZone: timezone })} {new Date(service.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone })}
                    {service.end_time && ` – ${new Date(service.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone })}`}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {(() => {
                      const display = getVenueDisplay(service)
                      const venue2 = { venue: service.venue_2, venue_details: service.venue_2_details }
                      const display2 = getVenueDisplay(venue2)
                      if (!display) return '—'
                      return (
                        <div className="space-y-0.5">
                          <AddressLink
                            address={display}
                            googleMapsUrl={getVenueMapsUrl(service)}
                            className="text-sm"
                          />
                          {display2 && (
                            <AddressLink
                              address={display2}
                              googleMapsUrl={getVenueMapsUrl(venue2)}
                              className="text-sm"
                            />
                          )}
                        </div>
                      )
                    })()}
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
  gigReports = [],
  autoCascade = null,
  callScope = null,
}: ProjectsClientProps) {
  const router = useRouter()
  const plan = usePlan()
  const { intakeEnabled } = useOrgFlags()
  const terms = useTerms()

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
  // Gigs whose (empty) Music / Parts panel the admin opened to upload a file.
  const [filesOpen, setFilesOpen] = useState<Set<string>>(new Set())
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => {
    // URL query param takes priority
    if (expandProjectId) {
      return new Set([expandProjectId])
    }
    // Default: all collapsed
    return new Set()
  })

  // Auto-expand and scroll to project from URL query param
  useEffect(() => {
    if (expandProjectId) {
      if (!expandedRows.has(expandProjectId)) {
        setExpandedRows((prev) => {
          const next = new Set([...prev, expandProjectId])

          return next
        })
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
  const [groupTextOpen, setGroupTextOpen] = useState(false)
  const [groupTextProject, setGroupTextProject] = useState<ProjectWithServices | null>(null)

  // Pre-gig reminder approval dialog
  const reminderParam = searchParams.get('reminder')
  const [reminderDialogOpen, setReminderDialogOpen] = useState(!!reminderParam)
  const [reminderDialogId, setReminderDialogId] = useState<string | null>(reminderParam)

  // Open reminder dialog when URL param is present
  useEffect(() => {
    if (reminderParam) {
      setReminderDialogId(reminderParam)
      setReminderDialogOpen(true)
    }
  }, [reminderParam])

  // Waterfall trigger state — allows ProjectOffers to open SendOfferDialog via ProjectPositions
  const [waterfallTrigger, setWaterfallTrigger] = useState<{
    positionId: string
    /** Null when the admin chose "Someone else" and wants to pick for themselves. */
    musicianId: string | null
    customPay: number | null
    isFollowUp?: boolean
  } | null>(null)

  // Filter state
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const canManage = userRole === 'owner' || userRole === 'admin'

  const archivedStatuses = ['completed', 'cancelled']
  const archivedCount = projects.filter((p) => archivedStatuses.includes(p.status)).length

  const filteredProjects = projects.filter((p) => {
    if (search) {
      const q = search.toLowerCase()
      if (!p.name.toLowerCase().includes(q) && !(p.client_name || '').toLowerCase().includes(q)) return false
    }
    if (!showArchived && archivedStatuses.includes(p.status)) return false
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

  async function handleMarkComplete(project: ProjectWithServices) {
    const supabase = (await import('@/lib/supabase/client')).createClient()
    const { error } = await supabase
      .from('projects')
      .update({ status: 'completed' })
      .eq('id', project.id)
    if (error) {
      toast.error(`Failed to mark ${term(terms, 'work', { case: 'lower' })} as completed`)
      return
    }
    toast.success(`"${project.name}" marked as completed`)
    router.refresh()
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

  async function handleProjectSuccess(newProject?: { id: string; name: string; start_date: string | null; end_date: string | null; template?: string; callTime?: string; startTime?: string; endTime?: string; venueName?: string; venueId?: string | null }) {
    setProjectFormOpen(false)
    setEditingProject(null)

    // Celebrate first project created
    if (newProject && projects.length === 0) {
      toast.success(`Your first ${term(terms, 'work', { case: 'lower' })} is created!`)
    }

    // Auto-create services and positions based on template
    if (newProject?.template) {
      const supabase = (await import('@/lib/supabase/client')).createClient()
      const toISO = (date: string, time: string) => fromZonedTime(`${date}T${time}`, timezone).toISOString()

      // These writes happen after the project row already exists, so a failure
      // leaves a project with nothing under it. Remember what failed and tell
      // the admin once at the end instead of silently showing an empty project.
      const templateFailures = new Set<'services' | 'positions'>()
      const trackTemplateWrite = (what: 'services' | 'positions', result: { error: { message: string } | null }) => {
        if (result.error) {
          console.error(`Failed to add template ${what}:`, result.error)
          templateFailures.add(what)
        }
      }

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
          trackTemplateWrite('services', await supabase.from('services').insert({
            project_id: newProject.id,
            name: `${newProject.name} Performance`,
            service_type: 'performance',
            start_time: toISO(dateStr, st),
            end_time: toISO(dateStr, et),
            call_time: toISO(dateStr, ct),
            ...venueFields,
          }))
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
          trackTemplateWrite('positions', await supabase.from('project_positions').insert(
            Array.from(uniqueByName.values()).map((inst) => ({
              project_id: newProject.id,
              instrument_id: inst.id,
              chair_number: 1,
              status: 'vacant',
            }))
          ))
        }
      } else if (newProject.template === 'string-trio') {
        // Performance only
        const dateStr = newProject.start_date || newProject.end_date
        if (dateStr) {
          const ct = newProject.callTime || '18:30'
          const st = newProject.startTime || '19:00'
          const et = newProject.endTime || '22:00'
          trackTemplateWrite('services', await supabase.from('services').insert({
            project_id: newProject.id,
            name: `${newProject.name} Performance`,
            service_type: 'performance',
            start_time: toISO(dateStr, st),
            end_time: toISO(dateStr, et),
            call_time: toISO(dateStr, ct),
            ...venueFields,
          }))
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
          trackTemplateWrite('positions', await supabase.from('project_positions').insert(
            Array.from(uniqueByName.values()).map((inst) => ({
              project_id: newProject.id,
              instrument_id: inst.id,
              chair_number: 1,
              status: 'vacant',
            }))
          ))
        }
      } else if (newProject.template === 'duo') {
        // Performance only
        const dateStr = newProject.start_date || newProject.end_date
        if (dateStr) {
          const ct = newProject.callTime || '18:30'
          const st = newProject.startTime || '19:00'
          const et = newProject.endTime || '22:00'
          trackTemplateWrite('services', await supabase.from('services').insert({
            project_id: newProject.id,
            name: `${newProject.name} Performance`,
            service_type: 'performance',
            start_time: toISO(dateStr, st),
            end_time: toISO(dateStr, et),
            call_time: toISO(dateStr, ct),
            ...venueFields,
          }))
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
          trackTemplateWrite('positions', await supabase.from('project_positions').insert(
            Array.from(uniqueByName.values()).map((inst) => ({
              project_id: newProject.id,
              instrument_id: inst.id,
              chair_number: 1,
              status: 'vacant',
            }))
          ))
        }
      } else if (newProject.template === 'solo') {
        // Performance only — no positions created, admin picks the instrument
        const dateStr = newProject.start_date || newProject.end_date
        if (dateStr) {
          const ct = newProject.callTime || '18:30'
          const st = newProject.startTime || '19:00'
          const et = newProject.endTime || '22:00'
          trackTemplateWrite('services', await supabase.from('services').insert({
            project_id: newProject.id,
            name: `${newProject.name} Performance`,
            service_type: 'performance',
            start_time: toISO(dateStr, st),
            end_time: toISO(dateStr, et),
            call_time: toISO(dateStr, ct),
            ...venueFields,
          }))
        }
      } else if (newProject.template === 'orchestra') {
        // 2 rehearsals + 1 performance
        const dateStr = newProject.start_date || newProject.end_date
        if (dateStr) {
          trackTemplateWrite('services', await supabase.from('services').insert([
            {
              project_id: newProject.id,
              name: `${newProject.name} Rehearsal 1`,
              service_type: 'rehearsal',
              start_time: toISO(dateStr, '10:00'),
              end_time: toISO(dateStr, '13:00'),
              call_time: toISO(dateStr, '09:30'),
              ...venueFields,
            },
            {
              project_id: newProject.id,
              name: `${newProject.name} Dress Rehearsal`,
              service_type: 'rehearsal',
              start_time: toISO(dateStr, '10:00'),
              end_time: toISO(dateStr, '13:00'),
              call_time: toISO(dateStr, '09:30'),
              ...venueFields,
            },
            {
              project_id: newProject.id,
              name: `${newProject.name} Performance`,
              service_type: 'performance',
              start_time: toISO(dateStr, '19:00'),
              end_time: toISO(dateStr, '22:00'),
              call_time: toISO(dateStr, '18:30'),
              ...venueFields,
            },
          ]))
        }
      } else if (newProject.template === 'custom') {
        // Auto-create a performance: default times, or the contract's own when
        // the gig came from a pasted contract whose ensemble has no template
        const dateStr = newProject.start_date || newProject.end_date
        if (dateStr) {
          trackTemplateWrite('services', await supabase.from('services').insert({
            project_id: newProject.id,
            name: `${newProject.name} Performance`,
            service_type: 'performance',
            start_time: toISO(dateStr, newProject.startTime || '19:00'),
            end_time: toISO(dateStr, newProject.endTime || '22:00'),
            call_time: toISO(dateStr, newProject.callTime || '18:30'),
            ...venueFields,
          }))
        }
      }

      if (templateFailures.size > 0) {
        const missing = Array.from(templateFailures)
          .map((what) => (what === 'services' ? term(terms, 'session', { plural: true, case: 'lower' }) : 'positions'))
          .join(' and ')
        toast.error(`${term(terms, 'work')} created, but its ${missing} could not be added. Open the ${term(terms, 'work', { case: 'lower' })} and add them.`)
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

  const colCount = canManage ? 6 : 5

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="page-header">
          <h2 className="text-3xl font-bold tracking-tight">{term(terms, 'work', { plural: true })}</h2>
          <p className="text-muted-foreground mt-1">
            Manage your {term(terms, 'work', { plural: true, case: 'lower' })} and their {term(terms, 'session', { plural: true, case: 'lower' })}.
          </p>
          <div className="mt-3 w-12 h-px bg-gold/50" />
        </div>
        {canManage && (
          (() => {
            const activeCount = projects.filter(p => p.status === 'active' || p.status === 'draft').length
            return canCreateProject(plan, activeCount) ? (
              <Button onClick={handleAddProject}>Add {term(terms, 'work')}</Button>
            ) : (
              <Button variant="outline" disabled title={`Free plan is limited to ${PLAN_LIMITS.free.activeProjects} active ${term(terms, 'work', { plural: true, case: 'lower' })}`}>
                Add {term(terms, 'work')} (Limit Reached)
              </Button>
            )
          })()
        )}
      </div>

      <Separator />

      {(() => {
        const activeCount = projects.filter(p => p.status === 'active' || p.status === 'draft').length
        return !canCreateProject(plan, activeCount) ? (
          <UpgradePrompt
            feature={`${term(terms, 'work')} Limit Reached`}
            description={`Free plan is limited to ${PLAN_LIMITS.free.activeProjects} active ${term(terms, 'work', { plural: true, case: 'lower' })}. Upgrade to Pro for unlimited ${term(terms, 'work', { plural: true, case: 'lower' })}.`}
            compact
          />
        ) : null
      })()}

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
            placeholder={`Search ${term(terms, 'work', { plural: true, case: 'lower' })}...`}
            className="rounded-md border bg-background px-3 py-2 text-sm w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {archivedCount > 0 && (
            <Button
              variant={showArchived ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setShowArchived(!showArchived)}
              className="gap-1.5"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
              </svg>
              {showArchived ? 'Hide Archived' : `Show Archived (${archivedCount})`}
            </Button>
          )}
          {search && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearch('')}
            >
              Clear
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {filteredProjects.length} {term(terms, 'work', { plural: filteredProjects.length !== 1, case: 'lower' })}
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
          title={`No ${term(terms, 'work', { plural: true, case: 'lower' })} yet`}
          description={`Create your first ${term(terms, 'work', { case: 'lower' })} to start managing rehearsals, performances, and ${term(terms, 'person', { plural: true, case: 'lower' })}.`}
          action={canManage ? <Button onClick={handleAddProject}>Add Your First {term(terms, 'work')}</Button> : undefined}
        />
      ) : filteredProjects.length === 0 ? (
        <EmptyState title={`No ${term(terms, 'work', { plural: true, case: 'lower' })} match your filters`} />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted text-xs font-semibold uppercase tracking-wide text-foreground/70">
              <tr>
                <th className="w-10 px-2 py-2.5"></th>
                <th className="px-3 py-2.5 text-left font-medium">{term(terms, 'work')}</th>
                <th className="px-3 py-2.5 text-left font-medium">When</th>
                <th className="px-3 py-2.5 text-left font-medium">Staffed</th>
                <th className="hidden md:table-cell px-3 py-2.5 text-right font-medium">Contract</th>
                {canManage && <th className="w-12 px-2 py-2.5"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredProjects.map((project) => {
                const isExpanded = expandedRows.has(project.id)
                const primary = project.services?.find((s) => s.service_type === 'performance') || project.services?.[0]
                const venue = primary ? getVenueDisplay(primary) : ''
                const venueName = venue ? venue.split(',')[0] : ''
                const confirmedCount = project.project_positions.filter((p) => p.status === 'confirmed').length
                const totalChairs = project.project_positions.length
                const fullyStaffed = totalChairs > 0 && confirmedCount === totalChairs
                const relative = relativeDays(project.start_date, timezone)
                const subline = [project.client_name, project.event_type, venueName].filter(Boolean).join(' · ')
                return (
                  <Fragment key={project.id}>
                    <tr
                      id={`project-${project.id}`}
                      className={`cursor-pointer transition-colors hover:bg-muted/60 ${isExpanded ? 'bg-muted' : 'bg-card'}`}
                      onClick={() => toggleRow(project.id)}
                    >
                      <td className="px-2 py-3.5 text-center align-top">
                        <ChevronIcon expanded={isExpanded} />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[15px] font-semibold leading-snug">{project.name}</span>
                          {project.status !== 'active' && <StatusBadge status={project.status} />}
                        </div>
                        {subline && (
                          <div className="mt-0.5 text-xs text-muted-foreground">{subline}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top whitespace-nowrap">
                        <div className="font-medium">{formatGigDates(project.start_date, project.end_date)}</div>
                        {relative && <div className="mt-0.5 text-xs text-muted-foreground">{relative}</div>}
                      </td>
                      <td className="px-3 py-3 align-top whitespace-nowrap">
                        {totalChairs > 0 ? (
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              fullyStaffed
                                ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                                : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${fullyStaffed ? 'bg-green-600' : 'bg-amber-600'}`} aria-hidden />
                            {confirmedCount}/{totalChairs}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="hidden md:table-cell px-3 py-3 align-top text-right whitespace-nowrap">
                        {project.contract_amount != null ? (
                          <>
                            <div className="font-medium tabular-nums">${Number(project.contract_amount).toLocaleString()}</div>
                            <div className="mt-0.5 text-xs">
                              {project.payment_status === 'fully_paid' ? (
                                <span className="text-green-700 dark:text-green-400">Paid in full</span>
                              ) : project.deposit_amount != null && project.deposit_paid_at ? (
                                <span className="text-green-700 dark:text-green-400">
                                  Deposit paid {new Date(project.deposit_paid_at + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              ) : project.deposit_amount != null ? (
                                <span className="text-amber-700 dark:text-amber-400">Deposit ${Number(project.deposit_amount).toLocaleString()} due</span>
                              ) : null}
                            </div>
                          </>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      {canManage && (
                        <td className="px-2 py-2.5 text-right align-top" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Actions for ${project.name}`}>
                                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                                  <circle cx="5" cy="12" r="1.75" /><circle cx="12" cy="12" r="1.75" /><circle cx="19" cy="12" r="1.75" />
                                </svg>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditProject(project)}>Edit</DropdownMenuItem>
                              {project.status === 'active' && (
                                <DropdownMenuItem onClick={() => handleMarkComplete(project)}>Mark complete</DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => handleDeleteProject(project)}
                              >
                                Delete…
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      )}
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={colCount} className="bg-muted px-3 py-4 sm:px-5 space-y-4 dark:bg-muted/40">
                          {/* The gig, top to bottom in the order the work happens. */}
                          <GigSection accent="schedule">
                            <ServicesList
                              services={project.services}
                              projectId={project.id}
                              canManage={canManage}
                              timezone={timezone}
                              onAddService={handleAddService}
                              onEditService={handleEditService}
                              onDeleteService={handleDeleteService}
                            />
                          </GigSection>
                          <GigSection accent="staffing">
                            <ProjectPositions
                              positions={project.project_positions}
                              projectId={project.id}
                              organizationId={organizationId}
                              books={books}
                              musicians={musicians}
                              services={project.services}
                              canManage={canManage}
                              timezone={timezone}
                              ensembleType={project.ensemble_type}
                              onPositionChange={handleSuccess}
                              waterfallTrigger={waterfallTrigger}
                              onWaterfallHandled={() => setWaterfallTrigger(null)}
                              autoCascade={autoCascade}
                              callScope={callScope}
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
                              timezone={timezone}
                              canManage={canManage}
                              onRequestChange={handleSuccess}
                            />
                            <ConflictsSummary
                              timezone={timezone}
                              conflicts={detectConflicts(project.project_positions, musicians, project.services, callScope)}
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
                              timezone={timezone}
                              canManage={canManage}
                              onOfferChange={handleSuccess}
                              openPositionIds={openChairIds(project.project_positions)}
                              projectName={project.name}
                              startsAt={firstServiceStart(project.services)}
                              startsAtByChair={callScope ? chairFirstCalls(project.project_positions, project.services, callScope) : undefined}
                              onSendWaterfall={(positionId, musicianId, customPay, isFollowUp) => {
                                setWaterfallTrigger({ positionId, musicianId, customPay, isFollowUp })
                              }}
                            />
                          </GigSection>
                          {/* Prepare Gig Music (client selections -> matched songs -> books). First,
                              because it is the main job on a booked gig. */}
                          {canManage && intakeEnabled && (
                            <IntakePanel
                              projectId={project.id}
                              ensembleType={project.ensemble_type}
                              positionInstruments={project.project_positions
                                .map((p) => p.instrument?.name)
                                .filter((n): n is string => !!n)}
                              instruments={Array.from(
                                new Map(
                                  project.project_positions
                                    .filter((p) => p.instrument)
                                    .map((p) => [p.instrument!.id, { id: p.instrument!.id, name: p.instrument!.name }])
                                ).values()
                              )}
                            />
                          )}
                          {canManage && project.project_positions.length > 0 && (hasMusic(project) || filesOpen.has(project.id)) && (
                            <GigSection accent="music">
                              {/* Music / Parts: where Prepare Gig Music's books land and Send Music
                                  goes out. Hidden while empty; it appears once a book is sent here. */}
                              {(
                                <ProjectFilesSection
                                  projectId={project.id}
                                  projectName={project.name}
                                  organizationId={organizationId}
                                  organizationName={organizationName}
                                  positions={project.project_positions}
                                  canManage={canManage}
                                  timezone={timezone}
                                  musicSends={(project as any).music_sends as any[] | undefined}
                                />
                              )}
                            </GigSection>
                          )}
                          {canManage && project.project_positions.length > 0 && (project.project_positions.every((p) => p.status === 'confirmed') || ((project as { gig_detail_sends?: unknown[] }).gig_detail_sends?.length ?? 0) > 0) && (
                            <GigSection accent="send" title="Send to musicians">
                              {/* Send Gig Details + Group Text (gated behind all positions confirmed) */}
                              {canManage && project.project_positions.length > 0 && project.project_positions.every((p) => p.status === 'confirmed') && (
                                <div className="flex flex-wrap items-center gap-3">
                                  {(() => {
                                    const sends = (project as any).gig_detail_sends as any[] | undefined
                                    const latestSend = sends?.sort((a: any, b: any) =>
                                      new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
                                    )[0]
                                    return (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={!canUseEmailFeatures(plan) && !latestSend}
                                        title={!canUseEmailFeatures(plan) ? 'Pro feature' : undefined}
                                        onClick={() => {
                                          setGigDetailsProject(project)
                                          setGigDetailsOpen(true)
                                        }}
                                      >
                                        <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                                        </svg>
                                        {latestSend ? 'Gig Details Status' : 'Send Gig Details'}
                                      </Button>
                                    )
                                  })()}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={!canUseEmailFeatures(plan)}
                                    title={!canUseEmailFeatures(plan) ? 'Pro feature' : undefined}
                                    onClick={() => {
                                      setGroupTextProject(project)
                                      setGroupTextOpen(true)
                                    }}
                                  >
                                    <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                                    </svg>
                                    Group Text
                                  </Button>
                                </div>
                              )}
                              {/* Gig Details Confirmation Status (always visible if sends exist) */}
                              {canManage && (() => {
                                const sends = (project as any).gig_detail_sends as any[] | undefined
                                const latestSend = sends?.sort((a: any, b: any) =>
                                  new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
                                )[0]
                                if (!latestSend) return null
                                const confirmations = latestSend?.gig_detail_confirmations as any[] | undefined
                                const confirmedCount = confirmations?.filter((c: any) => c.confirmed_at).length ?? 0
                                const totalCount = confirmations?.length ?? 0
                                if (totalCount === 0) return null
                                const allConfirmed = confirmedCount === totalCount
                                return (
                                  <div
                                    className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer hover:opacity-80 ${
                                      allConfirmed
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                    }`}
                                    onClick={() => {
                                      setGigDetailsProject(project)
                                      setGigDetailsOpen(true)
                                    }}
                                  >
                                    {allConfirmed ? (
                                      <>
                                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                        </svg>
                                        All {totalCount} confirmed gig details
                                      </>
                                    ) : (
                                      <>
                                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                        </svg>
                                        Gig details: {confirmedCount} of {totalCount} confirmed
                                      </>
                                    )}
                                  </div>
                                )
                              })()}
                              {!hasMusic(project) && !filesOpen.has(project.id) && (
                                <button
                                  type="button"
                                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                                  onClick={() => setFilesOpen((prev) => new Set(prev).add(project.id))}
                                >
                                  Upload sheet music (PDF) yourself
                                </button>
                              )}
                            </GigSection>
                          )}
                          {canManage && project.project_positions.some((p) => p.status === 'confirmed') && (
                            <GigSection accent="after" title="After the gig" hint="Thirty minutes after it ends, owners and admins get the pay summary and the gig lead is asked for a report.">
                              {/* Gig report from the lead musician(s), after the gig */}
                              {canManage && project.project_positions.some((p) => p.status === 'confirmed') && (
                                <GigReportPanel
                                  projectId={project.id}
                                  positions={project.project_positions}
                                      chosenLeadId={project.gig_lead_musician_id ?? null}
                                  reports={gigReports.filter((r) => r.project_id === project.id)}
                                  timezone={timezone}
                                />
                              )}
                            </GigSection>
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
        organizationName={organizationName}
        timezone={timezone}
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

      {groupTextProject && (
        <GroupTextDialog
          open={groupTextOpen}
          onOpenChange={setGroupTextOpen}
          projectName={groupTextProject.name}
          musicians={groupTextProject.project_positions
            .filter((p) => p.status === 'confirmed' && p.musician)
            .sort((a, b) => {
              const instrA = a.instrument?.name || ''
              const instrB = b.instrument?.name || ''
              if (instrA !== instrB) return instrA.localeCompare(instrB)
              return (a.chair_number || 0) - (b.chair_number || 0)
            })
            .map((p) => ({
              positionId: p.id,
              musicianId: p.musician_id!,
              firstName: p.musician!.first_name,
              lastName: p.musician!.last_name,
              instrument: p.instrument?.name || term(terms, 'skill'),
              phone: p.musician!.phone || null,
            }))}
          onPhonesSaved={() => router.refresh()}
        />
      )}

      {reminderDialogId && (
        <ApproveReminderDialog
          open={reminderDialogOpen}
          onOpenChange={(open) => {
            setReminderDialogOpen(open)
            if (!open) setReminderDialogId(null)
          }}
          reminderId={reminderDialogId}
        />
      )}
    </div>
  )
}
