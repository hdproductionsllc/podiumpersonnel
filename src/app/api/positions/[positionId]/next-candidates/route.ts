import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getNextCandidates } from '@/lib/next-candidate'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ positionId: string }> }
) {
  const { positionId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { candidates, totalAvailable } = await getNextCandidates(supabase, positionId, 2)

  return NextResponse.json({
    candidates,
    total_available: totalAvailable,
  })
}
