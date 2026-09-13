import { NextRequest, NextResponse } from 'next/server'
import { notifyOps, requireCronAuth, withCronRetry } from '@/lib/cron'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized

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
    console.error('Keepalive ping failed:', error)
    await notifyOps('keepalive', error)
    return NextResponse.json({ error: 'Ping failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, pingedAt: new Date().toISOString() })
}
