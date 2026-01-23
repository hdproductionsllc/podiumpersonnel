'use client'

import { Separator } from '@/components/ui/separator'
import { BookSectionGroup } from './book-section-group'
import { INSTRUMENT_SECTIONS, SECTION_LABELS } from '@/lib/validations/instruments'
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
  const grouped = INSTRUMENT_SECTIONS.reduce((acc, section) => {
    acc[section] = instruments
      .filter((i) => (i.section || 'other') === section)
      .sort((a, b) => a.sort_order - b.sort_order)
    return acc
  }, {} as Record<string, InstrumentOption[]>)

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold">{book.name}</h3>
        {book.description && (
          <p className="text-sm text-muted-foreground">{book.description}</p>
        )}
      </div>

      <Separator />

      {instruments.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          No instruments have been added yet. Add instruments first to assign chairs.
        </p>
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
