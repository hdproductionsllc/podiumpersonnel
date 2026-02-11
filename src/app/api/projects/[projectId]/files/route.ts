import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: files, error } = await supabase
      .from('project_files')
      .select(`
        id,
        file_name,
        file_size,
        scope,
        uploaded_at,
        notes,
        project_file_instruments(
          instrument_id,
          instrument:instruments(id, name)
        )
      `)
      .eq('project_id', projectId)
      .order('uploaded_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch project files:', error)
      return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 })
    }

    return NextResponse.json({ files: files || [] })
  } catch (error) {
    console.error('Failed to fetch project files:', error)
    return NextResponse.json(
      { error: 'Failed to fetch files' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify admin/owner
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role, organization_id')
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Verify project belongs to this org
    const { data: project } = await supabase
      .from('projects')
      .select('id, organization_id')
      .eq('id', projectId)
      .eq('organization_id', membership.organization_id)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const scope = (formData.get('scope') as string) || 'all'
    const instrumentIdsRaw = formData.get('instrumentIds') as string | null
    const notes = formData.get('notes') as string | null

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    // Validate PDF
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 })
    }

    // Validate size (40MB)
    if (file.size > 40 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 40MB' }, { status: 400 })
    }

    // Upload to Supabase Storage
    const fileId = crypto.randomUUID()
    const storagePath = `${membership.organization_id}/${projectId}/${fileId}.pdf`

    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('project-files')
      .upload(storagePath, arrayBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      })

    if (uploadError) {
      console.error('Storage upload failed:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    // Create project_files row
    const { data: fileRecord, error: insertError } = await supabase
      .from('project_files')
      .insert({
        project_id: projectId,
        organization_id: membership.organization_id,
        file_name: file.name,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: 'application/pdf',
        scope,
        uploaded_by: user.id,
        notes: notes || null,
      })
      .select('id, file_name, file_size, scope, uploaded_at, notes')
      .single()

    if (insertError || !fileRecord) {
      console.error('Failed to create file record:', insertError)
      // Clean up uploaded file
      await supabase.storage.from('project-files').remove([storagePath])
      return NextResponse.json({ error: 'Failed to save file record' }, { status: 500 })
    }

    // If scope is 'assigned', create instrument assignments
    let instruments: { instrument_id: string; instrument: { id: string; name: string } }[] = []
    if (scope === 'assigned' && instrumentIdsRaw) {
      const instrumentIds = JSON.parse(instrumentIdsRaw) as string[]
      if (instrumentIds.length > 0) {
        const { data: instrRecords, error: instrError } = await supabase
          .from('project_file_instruments')
          .insert(
            instrumentIds.map((instId) => ({
              file_id: fileRecord.id,
              instrument_id: instId,
            }))
          )
          .select('instrument_id, instrument:instruments(id, name)')

        if (instrError) {
          console.error('Failed to create instrument assignments:', instrError)
        } else {
          instruments = instrRecords as any
        }
      }
    }

    return NextResponse.json({
      file: {
        ...fileRecord,
        project_file_instruments: instruments,
      },
    })
  } catch (error) {
    console.error('Failed to upload file:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload file' },
      { status: 500 }
    )
  }
}
