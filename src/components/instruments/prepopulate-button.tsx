'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { STANDARD_INSTRUMENTS } from '@/lib/validations/instruments'
import { useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'

interface PrepopulateButtonProps {
  organizationId: string
  onSuccess: () => void
}

export function PrepopulateButton({
  organizationId,
  onSuccess,
}: PrepopulateButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const terms = useTerms()

  async function handlePrepopulate() {
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    const instrumentsToInsert = STANDARD_INSTRUMENTS.map((inst) => ({
      organization_id: organizationId,
      name: inst.name,
      abbreviation: inst.abbreviation,
      section: inst.section,
      sort_order: inst.sort_order,
    }))

    const { error: insertError } = await supabase
      .from('instruments')
      .insert(instrumentsToInsert)

    if (insertError) {
      setError(insertError.message)
      setIsLoading(false)
      return
    }

    setIsLoading(false)
    onSuccess()
  }

  return (
    <div>
      <Button
        variant="outline"
        onClick={handlePrepopulate}
        disabled={isLoading}
      >
        {isLoading ? `Adding ${term(terms, 'skill', { plural: true, case: 'lower' })}...` : 'Add Standard Orchestra'}
      </Button>
      {error && (
        <p className="text-sm text-destructive mt-1">{error}</p>
      )}
    </div>
  )
}
