import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { cronDisabledResponse, requireCronAuth, runCronJob, withCronRetry } from '@/lib/cron'

export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized

  const disabled = cronDisabledResponse('complete-projects')
  if (disabled) return disabled

  return runCronJob('complete-projects', async () => {
    const supabase = createServiceClient()
    const today = new Date().toISOString().split('T')[0]

    // Mark active projects with past end_date as completed
    const { data, error } = await withCronRetry(
      'complete-projects: mark active projects past end_date as completed',
      () => supabase
        .from('projects')
        .update({ status: 'completed' })
        .eq('status', 'active')
        .lt('end_date', today)
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
