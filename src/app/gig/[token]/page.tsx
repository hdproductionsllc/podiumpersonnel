import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface GigPageProps {
  params: Promise<{ token: string }>
}

export default async function GigPage({ params }: GigPageProps) {
  const { token } = await params
  const supabase = await createClient()

  // Fetch contract offer by token
  const { data: offer } = await supabase
    .from('contract_offers')
    .select(`
      *,
      musician:musicians(
        first_name,
        last_name,
        email
      ),
      project_position:project_positions(
        chair_number,
        instrument:instruments(name),
        project:projects(
          name,
          description,
          start_date,
          end_date,
          organization:organizations(name)
        )
      )
    `)
    .eq('token', token)
    .single()

  if (!offer) {
    notFound()
  }

  // Type the nested data - eslint-disable needed for Supabase join queries
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offerData = offer as any
  const musician = offerData.musician as { first_name: string; last_name: string; email: string | null } | null
  const position = offerData.project_position as {
    chair_number: number
    instrument: { name: string } | null
    project: {
      name: string
      description: string | null
      start_date: string | null
      end_date: string | null
      organization: { name: string } | null
    } | null
  } | null

  // Mark as viewed if pending
  if (offerData.status === 'pending') {
    await supabase
      .from('contract_offers')
      .update({
        status: 'viewed',
        viewed_at: new Date().toISOString(),
      })
      .eq('id', offerData.id)
  }

  const isExpired = offerData.expires_at && new Date(offerData.expires_at) < new Date()
  const canRespond = offerData.status === 'pending' || offerData.status === 'viewed'

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4 py-8">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Contract Offer</CardTitle>
          <CardDescription>
            {position?.project?.organization?.name}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="font-semibold">Hello, {musician?.first_name}!</h3>
            <p className="text-muted-foreground">
              You have been invited to perform with {position?.project?.organization?.name}.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Project</span>
              <span className="font-medium">{position?.project?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Position</span>
              <span className="font-medium">
                {position?.instrument?.name} {position?.chair_number}
              </span>
            </div>
            {position?.project?.start_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dates</span>
                <span className="font-medium">
                  {new Date(position.project.start_date).toLocaleDateString()}
                  {position.project.end_date && ` - ${new Date(position.project.end_date).toLocaleDateString()}`}
                </span>
              </div>
            )}
          </div>

          {position?.project?.description && (
            <div>
              <h4 className="font-medium mb-1">Description</h4>
              <p className="text-sm text-muted-foreground">{position.project.description}</p>
            </div>
          )}

          {offerData.status === 'accepted' && (
            <div className="space-y-3">
              <div className="rounded-md bg-green-50 dark:bg-green-950 p-4 text-green-800 dark:text-green-200">
                You have accepted this offer.
              </div>
              <a
                href={`/api/offers/${offerData.id}/calendar`}
                download
                className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
                Add to Calendar
              </a>
            </div>
          )}

          {offerData.status === 'declined' && (
            <div className="rounded-md bg-red-50 dark:bg-red-950 p-4 text-red-800 dark:text-red-200">
              You have declined this offer.
            </div>
          )}

          {isExpired && canRespond && (
            <div className="rounded-md bg-yellow-50 dark:bg-yellow-950 p-4 text-yellow-800 dark:text-yellow-200">
              This offer has expired.
            </div>
          )}

          {canRespond && !isExpired && (
            <div className="flex gap-3">
              <form action={`/api/gig/${token}/accept`} method="POST" className="flex-1">
                <Button type="submit" className="w-full">
                  Accept Offer
                </Button>
              </form>
              <form action={`/api/gig/${token}/decline`} method="POST" className="flex-1">
                <Button type="submit" variant="outline" className="w-full">
                  Decline
                </Button>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
