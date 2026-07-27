import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isWithinServiceArea } from '@/lib/zip-distance'
import { findConflicts, describeConflicts } from '@/lib/schedule-conflict'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const body = await request.json()
  const { bookId, venueZip } = body

  if (!bookId) {
    return NextResponse.json({ error: 'bookId is required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch the book with its entries
  const { data: book, error: bookError } = await supabase
    .from('books')
    .select(`
      id,
      organization_id,
      book_entries(
        id,
        instrument_id,
        chair_number,
        musician_id,
        priority,
        instrument:instruments(id, name, section, sort_order)
      )
    `)
    .eq('id', bookId)
    .single()

  if (bookError || !book) {
    return NextResponse.json({ error: 'Book not found' }, { status: 404 })
  }

  const organizationId = book.organization_id

  // Get all active musicians with their instruments and service area info
  const { data: musicians, error: musError } = await supabase
    .from('musicians')
    .select(`
      id,
      first_name,
      last_name,
      email,
      zip_code,
      service_radius_miles,
      call_order,
      is_leader,
      musician_instruments(instrument_id),
      competing_schedules(id, title, start_time, end_time)
    `)
    .eq('organization_id', organizationId)
    .eq('is_active', true)

  if (musError) {
    return NextResponse.json({ error: musError.message }, { status: 500 })
  }

  // Get services to check for conflicts
  const { data: services } = await supabase
    .from('services')
    .select('id, start_time, end_time')
    .eq('project_id', projectId)

  // Resolve conflicts once for the whole roster. Services are the same for every
  // chair in this project, so there is nothing per-entry to recompute — and this
  // now covers active offers on OTHER projects, not just the outside commitments
  // typed into competing_schedules.
  const externalByMusician = new Map<
    string,
    { title: string; start_time: string; end_time: string }[]
  >()
  for (const musician of (musicians || []) as any[]) {
    if (musician.competing_schedules?.length) {
      externalByMusician.set(musician.id, musician.competing_schedules)
    }
  }

  const conflictsByMusician = await findConflicts(supabase, {
    musicianIds: ((musicians || []) as any[]).map((m) => m.id),
    services: services || [],
    excludeProjectId: projectId,
    externalByMusician,
  })

  // Build suggested positions
  const suggestions: any[] = []

  for (const entry of (book.book_entries as any[]) || []) {
    const instrumentId = entry.instrument_id
    const chairNumber = entry.chair_number || 1
    const isLeaderPosition = chairNumber === 1

    // Find musicians who play this instrument
    const eligibleMusicians = (musicians || []).filter((m: any) =>
      m.musician_instruments?.some((mi: any) => mi.instrument_id === instrumentId)
    )

    // Filter by service area and sort
    const rankedMusicians: any[] = []

    for (const musician of eligibleMusicians) {
      // Check service area
      const inArea = await isWithinServiceArea(
        supabase,
        musician.zip_code,
        venueZip,
        musician.service_radius_miles
      )

      const conflicts = conflictsByMusician.get(musician.id)
      const hasConflict = !!conflicts && conflicts.length > 0
      const conflictReason = describeConflicts(conflicts)

      rankedMusicians.push({
        ...musician,
        in_area: inArea,
        has_conflict: hasConflict,
        conflict_reason: conflictReason,
      })
    }

    // Sort: in-area first, then no-conflict, then leaders for chair 1, then call_order
    rankedMusicians.sort((a, b) => {
      // Prioritize in-area
      if (a.in_area && !b.in_area) return -1
      if (!a.in_area && b.in_area) return 1

      // Then no conflict
      if (!a.has_conflict && b.has_conflict) return -1
      if (a.has_conflict && !b.has_conflict) return 1

      // For chair 1, prioritize leaders
      if (isLeaderPosition) {
        if (a.is_leader && !b.is_leader) return -1
        if (!a.is_leader && b.is_leader) return 1
      }

      // Then by call order
      return (a.call_order ?? 999999) - (b.call_order ?? 999999)
    })

    // Pick top musician (or the one from book entry if specified)
    let suggestedMusician = null
    if (entry.musician_id) {
      // Use the musician from the book entry if they're eligible
      suggestedMusician = rankedMusicians.find(m => m.id === entry.musician_id) || rankedMusicians[0]
    } else {
      suggestedMusician = rankedMusicians[0]
    }

    suggestions.push({
      instrument_id: instrumentId,
      instrument_name: entry.instrument?.name,
      instrument_section: entry.instrument?.section,
      instrument_sort_order: entry.instrument?.sort_order,
      chair_number: chairNumber,
      suggested_musician: suggestedMusician ? {
        id: suggestedMusician.id,
        first_name: suggestedMusician.first_name,
        last_name: suggestedMusician.last_name,
        call_order: suggestedMusician.call_order,
        is_leader: suggestedMusician.is_leader,
        in_area: suggestedMusician.in_area,
        has_conflict: suggestedMusician.has_conflict,
        conflict_reason: suggestedMusician.conflict_reason ?? null,
      } : null,
      alternates: rankedMusicians.slice(1, 4).map(m => ({
        id: m.id,
        first_name: m.first_name,
        last_name: m.last_name,
        call_order: m.call_order,
        is_leader: m.is_leader,
        in_area: m.in_area,
        has_conflict: m.has_conflict,
      })),
    })
  }

  return NextResponse.json({
    suggestions,
    total_positions: suggestions.length,
    filled_positions: suggestions.filter(s => s.suggested_musician).length,
  })
}

// Create positions from suggestions
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const body = await request.json()
  const { positions } = body

  if (!positions || !Array.isArray(positions)) {
    return NextResponse.json({ error: 'positions array is required' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Insert positions
  const positionRecords = positions.map((p: any) => ({
    project_id: projectId,
    instrument_id: p.instrument_id,
    chair_number: p.chair_number,
    musician_id: p.musician_id || null,
    status: p.musician_id ? 'confirmed' : 'vacant',
  }))

  const { data, error } = await supabase
    .from('project_positions')
    .insert(positionRecords)
    .select()

  if (error) {
    console.error('Auto-populate failed:', error)
    return NextResponse.json(
      { error: 'Could not auto-populate positions. Please try again, or contact support if it continues.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    created: data?.length || 0,
    positions: data,
  })
}
