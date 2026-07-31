import { notFound } from 'next/navigation'
import { requireIntakeEnabled } from '@/lib/api-helpers'
import { createServiceClient } from '@/lib/supabase/server'
import { LibraryClient } from '@/components/library/library-client'

/**
 * Browse the org's music library.
 *
 * Gated on the intake flag, like Book Builder: the repertoire tables only hold
 * data for orgs wired into that flow, so every other org would land on an empty
 * page. requireIntakeEnabled 404s when the flag is off — the feature isn't
 * advertised to orgs that don't have it.
 */
export const metadata = {
  title: 'Music Library',
  // The catalogue is private working material. Belt-and-braces alongside the
  // route's X-Robots-Tag: /dashboard is behind auth, so a crawler should never
  // reach here anyway.
  robots: { index: false, follow: false },
}

export default async function LibraryPage() {
  const { libraryOrgId, error } = await requireIntakeEnabled()
  if (error || !libraryOrgId) notFound()

  // Total up front so the page can say how big the shelf is before any search.
  const service = createServiceClient()
  const { count } = await service
    .from('repertoire')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', libraryOrgId)
    .eq('is_active', true)

  return <LibraryClient totalWorks={count ?? 0} />
}
