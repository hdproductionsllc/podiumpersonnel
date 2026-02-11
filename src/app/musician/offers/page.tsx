import { redirect } from 'next/navigation'

export default async function MusicianOffersPage({
  searchParams,
}: {
  searchParams?: Promise<{ impersonate?: string }>
}) {
  const params = await searchParams
  const query = params?.impersonate ? `?impersonate=${params.impersonate}` : ''
  redirect(`/musician${query}`)
}
