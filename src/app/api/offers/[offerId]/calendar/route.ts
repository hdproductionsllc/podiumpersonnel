import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// Parse time strings like "2:15pm", "2:15 PM", "14:15"
function parseTime(timeStr: string): { hours: number; minutes: number } | null {
  // Try 12-hour format: 2:15pm, 2:15 pm, 2:15PM
  const match12 = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i)
  if (match12) {
    let hours = parseInt(match12[1], 10)
    const minutes = parseInt(match12[2], 10)
    const isPM = match12[3].toLowerCase() === 'pm'
    if (isPM && hours !== 12) hours += 12
    if (!isPM && hours === 12) hours = 0
    return { hours, minutes }
  }

  // Try 24-hour format: 14:15
  const match24 = timeStr.match(/(\d{1,2}):(\d{2})(?!\s*(am|pm))/i)
  if (match24) {
    return { hours: parseInt(match24[1], 10), minutes: parseInt(match24[2], 10) }
  }

  return null
}

// Parse time range from description like "2:15-3:15pm", "2:15pm-3:15pm", "Time: 2:15-3:15pm"
function parseTimeRange(description: string): { startTime: { hours: number; minutes: number }; endTime: { hours: number; minutes: number } } | null {
  if (!description) return null

  // Look for time range patterns
  // Pattern: "Time: 2:15-3:15pm" or "2:15-3:15pm" or "2:15pm - 3:15pm"
  const rangeMatch = description.match(/(\d{1,2}:\d{2})\s*(am|pm)?\s*[-–—to]+\s*(\d{1,2}:\d{2})\s*(am|pm)/i)

  if (rangeMatch) {
    const startTimeStr = rangeMatch[1] + (rangeMatch[2] || rangeMatch[4]) // Use end time's am/pm if start doesn't have one
    const endTimeStr = rangeMatch[3] + rangeMatch[4]

    const startTime = parseTime(startTimeStr)
    const endTime = parseTime(endTimeStr)

    if (startTime && endTime) {
      return { startTime, endTime }
    }
  }

  return null
}

// Parse location from description like "Location: Temescal Gateway Park"
function parseLocation(description: string): string | null {
  if (!description) return null

  // Look for "Location:" pattern
  const locMatch = description.match(/Location\s*:\s*([^\n]+?)(?:\s+Time:|$)/i)
  if (locMatch) {
    return locMatch[1].trim()
  }

  return null
}

function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function formatGoogleDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z/, 'Z')
}

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function buildGoogleCalendarUrl(params: {
  title: string
  startDate: Date
  endDate: Date
  description: string
  location?: string
}): string {
  const url = new URL('https://calendar.google.com/calendar/render')
  url.searchParams.set('action', 'TEMPLATE')
  url.searchParams.set('text', params.title)
  url.searchParams.set('dates', `${formatGoogleDate(params.startDate)}/${formatGoogleDate(params.endDate)}`)
  url.searchParams.set('details', params.description)
  if (params.location) {
    url.searchParams.set('location', params.location)
  }
  return url.toString()
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  const { offerId } = await params
  const { searchParams } = new URL(request.url)
  const format = searchParams.get('format')
  const token = searchParams.get('token')

  // Authorization: require either a valid offer token OR authenticated org membership
  const supabase = createServiceClient()

  // Fetch offer with all related data
  const { data: offer, error } = await supabase
    .from('contract_offers')
    .select(`
      id,
      status,
      custom_pay,
      token,
      project_position:project_positions!inner(
        id,
        chair_number,
        instrument:instruments(name),
        project:projects!inner(
          id,
          name,
          description,
          start_date,
          organization_id,
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

  // Validate access: token match OR authenticated org admin
  const position = offer.project_position as any
  const project = position.project
  let authorized = false

  if (token && token === (offer as any).token) {
    authorized = true
  } else {
    // Check if user is authenticated and a member of this org
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (user) {
      const { data: membership } = await authClient
        .from('organization_members')
        .select('id')
        .eq('organization_id', project.organization_id)
        .eq('user_id', user.id)
        .single()
      if (membership) authorized = true
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (offer.status !== 'accepted') {
    return NextResponse.json({ error: 'Offer must be accepted to download calendar' }, { status: 400 })
  }

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

  const isLeader = position.chair_number === 1

  // If no services, try to parse times from project description
  if (!services || services.length === 0) {
    const description = project.description || ''
    const startDateStr = project.start_date

    if (!startDateStr) {
      return NextResponse.json(
        { error: 'No scheduled date found for this project.' },
        { status: 404 }
      )
    }

    // Try to parse time range from description
    const timeRange = parseTimeRange(description)
    const location = parseLocation(description) || ''

    // Create date from start_date
    const eventDate = new Date(startDateStr)

    let startDate: Date
    let endDate: Date

    if (timeRange) {
      // Use parsed times
      startDate = new Date(eventDate)
      startDate.setHours(timeRange.startTime.hours, timeRange.startTime.minutes, 0, 0)

      endDate = new Date(eventDate)
      endDate.setHours(timeRange.endTime.hours, timeRange.endTime.minutes, 0, 0)
    } else {
      // Default to all-day event or 9am-12pm
      startDate = new Date(eventDate)
      startDate.setHours(9, 0, 0, 0)

      endDate = new Date(eventDate)
      endDate.setHours(12, 0, 0, 0)
    }

    const calculatedPay = offer.custom_pay

    // Handle Google Calendar redirect
    if (format === 'google') {
      const descParts = [
        `Position: ${instrument.name}${isLeader ? ' (Leader)' : ''}`,
      ]
      if (calculatedPay != null) {
        descParts.push(`Pay: $${calculatedPay}`)
      }
      if (description) {
        descParts.push(`Details: ${description}`)
      }
      descParts.push(`Organization: ${project.organization.name}`)

      const summary = `${project.name} - ${instrument.name}`

      const googleUrl = buildGoogleCalendarUrl({
        title: summary,
        startDate,
        endDate,
        description: descParts.join('\n'),
        location: location || undefined,
      })
      return NextResponse.redirect(googleUrl)
    }

    // Build ICS for parsed description
    const now = new Date()
    const uid = `${project.id}-${offerId}@podium.app`
    const summary = `${project.name} - ${instrument.name}`

    const descParts = [
      `Position: ${instrument.name}${isLeader ? ' (Leader)' : ''}`,
    ]
    if (calculatedPay != null) {
      descParts.push(`Pay: $${calculatedPay}`)
    }
    if (description) {
      descParts.push(`Details: ${description}`)
    }
    descParts.push(`Organization: ${project.organization.name}`)

    const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Podium Personnel//Calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:${escapeICSText(project.name)}
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${formatICSDate(now)}
DTSTART:${formatICSDate(startDate)}
DTEND:${formatICSDate(endDate)}
SUMMARY:${escapeICSText(summary)}
LOCATION:${escapeICSText(location)}
DESCRIPTION:${escapeICSText(descParts.join('\n'))}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`

    const filename = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_schedule.ics`

    return new NextResponse(ics.replace(/\r?\n/g, '\r\n'), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  // Calculate pay from services
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

  // Handle Google Calendar redirect (uses first service only - Google only supports single events)
  if (format === 'google') {
    const firstSvc = services[0] as any
    const startDate = new Date(firstSvc.start_time)
    const endDate = firstSvc.end_time ? new Date(firstSvc.end_time) : new Date(startDate.getTime() + 3 * 60 * 60 * 1000)

    // Build location string
    let location = firstSvc.venue || ''
    if (firstSvc.venue_details) {
      const v = firstSvc.venue_details
      location = [v.name, v.address, v.city, v.state, v.zip].filter(Boolean).join(', ')
    }

    // Build description
    const descParts = [
      `Position: ${instrument.name} ${position.chair_number}${isLeader ? ' (Leader)' : ''}`,
    ]
    if (calculatedPay != null) {
      descParts.push(`Pay: $${calculatedPay}`)
    }
    if (firstSvc.notes) {
      descParts.push(`Notes: ${firstSvc.notes}`)
    }
    descParts.push(`Organization: ${project.organization.name}`)
    if (services.length > 1) {
      descParts.push(`\nNote: This project has ${services.length} services. Download the .ics file for all events.`)
    }

    const summary = `${project.name} - ${instrument.name} ${position.chair_number}`

    const googleUrl = buildGoogleCalendarUrl({
      title: summary,
      startDate,
      endDate,
      description: descParts.join('\n'),
      location: location || undefined,
    })
    return NextResponse.redirect(googleUrl)
  }

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
DESCRIPTION:${escapeICSText(descParts.join('\n'))}
STATUS:CONFIRMED
END:VEVENT
`
  }

  ics += 'END:VCALENDAR'

  // Return as downloadable file
  const filename = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_schedule.ics`

  return new NextResponse(ics.replace(/\r?\n/g, '\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
