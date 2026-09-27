/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { cronDisabledResponse, requireCronAuth, runCronJob, withCronRetry } from '@/lib/cron'
import { gigEndedAt, isAfterGigDue } from '@/lib/after-gig/rules'
import { AFTER_GIG_PROJECT_SELECT, requestGigReports, sendPaySummaryOnce } from '@/lib/after-gig/run'
import { shiftDate } from '@/lib/projects/archive'

/**
 * After the gig (every 15 minutes, see vercel.json): for each project whose
 * last service ended between 30 minutes and 48 hours ago, email the owners and
 * admins what to pay each person, and ask the lead musician(s) for a gig
 * report. Both sends are idempotent (see lib/after-gig/run.ts), so a project is
 * picked up on every run in its window but acted on once.
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized

  const disabled = cronDisabledResponse('after-gig')
  if (disabled) return disabled

  return runCronJob('after-gig', async () => {
    const supabase = createServiceClient()
    const now = new Date()

    // Date pre-filter only (end_date is a calendar date); the real test is the
    // services' end_time below. Three days back covers the 48-hour window in
    // any time zone, one day ahead covers zones already past midnight UTC.
    const utcToday = now.toISOString().slice(0, 10)
    const { data: projects, error } = await withCronRetry(
      'after-gig: read recently ended projects',
      () => supabase
        .from('projects')
        .select(AFTER_GIG_PROJECT_SELECT)
        .in('status', ['active', 'completed'])
        .gte('end_date', shiftDate(utcToday, -3))
        .lte('end_date', shiftDate(utcToday, 1)),
    )
    if (error) throw error

    let summaries = 0
    let reportRequests = 0
    let failures = 0

    for (const project of (projects || []) as any[]) {
      if (!isAfterGigDue(gigEndedAt(project.services), now)) continue

      const pay = await sendPaySummaryOnce(supabase, project)
      if (pay === 'sent' || pay === 'suppressed') summaries++
      if (pay === 'failed') failures++

      const outcomes = await requestGigReports(supabase, project)
      reportRequests += outcomes.filter((o) => o.outcome === 'sent' || o.outcome === 'suppressed').length
      failures += outcomes.filter((o) => o.outcome === 'failed').length
    }

    if (summaries || reportRequests || failures) {
      console.log(`After-gig cron: ${summaries} pay summaries, ${reportRequests} report requests, ${failures} failed`)
    }
    return NextResponse.json({ paySummaries: summaries, reportRequests, failures })
  })
}
