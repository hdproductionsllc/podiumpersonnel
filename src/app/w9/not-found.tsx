import { PublicLinkFallback } from '@/components/public-link-fallback'

export default function W9NotFound() {
  return (
    <PublicLinkFallback
      title="This W-9 link is no longer available"
      message="This link may have expired, or your W-9 may already have been received — the link stops working once a form comes through. Ask whoever requested it to send a new one if you still need to submit."
    />
  )
}
