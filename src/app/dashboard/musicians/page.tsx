import { createClient } from '@/lib/supabase/server'
import { MusiciansClient, type MusicianWithInstruments, type BookOption } from '@/components/musicians/musicians-client'

export default async function MusiciansPage() {
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
        slug
      )
    `)
    .eq('user_id', user!.id)
    .single()

  const organization = membership?.organization as unknown as {
    id: string
    name: string
    slug: string
  } | null

  // Fetch musicians with their instrument assignments
  const { data: musicians } = await supabase
    .from('musicians')
    .select(`
      *,
      musician_instruments(
        id,
        instrument_id,
        is_primary,
        proficiency,
        instrument:instruments(id, name, abbreviation, section)
      )
    `)
    .eq('organization_id', organization!.id)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  // Fetch all instruments for the form's checkbox list
  const { data: instruments } = await supabase
    .from('instruments')
    .select('id, name, section, sort_order')
    .eq('organization_id', organization!.id)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  // Fetch books with their musician entries for filtering
  const { data: books } = await supabase
    .from('books')
    .select(`
      id,
      name,
      book_entries(musician_id)
    `)
    .eq('organization_id', organization!.id)
    .order('name', { ascending: true })

  return (
    <MusiciansClient
      musicians={(musicians as unknown as MusicianWithInstruments[]) ?? []}
      instruments={instruments ?? []}
      books={(books as unknown as BookOption[]) ?? []}
      organizationId={organization!.id}
      organizationName={organization!.name}
      userRole={membership!.role}
    />
  )
}
