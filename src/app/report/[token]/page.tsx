import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveGigReportToken } from '@/lib/after-gig/report-token'
import { GigReportClient } from '@/components/gig/gig-report-client'
import { DEFAULT_TIMEZONE } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Gig report',
  robots: { index: false, follow: false },
}

interface GigReportPageProps {
  params: Promise<{ token: string }>
}

export default async function GigReportPage({ params }: GigReportPageProps) {
  const { token } = await params
  const report = await resolveGigReportToken(token)
  if (!report) notFound()

  // First visit: note it, so the admin can tell "opened, not sent" from "never opened".
  if (!report.openedAt) {
    await createServiceClient()
      .from('gig_reports')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', report.reportId)
      .is('opened_at', null)
  }

  const timezone = report.timezone || DEFAULT_TIMEZONE
  const first = report.services[0]
  const gigDate = first
    ? new Date(first.start_time).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: timezone,
      })
    : ''

  return (
    <GigReportClient
      token={token}
      leadFirstName={report.leadFirstName}
      organizationName={report.organizationName}
      projectName={report.projectName}
      gigDate={gigDate}
      alreadySubmitted={!!report.submittedAt}
      brandColor={report.branding.brandColor}
    />
  )
}
