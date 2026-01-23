'use client'

import type { Instrument } from '@/types'
import { InstrumentCard } from './instrument-card'

interface InstrumentSectionGroupProps {
  title: string
  instruments: Instrument[]
  canManage: boolean
  onEdit: (instrument: Instrument) => void
  onDelete: (instrument: Instrument) => void
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
