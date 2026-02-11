'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { isPast, isSameDay } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { AlertCircle, Calendar, FileText } from 'lucide-react'
import { cn, DEFAULT_TIMEZONE } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { ProjectCard, type ProjectCardData } from './project-card'
import { InlineOfferCard, type InlineOfferData } from './inline-offer-card'
import { CalendarView } from './calendar-view'

type TabType = 'upcoming' | 'calendar' | 'past'

export interface UnifiedDashboardData {
  musician: {
    id: string
    first_name: string
    last_name: string
  }
  pendingOffers: InlineOfferData[]
  projects: ProjectCardData[]
}

interface UnifiedDashboardProps {
  initialData: UnifiedDashboardData
  impersonateId?: string | null
}

export function UnifiedDashboard({ initialData, impersonateId }: UnifiedDashboardProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('upcoming')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const { musician, pendingOffers, projects } = initialData

  // Split projects into upcoming and past
  const now = new Date()
  const { upcomingProjects, pastProjects } = useMemo(() => {
    const upcoming: ProjectCardData[] = []
    const past: ProjectCardData[] = []

    for (const project of projects) {
      const hasFutureService = project.services.some(
        (s) => new Date(s.start_time) >= now
      )
      if (hasFutureService) {
        upcoming.push(project)
      } else {
        past.push(project)
      }
    }

    // Sort upcoming by next service date
    upcoming.sort((a, b) => {
      const aNext = a.services
        .filter((s) => new Date(s.start_time) >= now)
        .sort((s1, s2) => new Date(s1.start_time).getTime() - new Date(s2.start_time).getTime())[0]
      const bNext = b.services
        .filter((s) => new Date(s.start_time) >= now)
        .sort((s1, s2) => new Date(s1.start_time).getTime() - new Date(s2.start_time).getTime())[0]
      if (!aNext) return 1
      if (!bNext) return -1
      return new Date(aNext.start_time).getTime() - new Date(bNext.start_time).getTime()
    })

    // Sort past by most recent service
    past.sort((a, b) => {
      const aLast = [...a.services].sort(
        (s1, s2) => new Date(s2.start_time).getTime() - new Date(s1.start_time).getTime()
      )[0]
      const bLast = [...b.services].sort(
        (s1, s2) => new Date(s2.start_time).getTime() - new Date(s1.start_time).getTime()
      )[0]
      if (!aLast) return 1
      if (!bLast) return -1
      return new Date(bLast.start_time).getTime() - new Date(aLast.start_time).getTime()
    })

    return { upcomingProjects: upcoming, pastProjects: past }
  }, [projects])

  // All services for calendar view
  const allServices = useMemo(() => {
    return projects.flatMap((p) =>
      p.services.map((s) => ({
        id: s.id,
        name: s.name,
        service_type: s.service_type,
        start_time: s.start_time,
        project: {
          id: p.projectId,
          name: p.projectName,
          organization: {
            id: '', // not needed for calendar
            name: p.organizationName,
            timezone: p.organizationTimezone,
          },
        },
      }))
    )
  }, [projects])

  // Filter projects by selected calendar date
  const calendarFilteredProjects = useMemo(() => {
    if (!selectedDate) return upcomingProjects
    return projects.filter((p) =>
      p.services.some((s) => {
        const tz = p.organizationTimezone || DEFAULT_TIMEZONE
        const serviceDate = toZonedTime(new Date(s.start_time), tz)
        return isSameDay(serviceDate, selectedDate)
      })
    )
  }, [selectedDate, projects, upcomingProjects])

  // Stats
  const upcomingGigCount = upcomingProjects.reduce(
    (sum, p) => sum + p.services.filter((s) => new Date(s.start_time) >= now).length,
    0
  )
  const undownloadedFileCount = projects.reduce(
    (sum, p) => sum + p.files.filter((f) => !f.downloaded).length,
    0
  )

  function handleOfferResponded() {
    // Refresh the page to get updated data
    router.refresh()
  }

  const tabs: { key: TabType; label: string }[] = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'calendar', label: 'Calendar' },
    { key: 'past', label: 'Past' },
  ]

  const activeProjects =
    activeTab === 'upcoming'
      ? upcomingProjects
      : activeTab === 'past'
        ? pastProjects
        : calendarFilteredProjects

  return (
    <div className="space-y-6">
      {/* Greeting + Stats */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-[family-name:var(--font-playfair-display)] font-bold">
          Hi, {musician.first_name}!
        </h1>
        <div className="flex items-center gap-2 shrink-0">
          {upcomingGigCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              <Calendar className="h-3 w-3" />
              {upcomingGigCount} {upcomingGigCount === 1 ? 'gig' : 'gigs'}
            </span>
          )}
          {undownloadedFileCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              <FileText className="h-3 w-3" />
              {undownloadedFileCount} {undownloadedFileCount === 1 ? 'file' : 'files'}
            </span>
          )}
        </div>
      </div>

      {/* Pending Offers */}
      {pendingOffers.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="rounded-full bg-amber-100 dark:bg-amber-900 p-1.5">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="font-semibold">Action Required</h2>
            <span className="text-sm text-muted-foreground">
              ({pendingOffers.length} pending)
            </span>
          </div>
          <div className="space-y-3">
            {pendingOffers.map((offer, index) => (
              <InlineOfferCard
                key={offer.id}
                offer={offer}
                defaultOpen={pendingOffers.length === 1}
                onResponded={handleOfferResponded}
              />
            ))}
          </div>
        </section>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key)
              if (tab.key !== 'calendar') setSelectedDate(null)
            }}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            {tab.key === 'upcoming' && upcomingProjects.length > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({upcomingProjects.length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Calendar */}
      {activeTab === 'calendar' && (
        <CalendarView
          services={allServices}
          selectedDate={selectedDate}
          onDateSelect={(date) =>
            setSelectedDate(selectedDate && isSameDay(date, selectedDate) ? null : date)
          }
        />
      )}

      {/* Project Cards */}
      {activeProjects.length > 0 ? (
        <div className="space-y-4">
          {activeProjects.map((project) => (
            <ProjectCard
              key={project.projectId}
              project={project}
              impersonateId={impersonateId}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Calendar className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <h3 className="font-medium">
            {activeTab === 'upcoming'
              ? 'No upcoming projects'
              : activeTab === 'past'
                ? 'No past projects'
                : selectedDate
                  ? 'No services on this date'
                  : 'No projects to show'}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {activeTab === 'upcoming'
              ? 'Your confirmed gigs will appear here.'
              : activeTab === 'past'
                ? 'Completed projects will appear here.'
                : 'Select a date on the calendar to filter projects.'}
          </p>
        </div>
      )}
    </div>
  )
}

export function UnifiedDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-24 w-full rounded-lg" />
      </section>

      <div className="flex gap-1 border-b pb-0">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-16" />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    </div>
  )
}
