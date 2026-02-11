import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; fileId: string }> }
) {
  try {
    const { projectId, fileId } = await params
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

    // Get the file record to find storage path
    const { data: fileRecord, error: fetchError } = await supabase
      .from('project_files')
      .select('id, storage_path')
      .eq('id', fileId)
      .eq('project_id', projectId)
      .eq('organization_id', membership.organization_id)
      .single()

    if (fetchError || !fileRecord) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('project-files')
      .remove([fileRecord.storage_path])

    if (storageError) {
      console.error('Failed to delete from storage:', storageError)
      // Continue with DB deletion even if storage delete fails
    }

    // Delete from DB (cascades to instruments + downloads)
    const { error: deleteError } = await supabase
      .from('project_files')
      .delete()
      .eq('id', fileId)

    if (deleteError) {
      console.error('Failed to delete file record:', deleteError)
      return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete file:', error)
    return NextResponse.json(
      { error: 'Failed to delete file' },
      { status: 500 }
    )
  }
}
