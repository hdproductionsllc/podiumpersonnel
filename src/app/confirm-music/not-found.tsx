import { PublicLinkFallback } from '@/components/public-link-fallback'

export default function ConfirmMusicNotFound() {
  return (
    <PublicLinkFallback
      title="This music link is no longer available"
      message="This music-confirmation link may have expired, already been used, or been mistyped. If you think it should still work, your contractor can resend it."
    />
  )
}
