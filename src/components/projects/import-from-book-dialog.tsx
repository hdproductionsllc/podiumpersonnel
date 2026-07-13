'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'

type BookOption = {
  id: string
  name: string
  book_entries: {
    instrument_id: string
    chair_number: number | null
    musician_id: string
  }[]
}

interface ImportFromBookDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  books: BookOption[]
  projectId: string
  onSuccess: () => void
}

export function ImportFromBookDialog({
  open,
  onOpenChange,
  books,
  projectId,
  onSuccess,
}: ImportFromBookDialogProps) {
  const terms = useTerms()
  const [selectedBookId, setSelectedBookId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function handleImport() {
    if (!selectedBookId) return
    const book = books.find((b) => b.id === selectedBookId)
    if (!book || book.book_entries.length === 0) {
      setError('Selected ensemble has no entries to import.')
      return
    }

    setLoading(true)
    setError(null)

    const supabase = createClient()

    // Build positions from book entries
    // Group by instrument_id to assign chair numbers
    const entriesByInstrument = new Map<string, typeof book.book_entries>()
    for (const entry of book.book_entries) {
      const existing = entriesByInstrument.get(entry.instrument_id) ?? []
      existing.push(entry)
      entriesByInstrument.set(entry.instrument_id, existing)
    }

    const positions: {
      project_id: string
      instrument_id: string
      chair_number: number
      musician_id: string | null
      status: string
    }[] = []

    for (const [instrumentId, entries] of entriesByInstrument) {
      entries.forEach((entry, idx) => {
        positions.push({
          project_id: projectId,
          instrument_id: instrumentId,
          chair_number: entry.chair_number ?? idx + 1,
          musician_id: entry.musician_id,
          status: entry.musician_id ? 'confirmed' : 'vacant',
        })
      })
    }

    const { error: insertError } = await supabase
      .from('project_positions')
      .insert(positions)

    setLoading(false)

    if (insertError) {
      if (insertError.code === '23505') {
        setError('Some positions already exist for this project. Clear existing positions first or import into an empty project.')
      } else {
        setError(insertError.message)
      }
      return
    }

    setSelectedBookId('')
    onOpenChange(false)
    onSuccess()
  }

  function handleClose() {
    setSelectedBookId('')
    setError(null)
    onOpenChange(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-background rounded-lg border shadow-lg w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-semibold">Import from Ensemble</h3>
        <p className="text-sm text-muted-foreground">
          Select an ensemble to create positions from its entries. {term(terms, 'person', { plural: true })} will be pre-assigned.
        </p>

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium">Ensemble</label>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={selectedBookId}
            onChange={(e) => setSelectedBookId(e.target.value)}
          >
            <option value="">Select an ensemble...</option>
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.name} ({book.book_entries.length} entries)
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!selectedBookId || loading}>
            {loading ? 'Importing...' : 'Import'}
          </Button>
        </div>
      </div>
    </div>
  )
}
