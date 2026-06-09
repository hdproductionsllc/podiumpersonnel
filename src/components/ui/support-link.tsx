import { SUPPORT_EMAIL, supportMailto } from '@/lib/constants'

/** A plain mailto link to support, used inside sentences. */
export function SupportLink({
  subject,
  className,
}: {
  subject?: string
  className?: string
}) {
  return (
    <a
      href={supportMailto(subject)}
      className={className ?? 'font-medium underline underline-offset-2 hover:text-foreground'}
    >
      {SUPPORT_EMAIL}
    </a>
  )
}

/**
 * Standard "need help?" line for error screens. Pass an errorId to pre-fill the
 * support email subject so the user can send it without copying anything.
 */
export function SupportHint({ errorId }: { errorId?: string }) {
  const subject = errorId ? `Help with Podium (error ${errorId})` : 'Help with Podium'
  return (
    <p className="mt-4 text-xs text-muted-foreground">
      Still stuck? Email <SupportLink subject={subject} /> and we&apos;ll help.
    </p>
  )
}
