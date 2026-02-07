import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { supabase, user: null, error: apiError('Unauthorized', 401) }
  }

  return { supabase, user, error: null }
}

export async function requireOrgAdmin() {
  const { supabase, user, error } = await requireAuth()
  if (error || !user) {
    return { supabase, user: null, membership: null, error: error! }
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return { supabase, user, membership: null, error: apiError('No organization found', 404) }
  }

  if (!['owner', 'admin'].includes(membership.role)) {
    return { supabase, user, membership: null, error: apiError('Permission denied', 403) }
  }

  return { supabase, user, membership, error: null }
}
