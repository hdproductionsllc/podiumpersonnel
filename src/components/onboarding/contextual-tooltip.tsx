'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ContextualTooltipProps {
  tooltipId: string
  text: string
  userId?: string
  organizationId?: string
  dismissedTooltips?: string[]
}

export function ContextualTooltip({
  tooltipId,
  text,
  userId,
  organizationId,
  dismissedTooltips = [],
}: ContextualTooltipProps) {
  const [visible, setVisible] = useState(!dismissedTooltips.includes(tooltipId))

  useEffect(() => {
    setVisible(!dismissedTooltips.includes(tooltipId))
  }, [dismissedTooltips, tooltipId])

  if (!visible) return null

  async function dismiss() {
    setVisible(false)
    if (!userId || !organizationId) return

    const supabase = createClient()
    const newDismissed = [...dismissedTooltips, tooltipId]

    await supabase
      .from('user_tutorial_state')
      .upsert({
        user_id: userId,
        organization_id: organizationId,
        dismissed_tooltips: newDismissed,
      }, { onConflict: 'user_id,organization_id' })
  }

  return (
    <div className="flex items-start gap-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
      <svg className="h-4 w-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
      </svg>
      <span className="flex-1">{text}</span>
      <button
        onClick={dismiss}
        className="flex-shrink-0 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200"
        aria-label="Dismiss tooltip"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
