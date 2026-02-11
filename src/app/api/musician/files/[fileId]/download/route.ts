import { NextResponse } from 'next/server'
import { createClient, createServiceClient, resolveMusicianIds } from '@/lib/supabase/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params
    const supabase = await createClient()
    const serviceClient = createServiceClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Support impersonation
    const url = new URL(request.url)
    const impersonateId = url.searchParams.get('impersonate')

    const { musicianIds, error: resolveError } = await resolveMusicianIds(
      supabase, user.id, impersonateId || undefined
    )

    if (resolveError || musicianIds.length === 0) {
      return NextResponse.json({ error: 'No musician records found' }, { status: 404 })
    }

    // Get file record
    const { data: fileRecord, error: fetchError } = await supabase
      .from('project_files')
      .select('id, storage_path, file_name, project_id, scope, project_file_instruments(instrument_id)')
      .eq('id', fileId)
      .single()

    if (fetchError || !fileRecord) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Verify musician has access (confirmed position on this project + correct instrument scope)
    const { data: position } = await supabase
      .from('project_positions')
      .select('id, instrument_id, musician_id')
      .eq('project_id', fileRecord.project_id)
      .in('musician_id', musicianIds)
      .eq('status', 'confirmed')
      .limit(1)
      .maybeSingle()

    if (!position) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Verify instrument scope
    if (fileRecord.scope === 'assigned') {
      const assignedInstrumentIds = (fileRecord.project_file_instruments || []).map(
        (fi: any) => fi.instrument_id
      )
      if (!assignedInstrumentIds.includes(position.instrument_id)) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    // Track download
    await serviceClient
      .from('project_file_downloads')
      .insert({
        file_id: fileId,
        musician_id: position.musician_id,
      })

    // Generate signed URL (1 hour)
    const { data: signedUrl, error: signError } = await supabase.storage
      .from('project-files')
      .createSignedUrl(fileRecord.storage_path, 3600)

    if (signError || !signedUrl) {
      console.error('Failed to create signed URL:', signError)
      return NextResponse.json({ error: 'Failed to generate download link' }, { status: 500 })
    }

    return NextResponse.json({ url: signedUrl.signedUrl })
  } catch (error) {
    console.error('Failed to download file:', error)
    return NextResponse.json(
      { error: 'Failed to download file' },
      { status: 500 }
    )
  }
}
