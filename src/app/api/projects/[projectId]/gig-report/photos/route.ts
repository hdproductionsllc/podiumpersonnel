import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { PHOTO_BUCKET, photoPrefix } from '@/lib/after-gig/photos'

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const service = createServiceClient()
  const { data: project } = await service.from('projects').select('organization_id').eq('id', projectId).maybeSingle()
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: member } = await session.from('organization_members').select('role').eq('user_id', user.id).eq('organization_id', project.organization_id).maybeSingle()
  if (!member || !['owner', 'admin'].includes(member.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data: reports, error } = await service.from('gig_reports').select('id').eq('project_id', projectId).eq('organization_id', project.organization_id)
  if (error) return NextResponse.json({ error: 'Could not load photos. Please retry.' }, { status: 503 })
  const bucket = service.storage.from(PHOTO_BUCKET)
  const photos: { url: string; reportId: string }[] = []
  for (const report of reports || []) {
    const prefix = photoPrefix({ organizationId: project.organization_id, projectId, reportId: report.id })
    const { data: files, error: listError } = await bucket.list(prefix, { limit: 100 })
    if (listError) return NextResponse.json({ error: 'Could not load photos. Please retry.' }, { status: 503 })
    const paths = (files || []).filter(file => /^[a-f0-9]{64}\.jpg$/.test(file.name)).map(file => `${prefix}/${file.name}`)
    if (!paths.length) continue
    const { data: signed, error: signError } = await bucket.createSignedUrls(paths, 300)
    if (signError || signed?.some(file => file.error)) return NextResponse.json({ error: 'Could not open photos. Please retry.' }, { status: 503 })
    for (const file of signed || []) if (file.signedUrl) photos.push({ url: file.signedUrl, reportId: report.id })
  }
  return NextResponse.json({ photos }, { headers: { 'Cache-Control': 'private, no-store' } })
}
