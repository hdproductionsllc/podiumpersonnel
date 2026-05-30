import { Skeleton } from '@/components/ui/skeleton'

export default function MusicianLoading() {
  return (
    <div className="space-y-6 p-4">
      <Skeleton className="h-9 w-48" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
