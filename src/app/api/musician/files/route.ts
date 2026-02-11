import { NextResponse } from 'next/server'
import { createClient, createServiceClient, resolveMusicianIds } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const serviceClient = createServiceClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Support impersonation
    const url = new URL(request.url)
    const impersonateId = url.searchParams.get('impersonate')

    const { musicianIds, error: resolveError } = await resolveMusicianIds(
      supabase, user.id, impersonateId || undefined
    )

    if (resolveError || musicianIds.length === 0) {
      return NextResponse.json({ error: 'No musician records found' }, { status: 404 })
    }

    // Get confirmed positions for these musicians (use serviceClient to bypass RLS)
    const { data: confirmedPositions } = await serviceClient
      .from('project_positions')
      .select(`
        id,
        project_id,
        instrument_id,
        musician_id,
        instrument:instruments(id, name),
        project:projects(
          id,
          name,
          start_date,
          end_date,
          organization:organizations(id, name)
        )
      `)
      .in('musician_id', musicianIds)
      .eq('status', 'confirmed')

    if (!confirmedPositions || confirmedPositions.length === 0) {
      return NextResponse.json({ projects: [] })
    }

    // Get project IDs
    const projectIds = [...new Set(confirmedPositions.map((p: any) => p.project_id))]

    // Get all files for these projects (use serviceClient to bypass RLS)
    const { data: allFiles } = await serviceClient
      .from('project_files')
      .select(`
        id,
        project_id,
        file_name,
        file_size,
        scope,
        uploaded_at,
        project_file_instruments(instrument_id)
      `)
      .in('project_id', projectIds)
      .order('uploaded_at', { ascending: false })

    // Get download history for these musicians
    const fileIds = (allFiles || []).map((f) => f.id)
    let downloadedFileIds = new Set<string>()

    if (fileIds.length > 0) {
      const { data: downloads } = await serviceClient
        .from('project_file_downloads')
        .select('file_id')
        .in('file_id', fileIds)
        .in('musician_id', musicianIds)

      if (downloads) {
        downloadedFileIds = new Set(downloads.map((d) => d.file_id))
      }
    }

    // Get music confirmation status
    const { data: musicSends } = await serviceClient
      .from('music_sends')
      .select('id, project_id')
      .in('project_id', projectIds)
      .order('sent_at', { ascending: false })

    const sendIds = (musicSends || []).map((s) => s.id)
    let confirmationsByProject: Record<string, { token: string; confirmed_at: string | null }> = {}

    if (sendIds.length > 0) {
      const { data: confirmations } = await serviceClient
        .from('music_confirmations')
        .select('send_id, token, confirmed_at, musician_id')
        .in('send_id', sendIds)
        .in('musician_id', musicianIds)

      if (confirmations) {
        for (const conf of confirmations) {
          const send = musicSends!.find((s) => s.id === conf.send_id)
          if (send) {
            confirmationsByProject[send.project_id] = {
              token: conf.token,
              confirmed_at: conf.confirmed_at,
            }
          }
        }
      }
    }

    // Group files by project, filtered to what this musician should see
    const projectsWithFiles = projectIds.map((projectId) => {
      const position = confirmedPositions.find((p: any) => p.project_id === projectId)
      if (!position) return null

      const instrumentId = position.instrument_id
      const projectFiles = (allFiles || [])
        .filter((f: any) => {
          if (f.project_id !== projectId) return false
          if (f.scope === 'all') return true
          if (f.scope === 'assigned') {
            return (f.project_file_instruments || []).some(
              (fi: any) => fi.instrument_id === instrumentId
            )
          }
          return false
        })
        .map((f: any) => ({
          id: f.id,
          file_name: f.file_name,
          file_size: f.file_size,
          uploaded_at: f.uploaded_at,
          downloaded: downloadedFileIds.has(f.id),
        }))

      if (projectFiles.length === 0) return null

      const project = position.project as any
      const confirmation = confirmationsByProject[projectId]

      return {
        projectId,
        projectName: project?.name || 'Unknown Project',
        startDate: project?.start_date || null,
        endDate: project?.end_date || null,
        organizationName: project?.organization?.name || '',
        musicianId: position.musician_id,
        files: projectFiles,
        confirmation: confirmation || null,
      }
    }).filter(Boolean)

    return NextResponse.json({ projects: projectsWithFiles })
  } catch (error) {
    console.error('Failed to fetch musician files:', error)
    return NextResponse.json(
      { error: 'Failed to fetch files' },
      { status: 500 }
    )
  }
}
