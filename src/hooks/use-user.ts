'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export function useUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    // Get initial user
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  return { user, loading }
}

export function useOrganization() {
  const { user, loading: userLoading } = useUser()
  const [organization, setOrganization] = useState<{
    id: string
    name: string
    slug: string
    role: 'owner' | 'admin' | 'member'
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (userLoading) return
    if (!user) {
      setOrganization(null)
      setLoading(false)
      return
    }

    const supabase = createClient()

    async function fetchOrganization() {
      const { data } = await supabase
        .from('organization_members')
        .select(`
          role,
          organization:organizations(
            id,
            name,
            slug
          )
        `)
        .eq('user_id', user!.id)
        .single()

      if (data?.organization) {
        const org = data.organization as unknown as { id: string; name: string; slug: string }
        setOrganization({
          ...org,
          role: data.role as 'owner' | 'admin' | 'member',
        })
      }
      setLoading(false)
    }

    fetchOrganization()
  }, [user, userLoading])

  return { organization, loading: userLoading || loading, user }
}
