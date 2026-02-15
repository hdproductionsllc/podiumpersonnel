'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface UpgradePromptProps {
  feature: string
  description?: string
  compact?: boolean
}

export function UpgradePrompt({ feature, description, compact }: UpgradePromptProps) {
  const [loading, setLoading] = useState(false)

  async function handleUpgrade() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/checkout', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch {
      setLoading(false)
    }
  }

  if (compact) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{feature} is a Pro feature</p>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        <Button size="sm" onClick={handleUpgrade} disabled={loading}>
          {loading ? 'Loading...' : 'Upgrade'}
        </Button>
      </div>
    )
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="py-6">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="rounded-full bg-primary/10 p-3">
            <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold">{feature}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {description || 'Upgrade to Podium Pro to unlock this feature.'}
            </p>
          </div>
          <Button onClick={handleUpgrade} disabled={loading} className="mt-2">
            {loading ? 'Loading...' : 'Upgrade to Pro \u2014 $29/mo'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
