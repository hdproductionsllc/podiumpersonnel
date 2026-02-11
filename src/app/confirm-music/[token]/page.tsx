import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { ConfirmMusicClient } from '@/components/music/confirm-music-client'
import { getAppUrl } from '@/lib/utils'

interface ConfirmMusicPageProps {
  params: Promise<{ token: string }>
}

export default async function ConfirmMusicPage({ params }: ConfirmMusicPageProps) {
  const { token } = await params
  const supabase = createServiceClient()

  // Fetch confirmation record by token
  const { data: confirmation } = await supabase
    .from('music_confirmations')
    .select(`
      id,
      token,
      confirmed_at,
      musician_id,
      musician:musicians(id, first_name, last_name),
      send:music_sends(
        id,
        project_id,
        organization_id,
        project:projects(
          id,
          name,
          organization:organizations(id, name)
        )
      )
    `)
    .eq('token', token)
    .single()

  if (!confirmation) {
    notFound()
  }

  const musician = confirmation.musician as any
  const send = confirmation.send as any
  const project = send?.project as any
  const organization = project?.organization as any

  // Get musician's instrument for this project
  const { data: position } = await supabase
    .from('project_positions')
    .select('instrument_id')
    .eq('project_id', send.project_id)
    .eq('musician_id', confirmation.musician_id)
    .eq('status', 'confirmed')
    .limit(1)
    .maybeSingle()

  // Get files this musician has access to
  const { data: allFiles } = await supabase
    .from('project_files')
    .select('id, file_name, scope, project_file_instruments(instrument_id)')
    .eq('project_id', send.project_id)

  const baseUrl = getAppUrl()
  const musicianFiles = (allFiles || [])
    .filter((f: any) => {
      if (f.scope === 'all') return true
      if (f.scope === 'assigned' && position) {
        return (f.project_file_instruments || []).some(
          (fi: any) => fi.instrument_id === position.instrument_id
        )
      }
      return false
    })
    .map((f: any) => ({
      name: f.file_name,
      downloadUrl: `${baseUrl}/api/music-download/${f.id}?token=${token}`,
    }))

  return (
    <ConfirmMusicClient
      token={token}
      musicianFirstName={musician?.first_name || ''}
      organizationName={organization?.name || 'Orchestra'}
      projectName={project?.name || 'Project'}
      files={musicianFiles}
      alreadyConfirmed={!!confirmation.confirmed_at}
    />
  )
}
