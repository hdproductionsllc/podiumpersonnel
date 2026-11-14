import { GET as getBookManifest } from '@/app/api/intake/[projectId]/book/route'
import { BOOK_NOTES, getBookBlockers } from '@/lib/intake/book-completeness'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

    // The file bytes were already uploaded directly to Supabase Storage by the
    // browser (via a signed URL) to dodge Vercel's ~4.5MB serverless body cap.
    // This call only records the metadata.
    const body = await request.json().catch(() => null)
    const storagePath = body?.storagePath as string | undefined
    const fileName = body?.fileName as string | undefined
    const scope = (body?.scope as string) || 'all'
    const instrumentIds = Array.isArray(body?.instrumentIds)
      ? (body.instrumentIds as string[])
      : null
    const notes = (body?.notes as string | null) ?? null

    if (!storagePath || !fileName) {
      return NextResponse.json({ error: 'storagePath and fileName are required' }, { status: 400 })
    }

    // Recheck at publication time, not just when a browser cached its approval.
    // Ordinary manually uploaded project files remain unaffected.
    if (notes === BOOK_NOTES) {
      const manifestResponse = await getBookManifest(request, { params: Promise.resolve({ projectId }) })
      if (!manifestResponse.ok) return manifestResponse
      const blockers = getBookBlockers(await manifestResponse.json())
      if (blockers.length) return NextResponse.json({ error: `Books are incomplete. ${blockers.join(' ')}` }, { status: 409 })
      const { data: intake, error: approvalError } = await supabase.from('intakes')
        .select('books_approved_at').eq('project_id', projectId)
        .eq('organization_id', membership.organization_id).maybeSingle()
      if (approvalError || !intake?.books_approved_at) {
        return NextResponse.json({ error: 'Approve the complete books before publishing them.' }, { status: 409 })
      }
    }

    // Security: the path must live under this org + project, and be the .pdf we minted.
    const expectedPrefix = `${membership.organization_id}/${projectId}/`
    if (!storagePath.startsWith(expectedPrefix) || !storagePath.endsWith('.pdf')) {
      return NextResponse.json({ error: 'Invalid storage path' }, { status: 400 })
    }

    // Verify the object actually exists and read its authoritative size (no orphan
    // rows, and the client can't lie about file_size). Admin client bypasses RLS.
    const admin = createAdminClient()
    const folder = storagePath.slice(0, storagePath.lastIndexOf('/'))
    const objectName = storagePath.slice(storagePath.lastIndexOf('/') + 1)
    const { data: listed, error: listError } = await admin.storage
      .from('project-files')
      .list(folder, { search: objectName })

    const storedObject = listed?.find((o) => o.name === objectName)
    if (listError || !storedObject) {
      console.error('Uploaded object not found in storage:', listError)
      return NextResponse.json({ error: 'Upload not found — please try again' }, { status: 400 })
    }

    const fileSize = (storedObject.metadata?.size as number | undefined) ?? 0

    // Create project_files row
    const { data: fileRecord, error: insertError } = await supabase
      .from('project_files')
      .insert({
        project_id: projectId,
        organization_id: membership.organization_id,
        file_name: fileName,
        storage_path: storagePath,
        file_size: fileSize,
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
    if (scope === 'assigned' && instrumentIds) {
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
