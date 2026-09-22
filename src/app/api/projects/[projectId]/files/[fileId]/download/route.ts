import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createSignedDownloadUrl } from '@/lib/storage/signed-download'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; fileId: string }> }
) {
  try {
    const { projectId, fileId } = await params
    const supabase = await createClient()
    const serviceClient = createServiceClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user belongs to the org that owns this project
    const { data: project } = await supabase
      .from('projects')
      .select('organization_id')
      .eq('id', projectId)
      .single()

    if (project) {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', project.organization_id)
        .eq('user_id', user.id)
        .single()

      if (!membership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Get file record
    const { data: fileRecord, error: fetchError } = await supabase
      .from('project_files')
      .select('id, storage_path, file_name')
      .eq('id', fileId)
      .eq('project_id', projectId)
      .single()

    if (fetchError || !fileRecord) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Track download if musicianId provided
    let body: { musicianId?: string } = {}
    try {
      body = await request.json()
    } catch {
      // No body — that's fine
    }

    if (body.musicianId) {
      const { error: trackError } = await serviceClient
        .from('project_file_downloads')
        .insert({
          file_id: fileId,
          musician_id: body.musicianId,
        })

      if (trackError) {
        // Best effort — the download link is still issued.
        console.error(`Failed to record download of file ${fileId} by musician ${body.musicianId}:`, trackError)
      }
    }

    // Generate signed URL (1 hour). The filename is attached by the helper —
    // the client's own `download` option drops everything after an "&".
    const { url, error: signError } = await createSignedDownloadUrl(
      supabase.storage.from('project-files'),
      fileRecord.storage_path,
      fileRecord.file_name,
      3600
    )

    if (signError || !url) {
      console.error('Failed to create signed URL:', signError)
      return NextResponse.json({ error: 'Failed to generate download link' }, { status: 500 })
    }

    return NextResponse.json({ url })
  } catch (error) {
    console.error('Failed to generate download URL:', error)
    return NextResponse.json(
      { error: 'Failed to generate download link' },
      { status: 500 }
    )
  }
}
