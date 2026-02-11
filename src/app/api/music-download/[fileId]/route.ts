import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params
    const token = request.nextUrl.searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Look up the confirmation by token
    const { data: confirmation, error: confError } = await supabase
      .from('music_confirmations')
      .select('id, musician_id, send_id')
      .eq('token', token)
      .single()

    if (confError || !confirmation) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
    }

    // Get the send record to find the project
    const { data: send } = await supabase
      .from('music_sends')
      .select('project_id')
      .eq('id', confirmation.send_id)
      .single()

    if (!send) {
      return NextResponse.json({ error: 'Send record not found' }, { status: 404 })
    }

    // Get the file record
    const { data: fileRecord } = await supabase
      .from('project_files')
      .select('id, storage_path, file_name, project_id, scope, project_file_instruments(instrument_id)')
      .eq('id', fileId)
      .single()

    if (!fileRecord) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Verify file belongs to the same project
    if (fileRecord.project_id !== send.project_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get musician's instrument for this project
    const { data: position } = await supabase
      .from('project_positions')
      .select('instrument_id')
      .eq('project_id', send.project_id)
      .eq('musician_id', confirmation.musician_id)
      .eq('status', 'confirmed')
      .limit(1)
      .maybeSingle()

    if (!position) {
      return NextResponse.json({ error: 'No confirmed position found' }, { status: 403 })
    }

    // Verify instrument scope
    if (fileRecord.scope === 'assigned') {
      const assignedInstrumentIds = ((fileRecord as any).project_file_instruments || []).map(
        (fi: any) => fi.instrument_id
      )
      if (!assignedInstrumentIds.includes(position.instrument_id)) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    // Track download
    await supabase
      .from('project_file_downloads')
      .insert({
        file_id: fileId,
        musician_id: confirmation.musician_id,
      })

    // Generate signed URL (1 hour)
    const { data: signedUrl, error: signError } = await supabase.storage
      .from('project-files')
      .createSignedUrl(fileRecord.storage_path, 3600, {
        download: fileRecord.file_name,
      })

    if (signError || !signedUrl) {
      console.error('Failed to create signed URL:', signError)
      return NextResponse.json({ error: 'Failed to generate download link' }, { status: 500 })
    }

    // Redirect to the signed URL
    return NextResponse.redirect(signedUrl.signedUrl)
  } catch (error) {
    console.error('Music download error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
