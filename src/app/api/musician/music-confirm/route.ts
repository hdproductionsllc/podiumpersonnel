import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const serviceClient = createServiceClient()

    const body = await request.json()
    const { token } = body

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    // Find the confirmation record
    const { data: confirmation, error: confError } = await serviceClient
      .from('music_confirmations')
      .select('id, musician_id, confirmed_at, send_id')
      .eq('token', token)
      .single()

    if (confError || !confirmation) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
    }

    if (confirmation.confirmed_at) {
      return NextResponse.json({ success: true, alreadyConfirmed: true })
    }

    // Get the send record to find the project
    const { data: send } = await serviceClient
      .from('music_sends')
      .select('project_id')
      .eq('id', confirmation.send_id)
      .single()

    if (!send) {
      return NextResponse.json({ error: 'Send record not found' }, { status: 404 })
    }

    // Get all files for this project that this musician should have access to
    const { data: position } = await serviceClient
      .from('project_positions')
      .select('instrument_id')
      .eq('project_id', send.project_id)
      .eq('musician_id', confirmation.musician_id)
      .eq('status', 'confirmed')
      .limit(1)
      .maybeSingle()

    if (!position) {
      return NextResponse.json({ error: 'No confirmed position found' }, { status: 400 })
    }

    // Get files this musician should have
    const { data: files } = await serviceClient
      .from('project_files')
      .select('id, scope, project_file_instruments(instrument_id)')
      .eq('project_id', send.project_id)

    const musicianFileIds = (files || [])
      .filter((f: any) => {
        if (f.scope === 'all') return true
        if (f.scope === 'assigned') {
          return (f.project_file_instruments || []).some(
            (fi: any) => fi.instrument_id === position.instrument_id
          )
        }
        return false
      })
      .map((f: any) => f.id)

    // Check all files have been downloaded
    if (musicianFileIds.length > 0) {
      const { data: downloads } = await serviceClient
        .from('project_file_downloads')
        .select('file_id')
        .in('file_id', musicianFileIds)
        .eq('musician_id', confirmation.musician_id)

      const downloadedFileIds = new Set((downloads || []).map((d) => d.file_id))
      const allDownloaded = musicianFileIds.every((id: string) => downloadedFileIds.has(id))

      if (!allDownloaded) {
        return NextResponse.json(
          { error: 'Please download all files before confirming' },
          { status: 400 }
        )
      }
    }

    // Confirm
    const { error: updateError } = await serviceClient
      .from('music_confirmations')
      .update({ confirmed_at: new Date().toISOString() })
      .eq('id', confirmation.id)

    if (updateError) {
      console.error('Failed to confirm music receipt:', updateError)
      return NextResponse.json({ error: 'Failed to confirm' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to confirm music receipt:', error)
    return NextResponse.json(
      { error: 'Failed to confirm' },
      { status: 500 }
    )
  }
}
