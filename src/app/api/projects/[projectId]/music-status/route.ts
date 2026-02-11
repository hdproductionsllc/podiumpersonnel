import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the most recent send for this project
    const { data: latestSend } = await supabase
      .from('music_sends')
      .select('id, sent_at, musician_count, notes')
      .eq('project_id', projectId)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!latestSend) {
      return NextResponse.json({ sendId: null, confirmations: [] })
    }

    // Get confirmations for this send with musician details
    const { data: confirmations } = await supabase
      .from('music_confirmations')
      .select(`
        id,
        musician_id,
        confirmed_at,
        musician:musicians(id, first_name, last_name)
      `)
      .eq('send_id', latestSend.id)

    // Get download counts per musician for this project's files
    const { data: files } = await supabase
      .from('project_files')
      .select('id')
      .eq('project_id', projectId)

    const fileIds = (files || []).map((f) => f.id)
    let downloadsByMusician: Record<string, number> = {}

    if (fileIds.length > 0) {
      const { data: downloads } = await supabase
        .from('project_file_downloads')
        .select('musician_id, file_id')
        .in('file_id', fileIds)

      if (downloads) {
        for (const dl of downloads) {
          // Count unique file downloads per musician
          const key = `${dl.musician_id}-${dl.file_id}`
          if (!downloadsByMusician[dl.musician_id]) {
            downloadsByMusician[dl.musician_id] = 0
          }
          downloadsByMusician[dl.musician_id]++
        }
      }
    }

    return NextResponse.json({
      sendId: latestSend.id,
      sentAt: latestSend.sent_at,
      musicianCount: latestSend.musician_count,
      totalFiles: fileIds.length,
      confirmations: (confirmations || []).map((c: any) => ({
        ...c,
        downloadCount: downloadsByMusician[c.musician_id] || 0,
      })),
    })
  } catch (error) {
    console.error('Failed to fetch music status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch status' },
      { status: 500 }
    )
  }
}
