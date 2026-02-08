import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: musicianId } = await params
  const supabase = await createClient()

  // Verify the user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get the musician and verify the admin has access to their org
  const { data: musician } = await supabase
    .from('musicians')
    .select('id, w9_file_url, organization_id')
    .eq('id', musicianId)
    .single()

  if (!musician || !musician.w9_file_url) {
    return NextResponse.json({ error: 'W-9 not found' }, { status: 404 })
  }

  // Verify the user is an admin of this musician's organization
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', musician.organization_id)
    .eq('user_id', user.id)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Use admin client to download the file (bypasses storage RLS)
  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from('w9-documents')
    .download(musician.w9_file_url)

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to download file' }, { status: 500 })
  }

  // Determine content type from file extension
  const ext = musician.w9_file_url.split('.').pop()?.toLowerCase()
  const contentType =
    ext === 'pdf' ? 'application/pdf' :
    ext === 'png' ? 'image/png' :
    ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
    'application/octet-stream'

  return new NextResponse(data, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="w9-${musicianId}.${ext}"`,
    },
  })
}
