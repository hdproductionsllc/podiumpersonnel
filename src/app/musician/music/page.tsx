import { redirect } from 'next/navigation'
import { createClient, resolveMusicianIds } from '@/lib/supabase/server'
import { MusicFilesClient } from '@/components/musician/music-files-client'
import { Suspense } from 'react'

async function MusicContent({ impersonateId, projectFilter }: { impersonateId?: string; projectFilter?: string }) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/musician/login')
  }

  const { musicianIds, error: resolveError } = await resolveMusicianIds(
    supabase, user.id, impersonateId
  )

  if (resolveError || musicianIds.length === 0) {
    redirect('/musician/login?error=no_musician_records')
  }

  return (
    <MusicFilesClient
      impersonateId={impersonateId}
      projectFilter={projectFilter}
    />
  )
}

function MusicSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-8 w-32 bg-muted rounded animate-pulse" />
        <div className="h-4 w-64 bg-muted rounded animate-pulse mt-2" />
      </div>
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-lg border p-6 space-y-3">
            <div className="h-5 w-48 bg-muted rounded animate-pulse" />
            <div className="h-4 w-32 bg-muted rounded animate-pulse" />
            <div className="space-y-2">
              <div className="h-10 bg-muted rounded animate-pulse" />
              <div className="h-10 bg-muted rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default async function MusicianMusicPage({
  searchParams,
}: {
  searchParams?: Promise<{ impersonate?: string; project?: string }>
}) {
  const params = await searchParams
  return (
    <Suspense fallback={<MusicSkeleton />}>
      <MusicContent
        impersonateId={params?.impersonate}
        projectFilter={params?.project}
      />
    </Suspense>
  )
}
