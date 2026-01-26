'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface Position {
  instrument: { name: string }
  chair_number: number
}

interface SavePresetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  positions: Position[]
  organizationId: string
  onSuccess: () => void
}

const PRESET_CATEGORIES = [
  { value: 'chamber', label: 'Chamber' },
  { value: 'orchestra', label: 'Orchestra' },
  { value: 'custom', label: 'Custom' },
]

export function SavePresetDialog({
  open,
  onOpenChange,
  positions,
  organizationId,
  onSuccess,
}: SavePresetDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('custom')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Generate description from positions
  function generateDescription(): string {
    const counts: Record<string, number> = {}
    positions.forEach((p) => {
      const instName = p.instrument.name
      counts[instName] = (counts[instName] || 0) + 1
    })

    return Object.entries(counts)
      .map(([name, count]) => (count > 1 ? `${count} ${name}` : name))
      .join(', ')
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Please enter a preset name')
      return
    }

    if (positions.length === 0) {
      setError('No positions to save')
      return
    }

    setIsLoading(true)
    setError(null)

    // Convert positions to the storage format
    const positionsData = positions.map((p) => ({
      instrument_name: p.instrument.name,
      chair_number: p.chair_number,
    }))

    const supabase = createClient()

    const { error: insertError } = await supabase.from('staffing_presets').insert({
      organization_id: organizationId,
      name: name.trim(),
      description: description.trim() || generateDescription(),
      category,
      positions: positionsData,
    })

    setIsLoading(false)

    if (insertError) {
      if (insertError.message.includes('duplicate') || insertError.message.includes('unique')) {
        setError('A preset with this name already exists')
      } else {
        setError(insertError.message)
      }
      return
    }

    toast.success(`Preset "${name}" saved`)
    onOpenChange(false)
    onSuccess()

    // Reset form
    setName('')
    setDescription('')
    setCategory('custom')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save as Preset</DialogTitle>
          <DialogDescription>
            Save the current staffing configuration for reuse in future projects.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Preset Name</label>
            <Input
              placeholder="e.g., Wedding Quartet, Full Symphony"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Category</label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {PRESET_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description (optional)</label>
            <Input
              placeholder={generateDescription() || 'Describe this ensemble...'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to auto-generate from positions
            </p>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-sm font-medium mb-2">
              {positions.length} position{positions.length !== 1 ? 's' : ''} will be saved:
            </p>
            <p className="text-sm text-muted-foreground">{generateDescription()}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading || !name.trim()}>
            {isLoading ? 'Saving...' : 'Save Preset'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
