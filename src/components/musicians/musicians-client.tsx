'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { MusicianFormDialog } from './musician-form-dialog'
import { DeleteMusicianDialog } from './delete-musician-dialog'
import type { Musician } from '@/types'

export type MusicianInstrumentJoin = {
  id: string
  instrument_id: string
  is_primary: boolean
  proficiency: string
  instrument: {
    id: string
    name: string
    abbreviation: string | null
    section: string | null
  }
}

export type MusicianWithInstruments = Musician & {
  musician_instruments: MusicianInstrumentJoin[]
}

export type InstrumentOption = {
  id: string
  name: string
  section: string | null
  sort_order: number
}

interface MusiciansClientProps {
  musicians: MusicianWithInstruments[]
  instruments: InstrumentOption[]
  organizationId: string
  userRole: string
}

export function MusiciansClient({
  musicians,
  instruments,
  organizationId,
  userRole,
}: MusiciansClientProps) {
  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editingMusician, setEditingMusician] = useState<MusicianWithInstruments | null>(null)
  const [deletingMusician, setDeletingMusician] = useState<MusicianWithInstruments | null>(null)

  const canManage = userRole === 'owner' || userRole === 'admin'

  function handleAdd() {
    setEditingMusician(null)
    setFormOpen(true)
  }

  function handleEdit(musician: MusicianWithInstruments) {
    setEditingMusician(musician)
    setFormOpen(true)
  }

  function handleDelete(musician: MusicianWithInstruments) {
    setDeletingMusician(musician)
    setDeleteOpen(true)
  }

  function handleSuccess() {
    setFormOpen(false)
    setDeleteOpen(false)
    setEditingMusician(null)
    setDeletingMusician(null)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Musicians</h2>
          <p className="text-muted-foreground">
            Manage the musicians in your orchestra.
          </p>
        </div>
        {canManage && (
          <Button onClick={handleAdd}>Add Musician</Button>
        )}
      </div>

      <Separator />

      {musicians.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground mb-4">
            No musicians have been added yet.
          </p>
          {canManage && (
            <Button onClick={handleAdd}>Add Your First Musician</Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Phone</th>
                <th className="px-4 py-3 text-left font-medium">Instruments</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                {canManage && (
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {musicians.map((musician) => (
                <tr key={musician.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium">
                    {musician.last_name}, {musician.first_name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {musician.email || '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {musician.phone || '—'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {musician.musician_instruments.length > 0
                      ? musician.musician_instruments
                          .map((mi) => mi.instrument.abbreviation || mi.instrument.name)
                          .join(', ')
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        musician.is_active
                          ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }`}
                    >
                      {musician.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(musician)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(musician)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MusicianFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        musician={editingMusician}
        instruments={instruments}
        organizationId={organizationId}
        onSuccess={handleSuccess}
      />

      <DeleteMusicianDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        musician={deletingMusician}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
