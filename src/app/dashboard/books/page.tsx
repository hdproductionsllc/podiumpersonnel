import { createClient } from '@/lib/supabase/server'
import { BooksClient, type BookWithEntries, type MusicianForDropdown } from '@/components/books/books-client'

export default async function BooksPage() {
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

  // Fetch books with entries joined to musician and instrument
  const { data: books } = await supabase
    .from('books')
    .select(`
      *,
      book_entries(
        id,
        musician_id,
        instrument_id,
        chair_number,
        priority,
        notes,
        musician:musicians(id, first_name, last_name),
        instrument:instruments(id, name, abbreviation, section, sort_order)
      )
    `)
    .eq('organization_id', organization!.id)
    .order('name', { ascending: true })

  // Fetch all instruments for the grid skeleton
  const { data: instruments } = await supabase
    .from('instruments')
    .select('id, name, abbreviation, section, sort_order')
    .eq('organization_id', organization!.id)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  // Fetch active musicians with their instrument assignments
  const { data: musicians } = await supabase
    .from('musicians')
    .select(`
      id, first_name, last_name,
      musician_instruments(instrument_id)
    `)
    .eq('organization_id', organization!.id)
    .eq('is_active', true)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  return (
    <BooksClient
      books={(books as unknown as BookWithEntries[]) ?? []}
      instruments={instruments ?? []}
      musicians={(musicians as unknown as MusicianForDropdown[]) ?? []}
      organizationId={organization!.id}
      userRole={membership!.role}
    />
  )
}
