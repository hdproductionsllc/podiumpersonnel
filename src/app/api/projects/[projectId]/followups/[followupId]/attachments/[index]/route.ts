import { NextResponse } from 'next/server'
import { requireOrgAdmin, serverError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import type { ImageAttachment } from '@/lib/gig-followups/validation'

export async function GET(_request: Request, context: { params: Promise<{ projectId: string; followupId: string; index: string }> }) {
  try {
    const auth = await requireOrgAdmin()
    if (auth.error || !auth.membership) return auth.error!
    const { projectId, followupId, index } = await context.params
    if (!/^[0-2]$/.test(index)) return new NextResponse('Not found', { status: 404 })
    const { data, error } = await createServiceClient().from('gig_followups').select('attachments')
      .eq('id', followupId).eq('project_id', projectId).eq('organization_id', auth.membership.organization_id).maybeSingle()
    if (error) throw error
    const image = (data?.attachments as ImageAttachment[] | undefined)?.[Number(index)]
    if (!image) return new NextResponse('Not found', { status: 404 })
    return new NextResponse(new Uint8Array(Buffer.from(image.content, 'base64')), { headers: {
      'Content-Type': image.contentType,
      'Content-Disposition': `attachment; filename="${image.filename.replace(/[^a-zA-Z0-9 ._-]/g, '_')}"`,
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
    } })
  } catch (error) { return serverError('Read private follow-up attachment', error) }
}
