'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { InstrumentSectionGroup } from './instrument-section-group'
import { InstrumentFormDialog } from './instrument-form-dialog'
import { DeleteInstrumentDialog } from './delete-instrument-dialog'
import { PrepopulateButton } from './prepopulate-button'
import { INSTRUMENT_SECTIONS, SECTION_LABELS } from '@/lib/validations/instruments'
import type { Instrument } from '@/types'

interface InstrumentsClientProps {
  instruments: Instrument[]
  organizationId: string
  userRole: string
}

export function InstrumentsClient({
  instruments,
  organizationId,
  userRole,
}: InstrumentsClientProps) {
  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editingInstrument, setEditingInstrument] = useState<Instrument | null>(null)
  const [deletingInstrument, setDeletingInstrument] = useState<Instrument | null>(null)

  const canManage = userRole === 'owner' || userRole === 'admin'

  const grouped = INSTRUMENT_SECTIONS.reduce((acc, section) => {
    acc[section] = instruments.filter(
      (i) => (i.section || 'other') === section
    )
    return acc
  }, {} as Record<string, Instrument[]>)

  function handleAdd() {
    setEditingInstrument(null)
    setFormOpen(true)
  }

  function handleEdit(instrument: Instrument) {
    setEditingInstrument(instrument)
    setFormOpen(true)
  }

  function handleDelete(instrument: Instrument) {
    setDeletingInstrument(instrument)
    setDeleteOpen(true)
  }

  function handleSuccess() {
    setFormOpen(false)
    setDeleteOpen(false)
    setEditingInstrument(null)
    setDeletingInstrument(null)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Instruments</h2>
          <p className="text-muted-foreground">
            Manage the instruments in your orchestra.
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {instruments.length === 0 && (
              <PrepopulateButton
                organizationId={organizationId}
                onSuccess={handleSuccess}
              />
            )}
            <Button onClick={handleAdd}>Add Instrument</Button>
          </div>
        )}
      </div>

      <Separator />

      {instruments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground mb-4">
            No instruments have been added yet.
          </p>
          {canManage && (
            <PrepopulateButton
              organizationId={organizationId}
              onSuccess={handleSuccess}
            />
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {INSTRUMENT_SECTIONS.map((section) => {
            if (grouped[section].length === 0) return null
            return (
              <InstrumentSectionGroup
                key={section}
                title={SECTION_LABELS[section]}
                instruments={grouped[section]}
                canManage={canManage}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            )
          })}
        </div>
      )}

      <InstrumentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        instrument={editingInstrument}
        organizationId={organizationId}
        onSuccess={handleSuccess}
      />

      <DeleteInstrumentDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        instrument={deletingInstrument}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
