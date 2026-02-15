'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { usePlan } from '@/components/providers/plan-provider'
import { PLAN_LIMITS } from '@/lib/plan'

function PlanBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pro: 'bg-primary/10 text-primary border-primary/20',
    trial: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    free: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700',
    past_due: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
  }
  const labels: Record<string, string> = {
    pro: 'Pro',
    trial: 'Pro Trial',
    free: 'Free',
    past_due: 'Payment Issue',
  }

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${styles[status] || styles.free}`}>
      {labels[status] || 'Free'}
    </span>
  )
}

const features = [
  { name: 'Musicians', free: `Up to ${PLAN_LIMITS.free.musicians}`, pro: 'Unlimited' },
  { name: 'Active projects', free: `Up to ${PLAN_LIMITS.free.activeProjects}`, pro: 'Unlimited' },
  { name: 'Admin seats', free: `${PLAN_LIMITS.free.adminSeats} (owner only)`, pro: 'Unlimited' },
  { name: 'Contract offers', free: 'Yes', pro: 'Yes' },
  { name: 'Bulk import', free: 'No', pro: 'Yes' },
  { name: 'Saved ensembles', free: 'No', pro: 'Yes' },
  { name: 'Gig details & group text', free: 'No', pro: 'Yes' },
  { name: 'Portal invites', free: 'No', pro: 'Yes' },
  { name: 'W-9 requests', free: 'No', pro: 'Yes' },
]

export function BillingSection() {
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>
                {plan.status === 'trial' && plan.trialDaysRemaining !== null
                  ? `Your Pro trial ends in ${plan.trialDaysRemaining} day${plan.trialDaysRemaining !== 1 ? 's' : ''}.`
                  : plan.status === 'free'
                    ? 'Upgrade to unlock all features.'
                    : plan.status === 'past_due'
                      ? 'Please update your payment method.'
                      : 'You have full access to all features.'}
              </CardDescription>
            </div>
            <PlanBadge status={plan.status} />
          </div>
        </CardHeader>
        <CardContent>
          {plan.canUpgrade ? (
            <Button onClick={handleUpgrade} disabled={loading}>
              {loading ? 'Loading...' : 'Upgrade to Pro \u2014 $29/mo'}
            </Button>
          ) : plan.status === 'past_due' ? (
            <Button variant="destructive" onClick={handleManage} disabled={loading}>
              {loading ? 'Loading...' : 'Update Payment Method'}
            </Button>
          ) : (
            <Button variant="outline" onClick={handleManage} disabled={loading}>
              {loading ? 'Loading...' : 'Manage Subscription'}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plan Comparison</CardTitle>
          <CardDescription>See what each plan includes.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-4 text-left font-medium">Feature</th>
                  <th className="py-2 px-4 text-center font-medium">Free</th>
                  <th className="py-2 pl-4 text-center font-medium">Pro ($29/mo)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {features.map((f) => (
                  <tr key={f.name}>
                    <td className="py-2 pr-4">{f.name}</td>
                    <td className="py-2 px-4 text-center text-muted-foreground">{f.free}</td>
                    <td className="py-2 pl-4 text-center font-medium">{f.pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
