import { PublicLinkFallback } from '@/components/public-link-fallback'

export default function ConfirmDetailsNotFound() {
  return (
    <PublicLinkFallback
      title="This confirmation link is no longer available"
      message="This gig-details link may have expired, already been used, or been mistyped. If you think it should still work, your contractor can resend it."
    />
  )
}
