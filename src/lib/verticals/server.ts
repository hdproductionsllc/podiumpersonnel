import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { resolveVertical } from './registry'
import type { VerticalTemplate } from './types'

/**
 * Resolve the current user's organization vertical in a SERVER component
 * (which can't use the useVertical hook). React cache() dedupes the lookup
 * across every server component in one request render. Always fails open to
 * the default template — a wrong label never justifies a thrown render.
 *
 * Client components must use useVertical()/useTerms() instead.
 */
export const getServerVertical = cache(async (): Promise<VerticalTemplate> => {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return resolveVertical(null)

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()
    if (!membership) return resolveVertical(null)

    const { data: org } = await supabase
      .from('organizations')
      .select('vertical')
      .eq('id', membership.organization_id)
      .single()

    return resolveVertical((org as { vertical?: string } | null)?.vertical)
  } catch {
    return resolveVertical(null)
  }
})
