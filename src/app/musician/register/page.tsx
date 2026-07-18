import { MusicianRegisterForm } from '@/components/musician/auth/register-form'

export default async function MusicianRegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ email?: string }>
}) {
  const params = await searchParams
  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-gradient-to-b from-background to-muted/20">
      <MusicianRegisterForm initialEmail={params?.email} />
    </div>
  )
}
