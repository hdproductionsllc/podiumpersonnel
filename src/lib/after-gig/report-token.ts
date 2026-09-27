/**
 * Resolve a gig report token (089) into the one report it opens.
 *
 * The token IS the credential — the lead musician has no account — so this is
 * the whole authorization step, and everything downstream takes its org,
 * project and musician from what this returns, never from the request.
 *
 * Every failure (malformed token, unknown token, cancelled project) returns
 * null, and every caller turns null into the same plain 404, so the response
 * never confirms that a guessed token was once real.
 *
 * Runs on the service client: there is no session, and gig_reports has no anon
 * RLS policy by design (see 089).
 */

import { createServiceClient } from '@/lib/supabase/server'

export interface GigReportContext {
  reportId: string
  organizationId: string
  projectId: string
  musicianId: string
  openedAt: string | null
  submittedAt: string | null
  leadFirstName: string
  leadName: string
  projectName: string
  organizationName: string
  timezone: string | null
  services: { name: string | null; start_time: string; end_time: string | null }[]
  branding: { logoUrl: string | null; brandColor: string | null; footerText: string | null }
}

export async function resolveGigReportToken(token: string): Promise<GigReportContext | null> {
  // Our tokens are 64 hex chars (randomBytes(32).toString('hex')).
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null

  const service = createServiceClient()
  const { data, error } = await service
    .from('gig_reports')
    .select(`
      id,
      organization_id,
      project_id,
      musician_id,
      opened_at,
      submitted_at,
      musician:musicians(first_name, last_name),
      project:projects(
        name,
        status,
        services(name, start_time, end_time),
        organization:organizations(name, timezone, email_logo_url, email_brand_color, email_footer_text)
      )
    `)
    .eq('token', token)
    .maybeSingle()

  if (error || !data) return null

  const musician = data.musician as unknown as { first_name: string | null; last_name: string | null } | null
  const project = data.project as unknown as {
    name: string
    status: string
    services: { name: string | null; start_time: string; end_time: string | null }[] | null
    organization: {
      name: string
      timezone: string | null
      email_logo_url: string | null
      email_brand_color: string | null
      email_footer_text: string | null
    } | null
  } | null
  if (!project || project.status === 'cancelled') return null

  const services = [...(project.services || [])].sort((a, b) => a.start_time.localeCompare(b.start_time))

  return {
    reportId: data.id,
    organizationId: data.organization_id,
    projectId: data.project_id,
    musicianId: data.musician_id,
    openedAt: data.opened_at,
    submittedAt: data.submitted_at,
    leadFirstName: musician?.first_name || '',
    leadName: [musician?.first_name, musician?.last_name].filter(Boolean).join(' ') || 'Your lead',
    projectName: project.name,
    organizationName: project.organization?.name || '',
    timezone: project.organization?.timezone || null,
    services,
    branding: {
      logoUrl: project.organization?.email_logo_url || null,
      brandColor: project.organization?.email_brand_color || null,
      footerText: project.organization?.email_footer_text || null,
    },
  }
}
