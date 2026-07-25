import { SupportLink } from '@/components/ui/support-link'

/**
 * Friendly dead-end for the public, no-login token pages (gig offers, gig-detail
 * and music confirmations).
 *
 * The audience is a musician with no account — everything they do runs off
 * tokenized links in their email. So there is nowhere useful to send them: no
 * login, and /dashboard is the contractor's. The only real fix is a fresh link
 * from whoever booked them, which is what the message now says. Support is the
 * fallback for anything else.
 */
export function PublicLinkFallback({
  title = 'This link is no longer available',
  message = 'This link may have expired, already been used, or been mistyped. Ask whoever booked you to resend it — they can send a fresh one in a few seconds.',
}: {
  title?: string
  message?: string
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-muted-foreground">{message}</p>
        <p className="mt-6 text-xs text-muted-foreground">
          Still stuck? Email <SupportLink subject="Help with a Podium link" />
        </p>
      </div>
    </div>
  )
}
