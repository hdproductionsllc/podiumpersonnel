import { createClient } from '@/lib/supabase/server'
import { EmailsClient } from '@/components/emails/emails-client'

export default async function EmailsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('organization_members')
    .select(`
      role,
      organization:organizations(
        id,
        name,
        timezone
      )
    `)
    .eq('user_id', user!.id)
    .single()

  const organization = membership?.organization as unknown as {
    id: string
    name: string
    timezone: string | null
  } | null

  // Fetch email logs for this organization, most recent first
  const { data: emailLogs } = await supabase
    .from('email_logs')
    .select('*')
    .eq('organization_id', organization!.id)
    .order('sent_at', { ascending: false })
    .limit(500)

  return (
    <EmailsClient
      emailLogs={emailLogs ?? []}
      timezone={organization?.timezone || 'America/New_York'}
    />
  )
}
