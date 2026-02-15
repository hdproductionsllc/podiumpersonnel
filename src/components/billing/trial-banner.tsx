'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { usePlan } from '@/components/providers/plan-provider'

export function TrialBanner() {
  const plan = usePlan()
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

  async function handleManage() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch {
      setLoading(false)
    }
  }

  // Past due — red banner
  if (plan.status === 'past_due') {
    return (
      <div className="flex items-center justify-between gap-4 bg-red-600 px-4 py-2 text-white text-sm">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <span className="font-medium">Payment issue</span>
          <span className="hidden sm:inline">— please update your payment method to avoid service interruption.</span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleManage}
          disabled={loading}
          className="shrink-0"
        >
          {loading ? 'Loading...' : 'Update Payment'}
        </Button>
      </div>
    )
  }

  // Trial banner
  if (plan.status === 'trial' && plan.trialDaysRemaining !== null) {
    const urgent = plan.trialDaysRemaining <= 3
    return (
      <div className={`flex items-center justify-between gap-4 px-4 py-2 text-sm ${
        urgent
          ? 'bg-amber-500 text-white'
          : 'bg-primary/10 text-primary'
      }`}>
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <span>
            <span className="font-medium">Pro Trial</span>
            {' \u2014 '}
            {plan.trialDaysRemaining} day{plan.trialDaysRemaining !== 1 ? 's' : ''} remaining
          </span>
        </div>
        <Button
          size="sm"
          variant={urgent ? 'secondary' : 'default'}
          onClick={handleUpgrade}
          disabled={loading}
          className="shrink-0"
        >
          {loading ? 'Loading...' : 'Upgrade Now'}
        </Button>
      </div>
    )
  }

  // Pro or Free (no banner needed)
  return null
}
