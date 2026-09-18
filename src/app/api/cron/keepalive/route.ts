import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth, runCronJob, withCronRetry } from '@/lib/cron'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized

  return runCronJob('keepalive', async () => {
    const supabase = createServiceClient()

    // Lightweight query to keep Supabase from pausing on free tier
    const { error } = await withCronRetry(
      'keepalive: ping organizations',
      () => supabase
        .from('organizations')
        .select('id')
        .limit(1),
    )

    if (error) {
      throw error
    }

    return NextResponse.json({ ok: true, pingedAt: new Date().toISOString() })
  })
}
