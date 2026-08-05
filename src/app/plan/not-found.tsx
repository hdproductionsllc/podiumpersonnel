import { PublicLinkFallback } from '@/components/public-link-fallback'

/**
 * Deliberately says nothing about WHY. Expired, revoked, mistyped and
 * never-existed all land here with one message, so the page can never confirm
 * that a guessed token was once real (spec §9.7).
 */
export default function SongPlannerNotFound() {
  return (
    <PublicLinkFallback
      title="This music link is no longer available"
      message="This link may have expired or been replaced. Get in touch with whoever is playing at your event and they can send you a fresh one in a few seconds."
    />
  )
}
