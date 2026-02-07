import { Suspense } from 'react'
import { LoginForm } from '@/components/auth/login-form'

function LoginFormFallback() {
  return (
    <div className="w-full rounded-lg border bg-card p-8">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-muted rounded w-24"></div>
        <div className="h-4 bg-muted rounded w-48"></div>
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

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormFallback />}>
      <LoginForm />
    </Suspense>
  )
}
