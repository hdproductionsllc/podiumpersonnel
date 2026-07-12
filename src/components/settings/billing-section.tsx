'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { usePlan } from '@/components/providers/plan-provider'
import { TIER_RANK, type PaidTier, type PlanTier } from '@/lib/plan'

const TIER_LABELS: Record<PlanTier, string> = {
  free: 'Free',
  ensemble: 'Ensemble',
  orchestra: 'Orchestra',
  symphony: 'Symphony',
}

type TierCard = {
  tier: PaidTier
  price: string
  blurb: string
  highlights: string[]
}

const TIERS: TierCard[] = [
  {
    tier: 'ensemble',
    price: '$29',
    blurb: 'Small groups & single ensembles',
    highlights: ['Up to 60 performers', 'Unlimited projects', 'Bulk import, saved lineups', 'Branding, group messaging, W-9 requests'],
  },
  {
    tier: 'orchestra',
    price: '$79',
    blurb: 'Growing organizations',
    highlights: ['Up to 250 performers', 'Up to 3 admin seats', 'Substitution workflow', 'QuickBooks/CSV export, priority support'],
  },
  {
    tier: 'symphony',
    price: '$199',
    blurb: 'Institutions',
    highlights: ['Unlimited performers', 'Unlimited admin seats', 'Multi-ensemble management', 'Dedicated onboarding'],
  },
]

function PlanBadge({ tier, status }: { tier: PlanTier; status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    comped: { cls: 'bg-primary/10 text-primary border-primary/20', label: 'Complimentary' },
    active: { cls: 'bg-primary/10 text-primary border-primary/20', label: TIER_LABELS[tier] },
    trial: { cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800', label: 'Trial' },
    free: { cls: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700', label: 'Free' },
    past_due: { cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800', label: 'Payment Issue' },
  }
  const s = map[status] || map.free
  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${s.cls}`}>{s.label}</span>
}

export function BillingSection() {
  const plan = usePlan()
  const [loading, setLoading] = useState<string | null>(null)

  async function checkout(tier: PaidTier) {
    setLoading(tier)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else setLoading(null)
    } catch {
      setLoading(null)
    }
  }

  async function manage() {
    setLoading('manage')
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else setLoading(null)
    } catch {
      setLoading(null)
    }
  }

  const isPaid = plan.status === 'active' || plan.status === 'past_due'

  const description =
    plan.status === 'comped'
      ? 'Your organization has complimentary full access.'
      : plan.status === 'trial' && plan.trialDaysRemaining !== null
        ? `Your trial ends in ${plan.trialDaysRemaining} day${plan.trialDaysRemaining !== 1 ? 's' : ''}. Choose a plan to keep full access.`
        : plan.status === 'past_due'
          ? 'There was a problem with your payment. Please update your payment method.'
          : plan.status === 'free'
            ? 'You are on the Free plan. Upgrade to unlock more.'
            : `You are on the ${TIER_LABELS[plan.tier]} plan.`

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            <PlanBadge tier={plan.tier} status={plan.status} />
          </div>
        </CardHeader>
        {(isPaid || plan.status === 'past_due') && (
          <CardContent>
            <Button
              variant={plan.status === 'past_due' ? 'destructive' : 'outline'}
              onClick={manage}
              disabled={loading !== null}
            >
              {loading === 'manage' ? 'Loading…' : plan.status === 'past_due' ? 'Update Payment Method' : 'Manage Subscription'}
            </Button>
          </CardContent>
        )}
      </Card>

      {plan.status !== 'comped' && (
        <div className="grid gap-4 md:grid-cols-3">
          {TIERS.map((t) => {
            const isCurrent = plan.status === 'active' && plan.tier === t.tier
            const isDowngrade = isPaid && TIER_RANK[t.tier] < TIER_RANK[plan.tier]
            return (
              <Card key={t.tier} className={isCurrent ? 'border-primary' : undefined}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{TIER_LABELS[t.tier]}</CardTitle>
                    {isCurrent && <span className="text-xs font-medium text-primary">Current</span>}
                  </div>
                  <CardDescription>{t.blurb}</CardDescription>
                  <div className="pt-1 text-2xl font-semibold">
                    {t.price}
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {t.highlights.map((h) => (
                      <li key={h}>• {h}</li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <Button variant="outline" disabled className="w-full">Current plan</Button>
                  ) : (
                    <Button
                      variant={isDowngrade ? 'outline' : 'default'}
                      className="w-full"
                      onClick={() => (isPaid ? manage() : checkout(t.tier))}
                      disabled={loading !== null}
                    >
                      {loading === t.tier ? 'Loading…' : isPaid ? (isDowngrade ? 'Change plan' : 'Upgrade') : 'Choose ' + TIER_LABELS[t.tier]}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
