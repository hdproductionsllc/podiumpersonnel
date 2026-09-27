import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { cronDisabledResponse, requireCronAuth, runCronJob, withCronRetry } from '@/lib/cron'
import { isReadyToComplete } from '@/lib/projects/archive'

export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized

  const disabled = cronDisabledResponse('complete-projects')
  if (disabled) return disabled

  return runCronJob('complete-projects', async () => {
    const supabase = createServiceClient()
    const now = new Date()

    // Candidates: active projects that ended before today in UTC. The real
    // rule (isReadyToComplete) is stricter and per-org — the day after the gig
    // stays active in the org's own time zone — and its cutoff is never later
    // than UTC today, so this pre-filter cannot drop a project that is due.
    const utcToday = now.toISOString().slice(0, 10)
    const { data: candidates, error: readError } = await withCronRetry(
      'complete-projects: read active projects past end_date',
      () => supabase
        .from('projects')
        .select('id, name, end_date, organization:organizations(timezone)')
        .eq('status', 'active')
        .lt('end_date', utcToday),
    )
    if (readError) throw readError

    const due = (candidates || []).filter((p) => {
      const org = p.organization as unknown as { timezone: string | null } | null
      return isReadyToComplete(p.end_date, now, org?.timezone)
    })
    if (due.length === 0) return NextResponse.json({ completed: 0 })

    const { data, error } = await withCronRetry(
      'complete-projects: mark due projects completed',
      () => supabase
        .from('projects')
        .update({ status: 'completed' })
        .in('id', due.map((p) => p.id))
        // Still active: an admin may have changed it since the read.
        .eq('status', 'active')
        .select('id, name'),
    )

    if (error) {
      // Fatal — the whole run failed. Let runCronJob report it once (ops
      // alert + Sentry) and return the generic 500.
      throw error
    }

    const count = data?.length || 0
    if (count > 0) {
      console.log(`Cron: auto-completed ${count} projects: ${data!.map(p => p.name).join(', ')}`)
    }

    return NextResponse.json({ completed: count })
  })
}
