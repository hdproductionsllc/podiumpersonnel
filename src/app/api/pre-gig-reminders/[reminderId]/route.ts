/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_TIMEZONE } from '@/lib/utils'
import { getVenueDisplay } from '@/lib/venue-helpers'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ reminderId: string }> }
) {
  try {
    const { reminderId } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch reminder with project details
    const { data: reminder, error } = await supabase
      .from('pre_gig_reminders')
      .select('*')
      .eq('id', reminderId)
      .single()

    if (error || !reminder) {
      return NextResponse.json({ error: 'Reminder not found' }, { status: 404 })
    }

    // Verify user belongs to this org
    const { data: mem } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', reminder.organization_id)
      .single()

    if (!mem) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fetch full project data for the preview
    const { data: project } = await supabase
      .from('projects')
      .select(`
        id,
        name,
        ensemble_type,
        organization:organizations(
          id,
          name,
          timezone
        ),
        services(
          id,
          name,
          service_type,
          call_time,
          start_time,
          end_time,
          venue,
          venue_id,
          venue_details:venues(name, address, city, state, zip, parking_info, directions)
        ),
        project_positions(
          id,
          chair_number,
          status,
          musician_id,
          instrument:instruments(id, name),
          musician:musicians(id, first_name, last_name, email)
        ),
        gig_detail_sends(id, sent_at, musician_count),
        music_sends(id, sent_at, musician_count)
      `)
      .eq('id', reminder.project_id)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const organization = project.organization as any
    const timezone = organization?.timezone || DEFAULT_TIMEZONE
    const services = (project.services as any[]) || []
    const positions = (project.project_positions as any[]) || []

    const confirmedMusicians = positions.filter(
      (p: any) => p.status === 'confirmed' && p.musician_id && p.musician?.email
    )

    // Format services for display
    const formattedServices = services
      .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .map((service: any) => ({
        name: service.name,
        date: new Date(service.start_time).toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          timeZone: timezone,
        }),
        time: new Date(service.start_time).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: timezone,
        }),
        callTime: service.call_time
          ? new Date(service.call_time).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              timeZone: timezone,
            })
          : null,
        venue: getVenueDisplay(service),
      }))

    // Build roster for preview
    const roster = confirmedMusicians
      .sort((a: any, b: any) => {
        const instrA = a.instrument?.name || ''
        const instrB = b.instrument?.name || ''
        if (instrA !== instrB) return instrA.localeCompare(instrB)
        return (a.chair_number || 0) - (b.chair_number || 0)
      })
      .map((pos: any) => ({
        name: `${pos.musician.first_name} ${pos.musician.last_name}`,
        instrument: pos.instrument?.name || 'Instrument',
      }))

    // Get send history
    const gigDetailSends = (project.gig_detail_sends as any[]) || []
    const musicSends = (project.music_sends as any[]) || []
    const lastGigDetailSend = gigDetailSends.sort((a: any, b: any) =>
      new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
    )[0] || null
    const lastMusicSend = musicSends.sort((a: any, b: any) =>
      new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
    )[0] || null

    return NextResponse.json({
      reminder: {
        id: reminder.id,
        status: reminder.status,
        notes: reminder.notes,
        triggerDate: reminder.trigger_date,
        createdAt: reminder.created_at,
        sentAt: reminder.sent_at,
        musicianCount: reminder.musician_count,
      },
      project: {
        id: project.id,
        name: project.name,
        ensembleType: project.ensemble_type,
      },
      services: formattedServices,
      roster,
      musicianCount: confirmedMusicians.length,
      sendHistory: {
        gigDetails: lastGigDetailSend
          ? { sentAt: lastGigDetailSend.sent_at, musicianCount: lastGigDetailSend.musician_count }
          : null,
        music: lastMusicSend
          ? { sentAt: lastMusicSend.sent_at, musicianCount: lastMusicSend.musician_count }
          : null,
      },
    })
  } catch (error) {
    console.error('Failed to fetch reminder:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch reminder' },
      { status: 500 }
    )
  }
}
