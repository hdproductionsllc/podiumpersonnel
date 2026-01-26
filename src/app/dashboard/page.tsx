import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Get user's organization
  const { data: membership } = await supabase
    .from('organization_members')
    .select(`
      organization:organizations(
        id,
        name,
        slug
      )
    `)
    .eq('user_id', user!.id)
    .single()

  const organization = membership?.organization as unknown as { id: string; name: string; slug: string } | null
  const orgId = organization!.id

  // Fetch stats in parallel
  const [
    { count: activeProjectCount },
    { count: musicianCount },
    { count: pendingOfferCount },
    { count: upcomingServiceCount },
    { count: instrumentCount },
    { count: bookCount },
  ] = await Promise.all([
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
      .in('status', ['pending', 'sent']),
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
  ])

  const steps = [
    { label: 'Add instruments', description: 'Define the instruments in your orchestra', done: (instrumentCount ?? 0) > 0, href: '/dashboard/instruments' },
    { label: 'Add musicians', description: 'Build your roster of available musicians', done: (musicianCount ?? 0) > 0, href: '/dashboard/musicians' },
    { label: 'Create a saved ensemble', description: 'Organize musicians by instrument and preference', done: (bookCount ?? 0) > 0, href: '/dashboard/books' },
    { label: 'Create your first project', description: 'Start managing personnel for concerts and events', done: (activeProjectCount ?? 0) > 0, href: '/dashboard/projects' },
  ]

  const allStepsComplete = steps.every((s) => s.done)

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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
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
        <Card>
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
        <Card>
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
        <Card>
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
      </div>

      {!allStepsComplete && (
        <div className="grid gap-4 md:grid-cols-2">
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

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>
                Your latest actions and updates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No recent activity to display.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
