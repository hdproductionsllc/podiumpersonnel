import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { W9UploadClient } from '@/components/w9/w9-upload-client'

/**
 * Public W-9 submission page. The musician has no account — the token in their
 * request email is the credential, so this reads with the service client.
 *
 * Deliberately shows almost nothing: the musician's first name and the org that
 * asked. Enough to confirm they are in the right place, nothing worth harvesting
 * if a link is forwarded.
 */
export default async function W9UploadPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = createServiceClient()

  const { data: musician } = await supabase
    .from('musicians')
    .select(`
      id,
      first_name,
      w9_on_file,
      w9_uploaded_at,
      w9_request_expires_at,
      organization:organizations(name)
    `)
    .eq('w9_request_token', token)
    .maybeSingle()

  // A used token is cleared on successful upload, so an unknown token and an
  // already-submitted one look the same here. The not-found page tells them to
  // ask for a fresh link, which is the right advice either way.
  if (!musician) {
    notFound()
  }

  const organization = musician.organization as unknown as { name: string } | null
  const isExpired =
    !!musician.w9_request_expires_at &&
    new Date(musician.w9_request_expires_at) < new Date()

  return (
    <W9UploadClient
      token={token}
      musicianFirstName={musician.first_name || 'there'}
      organizationName={organization?.name || 'the organization'}
      isExpired={isExpired}
    />
  )
}
