import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Mints a short-lived signed URL so the browser can upload a PDF directly to
// Supabase Storage, bypassing Vercel's ~4.5MB serverless request-body limit.
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
      .select('id')
      .eq('id', projectId)
      .eq('organization_id', membership.organization_id)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    const fileName = body?.fileName as string | undefined
    const fileSize = body?.fileSize as number | undefined
    const mimeType = body?.mimeType as string | undefined

    if (!fileName || typeof fileSize !== 'number') {
      return NextResponse.json({ error: 'fileName and fileSize are required' }, { status: 400 })
    }

    // Validate PDF
    if (mimeType !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 })
    }

    // Validate size (40MB)
    if (fileSize <= 0 || fileSize > 40 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be between 0 and 40MB' }, { status: 400 })
    }

    const fileId = crypto.randomUUID()
    const storagePath = `${membership.organization_id}/${projectId}/${fileId}.pdf`

    // Service-role client mints the signed upload token (avoids storage RLS surprises;
    // access is already authorized above, and the path is scoped to this org/project).
    const admin = createAdminClient()
    const { data, error } = await admin.storage
      .from('project-files')
      .createSignedUploadUrl(storagePath)

    if (error || !data) {
      console.error('Failed to create signed upload URL:', error)
      return NextResponse.json({ error: 'Failed to prepare upload' }, { status: 500 })
    }

    return NextResponse.json({ token: data.token, path: storagePath })
  } catch (error) {
    console.error('Failed to create signed upload URL:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to prepare upload' },
      { status: 500 }
    )
  }
}
