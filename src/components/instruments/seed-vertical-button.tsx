'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'

/**
 * Empty-state seeding for NON-music verticals: re-runs the idempotent
 * /api/organization/seed-skills route, which inserts the org's own vertical
 * taxonomy (voice parts, roles, team roles, ...). The orchestra-flavored
 * PrepopulateButton/AddMissingButton stay music-vertical-only.
 */
export function SeedVerticalButton({ onSuccess }: { onSuccess: () => void }) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const terms = useTerms()

  async function handleSeed() {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/organization/seed-skills', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        setIsLoading(false)
        return
      }
      setIsLoading(false)
      onSuccess()
    } catch {
      setError('Something went wrong. Please try again.')
      setIsLoading(false)
    }
  }

  const skillPlural = term(terms, 'skill', { plural: true })

  return (
    <div>
      <Button variant="outline" onClick={handleSeed} disabled={isLoading}>
        {isLoading
          ? `Adding ${term(terms, 'skill', { plural: true, case: 'lower' })}...`
          : `Add Standard ${skillPlural}`}
      </Button>
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
    </div>
  )
}
