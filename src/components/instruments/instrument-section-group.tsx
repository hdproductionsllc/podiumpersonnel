'use client'

import type { InstrumentWithMusicians } from './instruments-client'
import { InstrumentCard } from './instrument-card'

interface InstrumentSectionGroupProps {
  title: string
  instruments: InstrumentWithMusicians[]
  canManage: boolean
  onEdit: (instrument: InstrumentWithMusicians) => void
  onDelete: (instrument: InstrumentWithMusicians) => void
}

export function InstrumentSectionGroup({
  title,
  instruments,
  canManage,
  onEdit,
  onDelete,
}: InstrumentSectionGroupProps) {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-3">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {instruments.map((instrument) => (
          <InstrumentCard
            key={instrument.id}
            instrument={instrument}
            canManage={canManage}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}
