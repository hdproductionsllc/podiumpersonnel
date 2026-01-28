import { Suspense } from 'react'
import { MusicianLoginForm } from '@/components/musician/auth/login-form'

function LoginFormFallback() {
  return (
    <div className="w-full max-w-md rounded-lg border bg-card p-8">
      <div className="animate-pulse space-y-4">
        <div className="flex justify-center">
          <div className="h-12 w-12 bg-muted rounded-full"></div>
        </div>
        <div className="h-8 bg-muted rounded w-32 mx-auto"></div>
        <div className="h-4 bg-muted rounded w-48 mx-auto"></div>
        <div className="space-y-2">
          <div className="h-4 bg-muted rounded w-16"></div>
          <div className="h-10 bg-muted rounded"></div>
        </div>
        <div className="space-y-2">
          <div className="h-4 bg-muted rounded w-20"></div>
          <div className="h-10 bg-muted rounded"></div>
        </div>
        <div className="h-10 bg-muted rounded"></div>
      </div>
    </div>
  )
}

export default function MusicianLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-gradient-to-b from-background to-muted/20">
      <Suspense fallback={<LoginFormFallback />}>
        <MusicianLoginForm />
      </Suspense>
    </div>
  )
}
