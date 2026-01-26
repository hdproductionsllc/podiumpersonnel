import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  const { offerId } = await params
  const supabase = await createClient()

  // Fetch offer with all related data
  const { data: offer, error } = await supabase
    .from('contract_offers')
    .select(`
      id,
      status,
      custom_pay,
      project_position:project_positions!inner(
        id,
        chair_number,
        instrument:instruments(name),
        project:projects!inner(
          id,
          name,
          organization:organizations(name)
        )
      ),
      musician:musicians(first_name, last_name, email)
    `)
    .eq('id', offerId)
    .single()

  if (error || !offer) {
    return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  }

  if (offer.status !== 'accepted') {
    return NextResponse.json({ error: 'Offer must be accepted to download calendar' }, { status: 400 })
  }

  const position = offer.project_position as any
  const project = position.project
  const instrument = position.instrument
  const musician = offer.musician as any

  // Fetch services for this project with venue details
  const { data: services } = await supabase
    .from('services')
    .select(`
      id,
      name,
      service_type,
      start_time,
      end_time,
      notes,
      base_pay,
      leader_fee,
      venue,
      venue_id,
      venue_details:venues(name, address, city, state, zip)
    `)
    .eq('project_id', project.id)
    .order('start_time', { ascending: true })

  if (!services || services.length === 0) {
    return NextResponse.json({ error: 'No services found for this project' }, { status: 404 })
  }

  // Calculate pay
  const isLeader = position.chair_number === 1
  const firstService = services[0] as any
  const basePay = firstService.base_pay
  const leaderFee = firstService.leader_fee ?? 50
  const calculatedPay = offer.custom_pay ?? (basePay != null ? basePay + (isLeader ? leaderFee : 0) : null)

  // Build ICS content
  const now = new Date()
  let ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Podium Personnel//Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:${escapeICSText(project.name)}
`

  for (const service of services) {
    const svc = service as any
    const startDate = new Date(svc.start_time)
    const endDate = svc.end_time ? new Date(svc.end_time) : new Date(startDate.getTime() + 3 * 60 * 60 * 1000)

    // Build location string
    let location = svc.venue || ''
    if (svc.venue_details) {
      const v = svc.venue_details
      location = [v.name, v.address, v.city, v.state, v.zip].filter(Boolean).join(', ')
    }

    // Build description
    const descParts = [
      `Position: ${instrument.name} ${position.chair_number}${isLeader ? ' (Leader)' : ''}`,
    ]
    if (calculatedPay != null) {
      descParts.push(`Pay: $${calculatedPay}`)
    }
    if (svc.notes) {
      descParts.push(`Notes: ${svc.notes}`)
    }
    descParts.push(`Organization: ${project.organization.name}`)

    const uid = `${svc.id}-${offerId}@podium.app`
    const summary = `${project.name} - ${instrument.name} ${position.chair_number}`

    ics += `BEGIN:VEVENT
UID:${uid}
DTSTAMP:${formatICSDate(now)}
DTSTART:${formatICSDate(startDate)}
DTEND:${formatICSDate(endDate)}
SUMMARY:${escapeICSText(summary)}
LOCATION:${escapeICSText(location)}
DESCRIPTION:${escapeICSText(descParts.join('\\n'))}
STATUS:CONFIRMED
END:VEVENT
`
  }

  ics += 'END:VCALENDAR'

  // Return as downloadable file
  const filename = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_schedule.ics`

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
