import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SupportLink } from '@/components/ui/support-link'

/**
 * Friendly dead-end for the public, no-login token pages (gig offers, gig-detail
 * and music confirmations). The audience is a musician who is NOT logged into a
 * contractor dashboard, so we point them at the musician portal and support —
 * never at /dashboard.
 */
export function PublicLinkFallback({
  title = 'This link is no longer available',
  message = 'This link may have expired, already been used, or been mistyped. If you think it should still work, your contractor can resend it.',
}: {
  title?: string
  message?: string
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-muted-foreground">{message}</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button asChild>
            <Link href="/musician/login">Go to musician portal</Link>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Need help? Email <SupportLink subject="Help with a Podium link" />
        </p>
      </div>
    </div>
  )
}
