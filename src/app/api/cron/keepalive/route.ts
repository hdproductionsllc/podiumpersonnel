import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized

  const supabase = createServiceClient()

  // Lightweight query to keep Supabase from pausing on free tier
  const { error } = await supabase
    .from('organizations')
    .select('id')
    .limit(1)

  if (error) {
    console.error('Keepalive ping failed:', error)
    return NextResponse.json({ error: 'Ping failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, pingedAt: new Date().toISOString() })
}
