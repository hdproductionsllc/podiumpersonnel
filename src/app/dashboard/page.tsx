import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SetupWizard } from '@/components/onboarding/setup-wizard'
import { DashboardCalendar, type CalendarService } from '@/components/dashboard/dashboard-calendar'
import { DEFAULT_TIMEZONE } from '@/lib/utils'
import { getServerVertical } from '@/lib/verticals/server'
import { term } from '@/lib/verticals'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { terms } = await getServerVertical()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

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
    .eq('user_id', user.id)
    .single()

  const organization = membership?.organization as unknown as { id: string; name: string; slug: string; timezone: string } | null
  // No org yet (e.g. signed up but hasn't finished onboarding) — send them there
  // instead of crashing on a null org.
  if (!organization) redirect('/onboarding')
  const orgId = organization.id
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
    { count: totalOfferCount },
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
      .select('*, project_position:project_positions!inner(project:projects!inner(organization_id))', { count: 'exact', head: true })
      .eq('project_position.project.organization_id', orgId)
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
    // Total offers ever sent (for "Getting Started" completion check)
    supabase
      .from('contract_offers')
      .select('*, project_position:project_positions!inner(project:projects!inner(organization_id))', { count: 'exact', head: true })
      .eq('project_position.project.organization_id', orgId),

    // Upcoming services (next 30 days — for list view)
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

  // Fetch tutorial state and calendar services in parallel
  const calendarStart = new Date()
  calendarStart.setMonth(calendarStart.getMonth() - 1, 1) // Start of previous month
  const calendarEnd = new Date()
  calendarEnd.setMonth(calendarEnd.getMonth() + 3, 0) // End of 2 months from now

  const [{ data: tutorialState }, { data: calendarServicesRaw }] = await Promise.all([
    supabase
      .from('user_tutorial_state')
      .select('wizard_completed, dismissed_tooltips')
      .eq('user_id', user!.id)
      .eq('organization_id', orgId)
      .maybeSingle(),
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
        project:projects!inner(
          id,
          name,
          organization_id,
          project_positions(id, status)
        )
      `)
      .eq('project.organization_id', orgId)
      .gte('start_time', calendarStart.toISOString())
      .lte('start_time', calendarEnd.toISOString())
      .order('start_time', { ascending: true }),
  ])

  const showWizard = !tutorialState?.wizard_completed

  // Process calendar services with staffing status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calendarServices: CalendarService[] = (calendarServicesRaw || []).map((s: any) => {
    const positions = s.project?.project_positions || []
    const hasVacant = positions.some((p: any) => p.status === 'vacant')
    const hasPending = positions.some((p: any) => p.status === 'offered')
    const allConfirmed = positions.length > 0 && positions.every((p: any) => p.status === 'confirmed')

    let staffingStatus: CalendarService['staffingStatus'] = 'unknown'
    if (positions.length === 0) staffingStatus = 'unknown'
    else if (allConfirmed) staffingStatus = 'fully_staffed'
    else if (hasVacant) staffingStatus = 'has_vacancies'
    else if (hasPending) staffingStatus = 'has_pending'

    return {
      id: s.id,
      name: s.name,
      service_type: s.service_type || 'other',
      call_time: s.call_time,
      start_time: s.start_time,
      end_time: s.end_time,
      venue: s.venue,
      projectId: s.project?.id,
      projectName: s.project?.name,
      staffingStatus,
    }
  })

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
    { label: 'Send calls', description: 'Staff positions and send calls to musicians', done: (totalOfferCount ?? 0) > 0, href: '/dashboard/projects' },
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
    const projectName = reminder.project?.name || term(terms, 'work')
    actionItems.push({
      id: `reminder-${reminder.id}`,
      text: `${projectName} — pre-gig reminder ready`,
      subtext: `Review and send to ${term(terms, 'person', { plural: true, case: 'lower' })}`,
      href: `/dashboard/projects?expand=${reminder.project_id}&reminder=${reminder.id}`,
      urgency: 'amber',
    })
  })

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
      case 'rescinded':
        return { action: 'Offer rescinded', detail: `${musicianName} for ${instrument}`, color: 'text-orange-600 dark:text-orange-400' }
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

      {/* Action Items — top of dashboard when there are things needing attention */}
      {actionItems.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Action Items</CardTitle>
            <CardDescription>Things that need your attention</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {actionItems.map((item) => (
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
      )}

      {/* Calendar + Stats side by side */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Monthly Calendar */}
        <Card>
          <CardHeader>
            <CardTitle>{orgName}&apos;s Schedule</CardTitle>
            <CardDescription>
              Click any day to see details
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DashboardCalendar services={calendarServices} timezone={timezone} />
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 content-start">
          <Link href="/dashboard/projects">
            <Card className="card-gold-top transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer group">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-dm-sans)' }}>Active {term(terms, 'work', { plural: true })}</CardTitle>
                <svg className="h-4 w-4 text-muted-foreground/40 group-hover:text-gold transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" /></svg>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tracking-tight text-primary">{activeProjectCount ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {activeProjectCount ? `${activeProjectCount} in progress` : `No active ${term(terms, 'work', { plural: true, case: 'lower' })}`}
                </p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/dashboard/musicians">
            <Card className="card-gold-top transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer group">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ fontFamily: 'var(--font-dm-sans)' }}>{term(terms, 'person', { plural: true })}</CardTitle>
                <svg className="h-4 w-4 text-muted-foreground/40 group-hover:text-gold transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tracking-tight text-primary">{musicianCount ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {musicianCount ? `${musicianCount} ready to call` : `No ${term(terms, 'person', { plural: true, case: 'lower' })} added`}
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
      </div>

      {/* Getting Started or Recent Activity */}
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
      ) : recentActivity && recentActivity.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Contract offer updates from the past 7 days
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                      offer.status === 'rescinded' ? 'bg-orange-500' :
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
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
