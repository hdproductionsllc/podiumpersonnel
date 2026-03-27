'use client'

import { BookInstrumentChairs } from './book-instrument-chairs'
import type { BookEntryJoined, InstrumentOption, MusicianForDropdown } from './books-client'

interface BookSectionGroupProps {
  title: string
  instruments: InstrumentOption[]
  entries: BookEntryJoined[]
  ensembleSize: number
  musicians: MusicianForDropdown[]
  bookId: string
  canManage: boolean
  onEntryChange: () => void
}

export function BookSectionGroup({
  title,
  instruments,
  entries,
  ensembleSize,
  musicians,
  bookId,
  canManage,
  onEntryChange,
}: BookSectionGroupProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2">
        {instruments.map((instrument) => {
          const instrumentEntries = entries
            .filter((e) => e.instrument_id === instrument.id)
            .sort((a, b) => (a.chair_number ?? 999) - (b.chair_number ?? 999))
          return (
            <BookInstrumentChairs
              key={instrument.id}
              instrument={instrument}
              entries={instrumentEntries}
              ensembleSize={ensembleSize}
              musicians={musicians}
              bookId={bookId}
              canManage={canManage}
              onEntryChange={onEntryChange}
            />
          )
        })}
      </div>
    </div>
  )
}
