import { MusicianActivateForm } from '@/components/musician/auth/activate-form'

interface ActivatePageProps {
  params: Promise<{
    token: string
  }>
}

export default async function MusicianActivatePage({ params }: ActivatePageProps) {
  const { token } = await params

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-gradient-to-b from-background to-muted/20">
      <MusicianActivateForm token={token} />
    </div>
  )
}
