import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  // Mark active projects with past end_date as completed
  const { data, error } = await supabase
    .from('projects')
    .update({ status: 'completed' })
    .eq('status', 'active')
    .lt('end_date', today)
    .select('id, name')

  if (error) {
    console.error('Failed to auto-complete projects:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const count = data?.length || 0
  if (count > 0) {
    console.log(`Cron: auto-completed ${count} projects: ${data!.map(p => p.name).join(', ')}`)
  }

  return NextResponse.json({ completed: count })
}
