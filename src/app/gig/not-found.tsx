import { PublicLinkFallback } from '@/components/public-link-fallback'

export default function GigNotFound() {
  return (
    <PublicLinkFallback
      title="This offer link is no longer available"
      message="This gig offer may have expired, already been responded to, or been mistyped. If you think it should still be active, your contractor can resend it."
    />
  )
}
