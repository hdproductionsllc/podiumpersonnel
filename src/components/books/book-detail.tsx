'use client'

import { useState } from 'react'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { BookSectionGroup } from './book-section-group'
import { INSTRUMENT_SECTIONS, SECTION_LABELS } from '@/lib/validations/instruments'
import { useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'
import { toast } from 'sonner'
import type { BookWithEntries, InstrumentOption, MusicianForDropdown } from './books-client'

interface BookDetailProps {
  book: BookWithEntries
  instruments: InstrumentOption[]
  musicians: MusicianForDropdown[]
  canManage: boolean
  onEntryChange: () => void
}

export function BookDetail({
  book,
  instruments,
  musicians,
  canManage,
  onEntryChange,
}: BookDetailProps) {
  const terms = useTerms()
  const [showAddInstrument, setShowAddInstrument] = useState(false)

  // Get instruments that have entries in this book
  const instrumentIdsInBook = new Set(book.book_entries.map((e) => e.instrument_id))
  const instrumentsInBook = instruments.filter((i) => instrumentIdsInBook.has(i.id))
  const instrumentsNotInBook = instruments.filter((i) => !instrumentIdsInBook.has(i.id))

  // Group only instruments that are in this book
  const grouped = INSTRUMENT_SECTIONS.reduce((acc, section) => {
    acc[section] = instrumentsInBook
      .filter((i) => (i.section || 'other') === section)
      .sort((a, b) => a.sort_order - b.sort_order)
    return acc
  }, {} as Record<string, InstrumentOption[]>)

  // Group available instruments for adding
  const availableGrouped = INSTRUMENT_SECTIONS.reduce((acc, section) => {
    acc[section] = instrumentsNotInBook
      .filter((i) => (i.section || 'other') === section)
      .sort((a, b) => a.sort_order - b.sort_order)
    return acc
  }, {} as Record<string, InstrumentOption[]>)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold">{book.name}</h3>
          {book.description && (
            <p className="text-sm text-muted-foreground">{book.description}</p>
          )}
        </div>
        {canManage && instrumentsNotInBook.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddInstrument(!showAddInstrument)}
          >
            <svg
              className="h-4 w-4 mr-1"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {`Add ${term(terms, 'skill')}`}
          </Button>
        )}
      </div>

      {showAddInstrument && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <h4 className="font-medium mb-3">{`Select ${term(terms, 'skill', { plural: true, case: 'lower' })} to add:`}</h4>
          <div className="space-y-4 max-h-64 overflow-y-auto">
            {INSTRUMENT_SECTIONS.map((section) => {
              if (availableGrouped[section].length === 0) return null
              return (
                <div key={section}>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    {SECTION_LABELS[section]}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {availableGrouped[section].map((inst) => (
                      <Button
                        key={inst.id}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={async () => {
                          const { createClient } = await import('@/lib/supabase/client')
                          const supabase = createClient()
                          const { error } = await supabase.from('book_entries').insert({
                            book_id: book.id,
                            instrument_id: inst.id,
                            musician_id: null,
                            chair_number: 1,
                            priority: 1,
                          })
                          if (error) {
                            toast.error(`Failed to add ${inst.name}: ${error.message}`)
                            return
                          }
                          toast.success(`Added ${inst.name}`)
                          onEntryChange()
                        }}
                      >
                        + {inst.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-3 pt-3 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddInstrument(false)}
            >
              Done
            </Button>
          </div>
        </div>
      )}

      <Separator />

      {instrumentsInBook.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-muted-foreground mb-4">
            {`No ${term(terms, 'skill', { plural: true, case: 'lower' })} in this ensemble yet.`}
          </p>
          {canManage && instrumentsNotInBook.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setShowAddInstrument(true)}
            >
              {`Add Your First ${term(terms, 'skill')}`}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {INSTRUMENT_SECTIONS.map((section) => {
            if (grouped[section].length === 0) return null
            return (
              <BookSectionGroup
                key={section}
                title={SECTION_LABELS[section]}
                instruments={grouped[section]}
                entries={book.book_entries}
                ensembleSize={book.book_entries.length}
                musicians={musicians}
                bookId={book.id}
                canManage={canManage}
                onEntryChange={onEntryChange}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
