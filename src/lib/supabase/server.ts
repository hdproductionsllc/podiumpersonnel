import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Note: For full type safety, generate types from your Supabase project:
// npx supabase gen types typescript --project-id your-project-id > src/types/database.ts
// Then import and use: createServerClient<Database>(...)

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

// Service role client for admin operations (e.g., getting user emails)
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

// Helper to resolve musician IDs for a request, supporting admin impersonation.
// If `impersonateId` is provided and the authenticated user is an admin of
// the musician's organization, returns only that musician's ID.
// Otherwise returns all musician IDs belonging to the authenticated user.
export async function resolveMusicianIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  impersonateId?: string | null
): Promise<{ musicianIds: string[]; error?: string }> {
  if (impersonateId) {
    // Verify the musician exists and admin has access
    const { data: musician } = await supabase
      .from('musicians')
      .select('id, organization_id')
      .eq('id', impersonateId)
      .single()

    if (!musician) {
      return { musicianIds: [], error: 'Musician not found' }
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', musician.organization_id)
      .eq('user_id', userId)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return { musicianIds: [], error: 'Not authorized to impersonate this musician' }
    }

    return { musicianIds: [musician.id] }
  }

  // Normal flow: get all musician records for this user
  const { data: musicians } = await supabase
    .from('musicians')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (!musicians || musicians.length === 0) {
    return { musicianIds: [], error: 'No musician records found' }
  }

  return { musicianIds: musicians.map((m) => m.id) }
}

/**
 * Returns the email of the organization's owner, for use as Reply-To on
 * musician-facing emails so musician replies route to a real human instead
 * of the unmonitored hello@ inbox. Falls back to null if the org has no
 * owner (shouldn't happen in practice) or the owner has no email.
 */
export async function getOrgOwnerEmail(organizationId: string): Promise<string | null> {
  const serviceClient = createServiceClient()

  const { data: members } = await serviceClient
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('role', 'owner')
    .limit(1)

  const ownerId = members?.[0]?.user_id
  if (!ownerId) return null

  const { data: userData } = await serviceClient.auth.admin.getUserById(ownerId)
  return userData?.user?.email ?? null
}

// Helper to get admin/owner emails for an organization
export async function getOrgAdminEmails(organizationId: string): Promise<string[]> {
  const serviceClient = createServiceClient()

  // Get admin/owner user IDs
  const { data: members } = await serviceClient
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organizationId)
    .in('role', ['owner', 'admin'])

  if (!members || members.length === 0) {
    return []
  }

  // Get user emails using admin API
  const emails: string[] = []
  for (const member of members) {
    const { data: userData } = await serviceClient.auth.admin.getUserById(member.user_id)
    if (userData?.user?.email) {
      emails.push(userData.user.email)
    }
  }

  return emails
}
