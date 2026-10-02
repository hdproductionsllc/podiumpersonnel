'use client'

import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'
import { getAppUrl } from '@/lib/utils'
import { detectPlatform, smsPhone, textAction, type DevicePlatform, type OfferTextKind } from '@/lib/notify/text-from-phone'

const noSubscription = () => () => {}

interface OfferTextButtonProps {
  kind: OfferTextKind
  token: string
  firstName: string
  phone: string | null | undefined
  organizationName: string
  projectName: string
  startsAt: string | null
  timezone: string
  role: string
}

/**
 * "Text" on an offer row: opens the admin's own messaging app with a short
 * message and the person's offer link filled in (an sms: link). On a desktop,
 * or with no number on file, it copies the message instead. Podium sends
 * nothing: the admin decides whether to press send.
 */
export function OfferTextButton(props: OfferTextButtonProps) {
  const terms = useTerms()
  // The server render (and hydration) assume a desktop; the browser then says
  // which device this is. The user agent never changes, so nothing to subscribe to.
  const platform = useSyncExternalStore<DevicePlatform>(
    noSubscription,
    () => detectPlatform(navigator.userAgent),
    () => 'desktop'
  )

  const canOpen = platform !== 'desktop' && smsPhone(props.phone) !== null
  const person = term(terms, 'person', { case: 'lower' })

  async function handleClick() {
    const action = textAction({
      kind: props.kind,
      terms,
      firstName: props.firstName,
      organizationName: props.organizationName,
      projectName: props.projectName,
      startsAt: props.startsAt,
      timezone: props.timezone,
      role: props.role,
      link: `${getAppUrl()}/gig/${props.token}`,
      phone: props.phone,
      platform,
    })
    if (action.kind === 'open') {
      window.location.href = action.href
      return
    }
    try {
      await navigator.clipboard.writeText(action.message)
      toast.success(
        smsPhone(props.phone)
          ? 'Message copied. Paste it into a text to them.'
          : `Message copied. There is no phone number for this ${person}; paste it wherever you reach them.`
      )
    } catch {
      toast.error('Could not copy the message')
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      title={
        canOpen
          ? 'Open your messaging app with a short message and their offer link. Nothing is sent until you send it.'
          : 'Copy a short message with their offer link, to text from your phone'
      }
    >
      {canOpen ? 'Text' : 'Copy message'}
    </Button>
  )
}
