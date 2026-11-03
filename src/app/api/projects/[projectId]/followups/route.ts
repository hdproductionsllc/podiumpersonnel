import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { requireOrgPlan, serverError } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { canUseEmailFeatures } from '@/lib/plan'
import { followupSchema, readBoundedJson } from '@/lib/gig-followups/validation'
import { normalizeImages } from '@/lib/gig-followups/images'
import { deliverFollowup } from '@/lib/gig-followups/deliver'

export const runtime = 'nodejs'
export const maxDuration = 300
type Context = { params: Promise<{ projectId: string }> }

async function authorize(projectId: string) {
  const auth = await requireOrgPlan()
  if (auth.error || !auth.membership || !auth.user) return { error: auth.error! }
  if (!auth.plan || !canUseEmailFeatures(auth.plan)) return { error: NextResponse.json({ error: 'Follow-ups require a Pro subscription' }, { status: 403 }) }
  const db = createServiceClient()
  const { data: project, error } = await db.from('projects').select('id,name').eq('id', projectId).eq('organization_id', auth.membership.organization_id).maybeSingle()
  if (error) throw error
  if (!project) return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) }
  return { db, project, organizationId: auth.membership.organization_id, userId: auth.user.id }
}

export async function GET(_request: Request, context: Context) {
  try {
    const { projectId } = await context.params
    const auth = await authorize(projectId)
    if ('error' in auth) return auth.error
    const { db, organizationId } = auth
    const [roster, history] = await Promise.all([
      db.from('project_positions').select('musician:musicians(id,first_name,last_name,email,organization_id)').eq('project_id', projectId).eq('status', 'confirmed').not('musician_id', 'is', null),
      db.from('gig_followups').select('id,mode,subject,message,attachment_names,created_at,status,started_at,gig_followup_recipients(musician_id,recipient_name,status)').eq('project_id', projectId).eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(10),
    ])
    if (roster.error || history.error) throw roster.error || history.error
    const recipients = new Map<string, { id: string; name: string; email: string | null }>()
    for (const row of roster.data ?? []) {
      const m = row.musician as unknown as { id: string; first_name: string; last_name: string; email: string | null; organization_id: string } | null
      if (m && m.organization_id === organizationId) recipients.set(m.id, { id: m.id, name: `${m.first_name} ${m.last_name}`, email: m.email })
    }
    return NextResponse.json({ recipients: [...recipients.values()], history: history.data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return serverError('Read gig follow-ups', error) }
}

export async function POST(request: Request, context: Context) {
  try {
    // Reject cross-origin browser sends (in addition to the session and tenant checks).
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
    const { projectId } = await context.params
    const auth = await authorize(projectId)
    if ('error' in auth) return auth.error
    let input
    let attachments
    try {
      input = followupSchema.parse(await readBoundedJson(request))
      attachments = await normalizeImages(input.attachments)
    } catch { return NextResponse.json({ error: 'Check the message and images: up to 3 static PNG, JPEG or WebP files, 750 KB each and 1.5 MB total.' }, { status: 400 }) }
    const { db, organizationId, userId } = auth
    const payload = { mode: input.mode, subject: input.subject, message: input.message, recipientIds: [...input.recipientIds].sort(), attachments }
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
    const { data: id, error } = await db.rpc('prepare_gig_followup', {
      p_id: input.requestId, p_org: organizationId, p_project: projectId, p_actor: userId,
      p_mode: input.mode, p_subject: input.subject, p_message: input.message, p_hash: hash,
      p_attachments: attachments, p_recipient_ids: input.recipientIds,
    })
    if (error) {
      if (error.code === '22023') return NextResponse.json({ error: error.message }, { status: 409 })
      throw error
    }
    await deliverFollowup(db, id, organizationId)
    return NextResponse.json({ id, message: 'Check the per-recipient delivery status below.' })
  } catch (error) { return serverError('Send gig follow-up; check status before retrying', error) }
}
