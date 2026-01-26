'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { STANDARD_INSTRUMENTS } from '@/lib/validations/instruments'
import { toast } from 'sonner'

interface AddMissingButtonProps {
  organizationId: string
  existingNames: string[]
  onSuccess: () => void
}

export function AddMissingButton({
  organizationId,
  existingNames,
  onSuccess,
}: AddMissingButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [showDialog, setShowDialog] = useState(false)

  // Find instruments that are in standard list but not in organization
  const missingInstruments = STANDARD_INSTRUMENTS.filter(
    (std) => !existingNames.some((name) => name.toLowerCase() === std.name.toLowerCase())
  )

  if (missingInstruments.length === 0) {
    return null
  }

  async function handleAddMissing() {
    setIsLoading(true)

    const supabase = createClient()

    const instrumentsToInsert = missingInstruments.map((inst) => ({
      organization_id: organizationId,
      name: inst.name,
      abbreviation: inst.abbreviation,
      section: inst.section,
      sort_order: inst.sort_order,
    }))

    const { error: insertError } = await supabase
      .from('instruments')
      .insert(instrumentsToInsert)

    setIsLoading(false)
    setShowDialog(false)

    if (insertError) {
      toast.error(insertError.message)
      return
    }

    toast.success(`Added ${missingInstruments.length} instrument${missingInstruments.length !== 1 ? 's' : ''}`)
    onSuccess()
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setShowDialog(true)}
      >
        Add Missing ({missingInstruments.length})
      </Button>

      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg max-h-[80vh] overflow-hidden flex flex-col">
            <h3 className="text-lg font-semibold">Add Missing Instruments</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              The following {missingInstruments.length} instrument{missingInstruments.length !== 1 ? 's are' : ' is'} available in the standard library but not in your organization:
            </p>

            <div className="mt-4 flex-1 overflow-y-auto max-h-64 rounded border bg-muted/30 p-3">
              <ul className="space-y-1 text-sm">
                {missingInstruments.map((inst) => (
                  <li key={inst.name} className="flex justify-between">
                    <span>{inst.name}</span>
                    <span className="text-muted-foreground">{inst.abbreviation}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)} disabled={isLoading}>
                Cancel
              </Button>
              <Button onClick={handleAddMissing} disabled={isLoading}>
                {isLoading ? 'Adding...' : `Add All ${missingInstruments.length}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
