import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Get user's organization with timezone
  const { data: membership } = await supabase
    .from('organization_members')
    .select(`
      organization:organizations(
        id,
        name,
        slug,
        timezone
      )
    `)
    .eq('user_id', user!.id)
    .single()

  const organization = membership?.organization as unknown as { id: string; name: string; slug: string; timezone: string } | null
  const orgId = organization!.id
  const timezone = organization?.timezone || 'America/Los_Angeles'

  // Fetch stats, upcoming services, recent activity, and staffing alerts in parallel
  const [
    { count: activeProjectCount },
    { count: musicianCount },
    { count: pendingOfferCount },
    { count: upcomingServiceCount },
    { count: instrumentCount },
    { count: bookCount },
    { data: upcomingServices },
    { data: upcomingProjects },
    { data: recentActivity },
    { data: projectsNeedingAttention },
  ] = await Promise.all([
    // Stats
    supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'active'),
    supabase
      .from('musicians')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('is_active', true),
    supabase
      .from('contract_offers')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .in('status', ['pending', 'viewed']),
    supabase
      .from('services')
      .select('*, project:projects!inner(organization_id)', { count: 'exact', head: true })
      .eq('project.organization_id', orgId)
      .gte('start_time', new Date().toISOString()),
    supabase
      .from('instruments')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId),
    supabase
      .from('books')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId),

    // Upcoming services (next 30 days)
    supabase
      .from('services')
      .select(`
        id,
        name,
        service_type,
        start_time,
        end_time,
        venue,
        project:projects!inner(id, name, organization_id)
      `)
      .eq('project.organization_id', orgId)
      .gte('start_time', new Date().toISOString())
      .lte('start_time', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('start_time', { ascending: true })
      .limit(10),

    // Upcoming projects (next 30 days) - for projects without services
    supabase
      .from('projects')
      .select(`
        id,
        name,
        start_date,
        end_date,
        status,
        services(id)
      `)
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .gte('start_date', new Date().toISOString().split('T')[0])
      .lte('start_date', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('start_date', { ascending: true })
      .limit(10),

    // Recent activity (contract offer changes in last 7 days)
    supabase
      .from('contract_offers')
      .select(`
        id,
        status,
        sent_at,
        viewed_at,
        responded_at,
        musician:musicians(id, first_name, last_name),
        project_position:project_positions(
          id,
          instrument:instruments(name),
          project:projects(id, name, organization_id)
        )
      `)
      .eq('organization_id', orgId)
      .gte('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('updated_at', { ascending: false })
      .limit(10),

    // Projects with staffing issues (active projects with vacant positions)
    supabase
      .from('projects')
      .select(`
        id,
        name,
        start_date,
        project_positions(id, status, instrument:instruments(name))
      `)
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .order('start_date', { ascending: true }),
  ])

  // Process staffing alerts
  type StaffingAlert = {
    projectId: string
    projectName: string
    projectDate: string | null
    alertType: 'vacant' | 'pending' | 'expiring'
    message: string
    count: number
  }

  const staffingAlerts: StaffingAlert[] = []

  // Check for vacant positions in active projects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projectsNeedingAttention?.forEach((project: any) => {
    const vacantPositions = project.project_positions?.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p: any) => p.status === 'vacant'
    ) || []

    if (vacantPositions.length > 0) {
      staffingAlerts.push({
        projectId: project.id,
        projectName: project.name,
        projectDate: project.start_date,
        alertType: 'vacant',
        message: `${vacantPositions.length} vacant position${vacantPositions.length !== 1 ? 's' : ''}`,
        count: vacantPositions.length,
      })
    }

    const pendingPositions = project.project_positions?.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p: any) => p.status === 'offered'
    ) || []

    if (pendingPositions.length > 0) {
      staffingAlerts.push({
        projectId: project.id,
        projectName: project.name,
        projectDate: project.start_date,
        alertType: 'pending',
        message: `${pendingPositions.length} pending offer${pendingPositions.length !== 1 ? 's' : ''}`,
        count: pendingPositions.length,
      })
    }
  })

  // Sort alerts by count (most urgent first)
  staffingAlerts.sort((a, b) => b.count - a.count)

  // Combine services and projects into unified calendar items
  type CalendarItem = {
    id: string
    type: 'service' | 'project'
    name: string
    projectId: string
    projectName: string
    date: string
    time?: string
    venue?: string
    serviceType?: string
  }

  const calendarItems: CalendarItem[] = []

  // Add services
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upcomingServices?.forEach((service: any) => {
    calendarItems.push({
      id: service.id,
      type: 'service',
      name: service.name,
      projectId: service.project?.id,
      projectName: service.project?.name,
      date: service.start_time,
      time: service.start_time,
      venue: service.venue,
      serviceType: service.service_type,
    })
  })

  // Add projects that have no services (to avoid duplicates)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upcomingProjects?.forEach((project: any) => {
    const hasServices = project.services && project.services.length > 0
    if (!hasServices && project.start_date) {
      calendarItems.push({
        id: project.id,
        type: 'project',
        name: project.name,
        projectId: project.id,
        projectName: project.name,
        date: project.start_date + 'T12:00:00', // Use noon to avoid timezone issues
      })
    }
  })

  // Sort by date
  calendarItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const steps = [
    { label: 'Add instruments', description: 'Define the instruments in your orchestra', done: (instrumentCount ?? 0) > 0, href: '/dashboard/instruments' },
    { label: 'Add musicians', description: 'Build your roster of available musicians', done: (musicianCount ?? 0) > 0, href: '/dashboard/musicians' },
    { label: 'Create a saved ensemble', description: 'Organize musicians by instrument and preference', done: (bookCount ?? 0) > 0, href: '/dashboard/books' },
    { label: 'Create your first project', description: 'Start managing personnel for concerts and events', done: (activeProjectCount ?? 0) > 0, href: '/dashboard/projects' },
  ]

  const allStepsComplete = steps.every((s) => s.done)

  // Format date helper
  function formatServiceDate(dateStr: string) {
    const date = new Date(dateStr)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const isToday = date.toDateString() === today.toDateString()
    const isTomorrow = date.toDateString() === tomorrow.toDateString()

    if (isToday) return 'Today'
    if (isTomorrow) return 'Tomorrow'

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: timezone,
    })
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    })
  }

  function getActivityMessage(offer: any) {
    const musicianName = `${offer.musician?.first_name} ${offer.musician?.last_name}`
    const instrument = offer.project_position?.instrument?.name || 'position'

    switch (offer.status) {
      case 'pending':
        return { action: 'Offer sent', detail: `${musicianName} for ${instrument}`, color: 'text-blue-600 dark:text-blue-400' }
      case 'viewed':
        return { action: 'Offer viewed', detail: `${musicianName} for ${instrument}`, color: 'text-yellow-600 dark:text-yellow-400' }
      case 'accepted':
        return { action: 'Offer accepted', detail: `${musicianName} for ${instrument}`, color: 'text-green-600 dark:text-green-400' }
      case 'declined':
        return { action: 'Offer declined', detail: `${musicianName} for ${instrument}`, color: 'text-red-600 dark:text-red-400' }
      default:
        return { action: 'Offer updated', detail: `${musicianName}`, color: 'text-muted-foreground' }
    }
  }

  function getActivityTime(offer: any) {
    const timestamp = offer.responded_at || offer.viewed_at || offer.sent_at
    if (!timestamp) return ''

    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          Welcome to {organization?.name || 'Podium'}
        </h2>
        <p className="text-muted-foreground">
          Manage your orchestra personnel, projects, and schedules.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/dashboard/projects">
          <Card className="transition-colors hover:bg-muted/50 cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeProjectCount ?? 0}</div>
              <p className="text-xs text-muted-foreground">
                {activeProjectCount ? `${activeProjectCount} project${activeProjectCount !== 1 ? 's' : ''} in progress` : 'No active projects yet'}
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/musicians">
          <Card className="transition-colors hover:bg-muted/50 cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Musicians</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{musicianCount ?? 0}</div>
              <p className="text-xs text-muted-foreground">
                {musicianCount ? `${musicianCount} active musician${musicianCount !== 1 ? 's' : ''}` : 'No musicians added yet'}
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/projects">
          <Card className="transition-colors hover:bg-muted/50 cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Offers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingOfferCount ?? 0}</div>
              <p className="text-xs text-muted-foreground">
                {pendingOfferCount ? `${pendingOfferCount} awaiting response` : 'No pending contract offers'}
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/projects">
          <Card className="transition-colors hover:bg-muted/50 cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Upcoming Services</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{upcomingServiceCount ?? 0}</div>
              <p className="text-xs text-muted-foreground">
                {upcomingServiceCount ? `${upcomingServiceCount} scheduled ahead` : 'No upcoming services'}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Staffing Alerts */}
      {staffingAlerts.length > 0 && (
        <Card className="border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-950/20">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <CardTitle className="text-base">Staffing Attention Needed</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {staffingAlerts.slice(0, 5).map((alert, i) => (
                <Link
                  key={`${alert.projectId}-${alert.alertType}-${i}`}
                  href="/dashboard/projects"
                  className="flex items-center justify-between rounded-lg p-2 -mx-2 transition-colors hover:bg-yellow-100/50 dark:hover:bg-yellow-900/20"
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${alert.alertType === 'vacant' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                    <div>
                      <p className="font-medium text-sm">{alert.projectName}</p>
                      <p className="text-xs text-muted-foreground">{alert.message}</p>
                    </div>
                  </div>
                  <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Upcoming Schedule Calendar */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Schedule</CardTitle>
            <CardDescription>
              Projects and services in the next 30 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            {calendarItems.length > 0 ? (
              <div className="space-y-3">
                {calendarItems.slice(0, 10).map((item) => (
                  <Link
                    key={`${item.type}-${item.id}`}
                    href={`/dashboard/projects/${item.projectId}`}
                    className="flex items-start gap-3 rounded-lg p-2 -mx-2 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex flex-col items-center justify-center min-w-[50px] rounded bg-muted px-2 py-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        {formatServiceDate(item.date)}
                      </span>
                      {item.time && (
                        <span className="text-sm font-semibold">
                          {formatTime(item.time)}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.name}</p>
                      {item.type === 'service' && (
                        <p className="text-xs text-muted-foreground truncate">
                          {item.projectName}
                        </p>
                      )}
                      {item.venue && (
                        <p className="text-xs text-muted-foreground truncate">
                          {item.venue}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      item.type === 'project'
                        ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                        : item.serviceType === 'performance'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    }`}>
                      {item.type === 'project' ? 'project' : item.serviceType}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No upcoming events scheduled.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity or Getting Started */}
        {!allStepsComplete ? (
          <Card>
            <CardHeader>
              <CardTitle>Getting Started</CardTitle>
              <CardDescription>
                Set up your organization in a few simple steps
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {steps.map((step, i) => (
                <Link
                  key={i}
                  href={step.href}
                  className="flex items-center gap-4 rounded-lg p-2 -m-2 transition-colors hover:bg-muted/50"
                >
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                    step.done
                      ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {step.done ? '✓' : i + 1}
                  </div>
                  <div className="flex-1">
                    <p className={`font-medium ${step.done ? 'line-through text-muted-foreground' : ''}`}>
                      {step.label}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                  <svg
                    className="h-5 w-5 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>
                Contract offer updates from the past 7 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentActivity && recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {recentActivity.map((offer: any) => {
                    const { action, detail, color } = getActivityMessage(offer)
                    const projectName = offer.project_position?.project?.name
                    return (
                      <Link
                        key={offer.id}
                        href="/dashboard/projects"
                        className="flex items-start gap-3 rounded-lg p-2 -mx-2 transition-colors hover:bg-muted/50"
                      >
                        <div className={`mt-0.5 h-2 w-2 rounded-full ${
                          offer.status === 'accepted' ? 'bg-green-500' :
                          offer.status === 'declined' ? 'bg-red-500' :
                          offer.status === 'viewed' ? 'bg-yellow-500' :
                          'bg-blue-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">
                            <span className={`font-medium ${color}`}>{action}</span>
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{detail}</p>
                          {projectName && (
                            <p className="text-xs text-muted-foreground truncate">{projectName}</p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {getActivityTime(offer)}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No recent activity to display.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
