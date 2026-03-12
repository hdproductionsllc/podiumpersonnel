import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
