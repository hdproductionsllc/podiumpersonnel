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

    // Get files with their instrument scoping
    const { data: files } = await supabase
      .from('project_files')
      .select('id, scope, project_file_instruments(instrument_id)')
      .eq('project_id', projectId)

    // Get each musician's instrument from their confirmed position
    const musicianIds = (confirmations || []).map((c: any) => c.musician_id)
    let positionsByMusician: Record<string, string> = {} // musician_id -> instrument_id

    if (musicianIds.length > 0) {
      const { data: positions } = await supabase
        .from('project_positions')
        .select('musician_id, instrument_id')
        .eq('project_id', projectId)
        .in('musician_id', musicianIds)
        .eq('status', 'confirmed')

      if (positions) {
        for (const pos of positions) {
          if (pos.musician_id) {
            positionsByMusician[pos.musician_id] = pos.instrument_id
          }
        }
      }
    }

    // Calculate per-musician file count (how many files they should have)
    function getFileCountForMusician(musicianId: string): number {
      const instrumentId = positionsByMusician[musicianId]
      if (!files) return 0
      return files.filter((f: any) => {
        if (f.scope === 'all') return true
        if (f.scope === 'assigned' && instrumentId) {
          return (f.project_file_instruments || []).some(
            (fi: any) => fi.instrument_id === instrumentId
          )
        }
        return false
      }).length
    }

    // Get which files each musician should have access to (for unique download counting)
    function getFileIdsForMusician(musicianId: string): string[] {
      const instrumentId = positionsByMusician[musicianId]
      if (!files) return []
      return files
        .filter((f: any) => {
          if (f.scope === 'all') return true
          if (f.scope === 'assigned' && instrumentId) {
            return (f.project_file_instruments || []).some(
              (fi: any) => fi.instrument_id === instrumentId
            )
          }
          return false
        })
        .map((f: any) => f.id)
    }

    // Get download records
    const fileIds = (files || []).map((f: any) => f.id)
    let downloadsByMusician: Record<string, Set<string>> = {} // musician_id -> set of downloaded file_ids

    if (fileIds.length > 0) {
      const { data: downloads } = await supabase
        .from('project_file_downloads')
        .select('musician_id, file_id')
        .in('file_id', fileIds)

      if (downloads) {
        for (const dl of downloads) {
          if (!downloadsByMusician[dl.musician_id]) {
            downloadsByMusician[dl.musician_id] = new Set()
          }
          downloadsByMusician[dl.musician_id].add(dl.file_id)
        }
      }
    }

    return NextResponse.json({
      sendId: latestSend.id,
      sentAt: latestSend.sent_at,
      musicianCount: latestSend.musician_count,
      notes: latestSend.notes || null,
      confirmations: (confirmations || []).map((c: any) => {
        const musicianFileIds = getFileIdsForMusician(c.musician_id)
        const downloadedSet = downloadsByMusician[c.musician_id] || new Set()
        // Only count downloads of files this musician actually has access to
        const downloadCount = musicianFileIds.filter((id) => downloadedSet.has(id)).length

        return {
          ...c,
          totalFiles: getFileCountForMusician(c.musician_id),
          downloadCount,
        }
      }),
    })
  } catch (error) {
    console.error('Failed to fetch music status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch status' },
      { status: 500 }
    )
  }
}
