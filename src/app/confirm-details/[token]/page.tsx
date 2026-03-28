import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { ConfirmDetailsClient } from '@/components/gig/confirm-details-client'
import { DEFAULT_TIMEZONE } from '@/lib/utils'

interface ConfirmDetailsPageProps {
  params: Promise<{ token: string }>
}

export default async function ConfirmDetailsPage({ params }: ConfirmDetailsPageProps) {
  const { token } = await params
  const supabase = createServiceClient()

  // Fetch confirmation record by token
  const { data: confirmation } = await supabase
    .from('gig_detail_confirmations')
    .select(`
      id,
      token,
      confirmed_at,
      musician:musicians(id, first_name, last_name),
      send:gig_detail_sends(
        id,
        sent_at,
        project:projects(
          id,
          name,
          ensemble_type,
          start_date,
          organization:organizations(id, name, timezone)
        )
      )
    `)
    .eq('token', token)
    .single()

  if (!confirmation) {
    notFound()
  }

  const musician = confirmation.musician as any
  const send = confirmation.send as any
  const project = send?.project as any
  const organization = project?.organization as any
  const timezone = organization?.timezone || DEFAULT_TIMEZONE

  // Fetch services for display
  const { data: services } = await supabase
    .from('services')
    .select(`
      id,
      name,
      start_time,
      venue,
      venue_id,
      venue_details:venues!services_venue_id_fkey(name, address, city, state, zip)
    `)
    .eq('project_id', project?.id)
    .order('start_time', { ascending: true })

  const formattedServices = (services || []).map((service: any) => {
    const venueName = service.venue_details?.name || service.venue || null
    return {
      name: service.name,
      date: new Date(service.start_time).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: timezone,
      }),
      venue: venueName,
    }
  })

  return (
    <ConfirmDetailsClient
      token={token}
      musicianFirstName={musician?.first_name || ''}
      organizationName={organization?.name || 'Orchestra'}
      projectName={project?.name || 'Project'}
      ensembleType={project?.ensemble_type || null}
      services={formattedServices}
      alreadyConfirmed={!!confirmation.confirmed_at}
      confirmedAt={confirmation.confirmed_at}
      timezone={timezone}
    />
  )
}
