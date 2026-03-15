import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SetupWizard } from '@/components/onboarding/setup-wizard'
import { DEFAULT_TIMEZONE } from '@/lib/utils'

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
  const timezone = organization?.timezone || DEFAULT_TIMEZONE
  const orgName = organization?.name || 'Your Organization'

  // Get user's first name from metadata
  const userFirstName = (user?.user_metadata?.first_name as string) || (user?.user_metadata?.name as string)?.split(' ')[0] || ''

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
    { data: unpaidPayments },
    { data: draftReminders },
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
        call_time,
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

    // Unpaid payments for past services (payment prompt)
    supabase
      .from('payments')
      .select(`
        id,
        amount,
        service:services!inner(
          start_time,
          project:projects!inner(id, name)
        )
      `)
      .eq('organization_id', orgId)
      .eq('status', 'unpaid')
      .lt('service.start_time', new Date().toISOString()),

    // Draft pre-gig reminders
    supabase
      .from('pre_gig_reminders')
      .select(`
        id,
        project_id,
        musician_count,
        trigger_date,
        project:projects(id, name)
      `)
      .eq('organization_id', orgId)
      .eq('status', 'draft')
      .gt('trigger_date', new Date().toISOString()),
  ])

  // Fetch tutorial state
  const { data: tutorialState } = await supabase
    .from('user_tutorial_state')
    .select('wizard_completed, dismissed_tooltips')
    .eq('user_id', user!.id)
    .eq('organization_id', orgId)
    .maybeSingle()

  const showWizard = !tutorialState?.wizard_completed

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

  // Calculate total vacancies and pending offers for hero CTA
  const totalVacancies = staffingAlerts
    .filter(a => a.alertType === 'vacant')
    .reduce((sum, a) => sum + a.count, 0)
  const totalPending = staffingAlerts
    .filter(a => a.alertType === 'pending')
    .reduce((sum, a) => sum + a.count, 0)

  // Find projects that are fully confirmed (all positions filled)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fullyStaffedProjects = (projectsNeedingAttention || []).filter((project: any) => {
    const positions = project.project_positions || []
    return positions.length > 0 && positions.every((p: any) => p.status === 'confirmed')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }).map((p: any) => p.name as string)

  // Combine services and projects into unified calendar items
  type CalendarItem = {
    id: string
    type: 'service' | 'project'
    name: string
    projectId: string
    projectName: string
    date: string
    callTime?: string | null
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
      callTime: service.call_time,
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
    { label: 'Add musicians & set call order', description: 'Build your roster and rank who gets called first', done: (musicianCount ?? 0) > 0, href: '/dashboard/musicians' },
    { label: 'Create a project', description: 'Set up concerts, events, or rehearsal series', done: (activeProjectCount ?? 0) > 0, href: '/dashboard/projects' },
    { label: 'Send calls', description: 'Staff positions and send calls to musicians', done: (pendingOfferCount ?? 0) > 0, href: '/dashboard/projects' },
  ]

  const allStepsComplete = steps.every((s) => s.done)

  // Compute action items for the middle state
  type ActionItem = {
    id: string
    text: string
    subtext: string
    href: string
    urgency: 'red' | 'amber' | 'blue'
  }
  const actionItems: ActionItem[] = []

  // Projects with vacant positions needing calls
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projectsNeedingAttention?.forEach((project: any) => {
    const vacantPositions = project.project_positions?.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p: any) => p.status === 'vacant'
    ) || []

    if (vacantPositions.length > 0) {
      // Group by instrument
      const instrumentCounts: Record<string, number> = {}
      for (const pos of vacantPositions) {
        const name = pos.instrument?.name || 'position'
        instrumentCounts[name] = (instrumentCounts[name] || 0) + 1
      }
      const instrumentList = Object.entries(instrumentCounts)
        .map(([name, count]) => `${count} ${name}${count > 1 ? 's' : ''}`)
        .join(', ')

      actionItems.push({
        id: `vacant-${project.id}`,
        text: `${project.name} needs ${instrumentList}`,
        subtext: 'Send calls now?',
        href: `/dashboard/projects?expand=${project.id}`,
        urgency: 'red',
      })
    }

    // Pending offers for 48+ hours
    const pendingOffers = project.project_positions?.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p: any) => p.status === 'offered'
    ) || []
    if (pendingOffers.length > 0) {
      actionItems.push({
        id: `pending-${project.id}`,
        text: `${pendingOffers.length} offer${pendingOffers.length !== 1 ? 's' : ''} pending for ${project.name}`,
        subtext: 'Consider sending reminders',
        href: `/dashboard/projects?expand=${project.id}`,
        urgency: 'amber',
      })
    }
  })

  // Unpaid payments for past projects
  if (unpaidPayments && unpaidPayments.length > 0) {
    // Group unpaid payments by project
    const unpaidByProject: Record<string, { name: string; count: number; total: number }> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unpaidPayments.forEach((p: any) => {
      const projectId = p.service?.project?.id
      const projectName = p.service?.project?.name
      if (!projectId || !projectName) return
      if (!unpaidByProject[projectId]) {
        unpaidByProject[projectId] = { name: projectName, count: 0, total: 0 }
      }
      unpaidByProject[projectId].count += 1
      unpaidByProject[projectId].total += Number(p.amount)
    })

    Object.entries(unpaidByProject).forEach(([projectId, { name, count, total }]) => {
      const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total)
      actionItems.push({
        id: `unpaid-${projectId}`,
        text: `${count} unpaid payment${count !== 1 ? 's' : ''} for ${name} (${formatted})`,
        subtext: 'This gig has passed \u2014 record payments now',
        href: `/dashboard/payments?project=${projectId}&status=unpaid`,
        urgency: 'amber',
      })
    })
  }

  // Draft pre-gig reminders needing approval
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  draftReminders?.forEach((reminder: any) => {
    const projectName = reminder.project?.name || 'Project'
    actionItems.push({
      id: `reminder-${reminder.id}`,
      text: `${projectName} — pre-gig reminder ready`,
      subtext: 'Review and send to musicians',
      href: `/dashboard/projects?expand=${reminder.project_id}&reminder=${reminder.id}`,
      urgency: 'amber',
    })
  })

  const hasActionItems = allStepsComplete && actionItems.length > 0

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
      {showWizard && (
        <SetupWizard userId={user!.id} organizationId={orgId} />
      )}

      <div className="page-header">
        <h2 className="text-3xl font-bold tracking-tight">
          {userFirstName ? `Welcome back, ${userFirstName}` : `Welcome to ${orgName}`}
        </h2>
        <p className="text-muted-foreground mt-1">
          {orgName}&apos;s personnel dashboard
        </p>
        <div className="mt-3 w-12 h-px bg-gold/50" />
      </div>

      {/* Hero CTA — prioritize what the user needs to do next */}
      {(musicianCount ?? 0) === 0 ? (
        <Link href="/dashboard/musicians">
          <Card className="border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer">
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <svg className="h-12 w-12 text-primary mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
              <h3 className="text-xl font-bold mb-2">Build Your Roster, Set Your Call Order</h3>
              <p className="text-muted-foreground max-w-md">
                Add your musicians and rank them by preference — Podium handles the rest. When a chair opens, your top pick gets the call automatically.
              </p>
            </CardContent>
          </Card>
        </Link>
      ) : (activeProjectCount ?? 0) === 0 ? (
        <Link href="/dashboard/projects">
          <Card className="border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer">
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <svg className="h-12 w-12 text-primary mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <h3 className="text-xl font-bold mb-2">Start Your First Project</h3>
              <p className="text-muted-foreground max-w-md">
                Staff musicians for your upcoming gig or concert! You only need a musician&apos;s name and instrument to send a call — other details can be added later.
              </p>
            </CardContent>
          </Card>
        </Link>
      ) : totalVacancies > 0 ? (
        <Link href="/dashboard/projects">
          <Card className="border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-4 py-4">
              <svg className="h-8 w-8 text-amber-600 dark:text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <div className="flex-1">
                <h3 className="font-bold text-amber-900 dark:text-amber-100">
                  {totalVacancies} vacant position{totalVacancies !== 1 ? 's' : ''} to fill
                </h3>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Go to Projects to send calls to musicians
                </p>
              </div>
              <svg className="h-5 w-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </CardContent>
          </Card>
        </Link>
      ) : totalPending > 0 ? (
        <Link href="/dashboard/projects">
          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-4 py-4">
              <svg className="h-8 w-8 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <div className="flex-1">
                <h3 className="font-bold text-blue-900 dark:text-blue-100">
                  {totalPending} offer{totalPending !== 1 ? 's' : ''} awaiting response
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  All positions have been offered — waiting for musicians to respond
                </p>
              </div>
              <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </CardContent>
          </Card>
        </Link>
      ) : fullyStaffedProjects.length > 0 ? (
        <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
          <CardContent className="flex items-center gap-3 py-3">
            <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <span className="text-sm font-medium text-green-700 dark:text-green-300">
              {fullyStaffedProjects.length === 1
                ? `${fullyStaffedProjects[0]} is fully staffed!`
                : `${fullyStaffedProjects.length} projects fully staffed!`}
            </span>
          </CardContent>
        </Card>
      ) : null}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-2">
        <Link href="/dashboard/projects">
          <Card className="card-gold-top transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-dm-sans)' }}>Active Projects</CardTitle>
              <svg className="h-4 w-4 text-muted-foreground/40 group-hover:text-gold transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" /></svg>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight text-primary">{activeProjectCount ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {activeProjectCount ? `${activeProjectCount} in progress` : 'No active projects'}
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/musicians">
          <Card className="card-gold-top transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-dm-sans)' }}>Musicians</CardTitle>
              <svg className="h-4 w-4 text-muted-foreground/40 group-hover:text-gold transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight text-primary">{musicianCount ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {musicianCount ? `${musicianCount} ready to call` : 'No musicians added'}
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/projects">
          <Card className="card-gold-top transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-dm-sans)' }}>Pending Offers</CardTitle>
              <svg className="h-4 w-4 text-muted-foreground/40 group-hover:text-gold transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight text-primary">{pendingOfferCount ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {pendingOfferCount ? `${pendingOfferCount} awaiting response` : 'No pending offers'}
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/projects">
          <Card className="card-gold-top transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-dm-sans)' }}>Upcoming Services</CardTitle>
              <svg className="h-4 w-4 text-muted-foreground/40 group-hover:text-gold transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight text-primary">{upcomingServiceCount ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {upcomingServiceCount ? `${upcomingServiceCount} scheduled` : 'No upcoming services'}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Staffing Alerts */}
      {staffingAlerts.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <CardTitle className="text-base text-amber-900 dark:text-amber-100">Staffing Attention Needed</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {staffingAlerts.slice(0, 5).map((alert, i) => (
                <Link
                  key={`${alert.projectId}-${alert.alertType}-${i}`}
                  href={`/dashboard/projects?expand=${alert.projectId}`}
                  className="flex items-center justify-between rounded-lg p-2 -mx-2 transition-colors hover:bg-amber-100/50 dark:hover:bg-amber-900/20"
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
            <CardTitle>{orgName}&apos;s Upcoming Schedule</CardTitle>
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
                    href={`/dashboard/projects?expand=${item.projectId}`}
                    className={`flex items-start gap-3 rounded-lg p-2.5 -mx-2 transition-all hover:bg-muted/50 hover:shadow-sm group border-l-3 ${
                      item.type === 'project'
                        ? 'border-l-green-400'
                        : item.serviceType === 'performance'
                          ? 'border-l-purple-400'
                          : 'border-l-blue-400'
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center min-w-[56px] rounded-md bg-primary/5 border border-primary/10 px-2 py-1.5 group-hover:border-gold/30 transition-colors">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/70">
                        {formatServiceDate(item.date)}
                      </span>
                      {item.callTime && (
                        <span className="text-[10px] text-muted-foreground">
                          Call {formatTime(item.callTime)}
                        </span>
                      )}
                      {item.time && (
                        <span className="text-sm font-bold text-primary">
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
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      item.type === 'project'
                        ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                        : item.serviceType === 'performance'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
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

        {/* Getting Started -> Action Items -> Recent Activity (three-way) */}
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
        ) : hasActionItems ? (
          <Card>
            <CardHeader>
              <CardTitle>Action Items</CardTitle>
              <CardDescription>
                Things that need your attention
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {actionItems.slice(0, 5).map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="flex items-start gap-3 rounded-lg p-2 -mx-2 transition-colors hover:bg-muted/50"
                  >
                    <div className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${
                      item.urgency === 'red' ? 'bg-red-500' :
                      item.urgency === 'amber' ? 'bg-amber-500' :
                      'bg-blue-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.text}</p>
                      <p className="text-xs text-muted-foreground">{item.subtext}</p>
                    </div>
                    <svg className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </Link>
                ))}
              </div>
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
