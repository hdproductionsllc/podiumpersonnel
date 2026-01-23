'use client'

import { useState, Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { ImportFromBookDialog } from './import-from-book-dialog'
import { INSTRUMENT_SECTIONS, SECTION_LABELS } from '@/lib/validations/instruments'

export type PositionJoined = {
  id: string
  project_id: string
  instrument_id: string
  chair_number: number
  musician_id: string | null
  status: string
  notes: string | null
  instrument: { id: string; name: string; section: string | null; sort_order: number }
  musician: { id: string; first_name: string; last_name: string } | null
}

export type BookForImport = {
  id: string
  name: string
  book_entries: {
    instrument_id: string
    chair_number: number | null
    musician_id: string
  }[]
}

interface ProjectPositionsProps {
  positions: PositionJoined[]
  projectId: string
  books: BookForImport[]
  canManage: boolean
  onPositionChange: () => void
}

const STATUS_COLORS: Record<string, string> = {
  vacant: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  offered: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  confirmed: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  declined: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
}

const STATUS_LABELS: Record<string, string> = {
  vacant: 'Vacant',
  offered: 'Offered',
  confirmed: 'Confirmed',
  declined: 'Declined',
}

export function ProjectPositions({
  positions,
  projectId,
  books,
  canManage,
  onPositionChange,
}: ProjectPositionsProps) {
  const [importOpen, setImportOpen] = useState(false)
  const [clearing, setClearing] = useState(false)

  // Group positions by section
  const grouped = INSTRUMENT_SECTIONS.reduce((acc, section) => {
    acc[section] = positions
      .filter((p) => (p.instrument?.section || 'other') === section)
      .sort((a, b) => {
        const sortA = a.instrument?.sort_order ?? 999
        const sortB = b.instrument?.sort_order ?? 999
        if (sortA !== sortB) return sortA - sortB
        return a.chair_number - b.chair_number
      })
    return acc
  }, {} as Record<string, PositionJoined[]>)

  async function handleRemovePosition(positionId: string) {
    const supabase = createClient()
    await supabase.from('project_positions').delete().eq('id', positionId)
    onPositionChange()
  }

  async function handleClearAll() {
    if (!confirm('Remove all positions from this project?')) return
    setClearing(true)
    const supabase = createClient()
    await supabase.from('project_positions').delete().eq('project_id', projectId)
    setClearing(false)
    onPositionChange()
  }

  async function handleStatusChange(positionId: string, newStatus: string) {
    const supabase = createClient()
    await supabase.from('project_positions').update({ status: newStatus }).eq('id', positionId)
    onPositionChange()
  }

  async function handleUnassign(positionId: string) {
    const supabase = createClient()
    await supabase
      .from('project_positions')
      .update({ musician_id: null, status: 'vacant' })
      .eq('id', positionId)
    onPositionChange()
  }

  const totalPositions = positions.length
  const filledPositions = positions.filter((p) => p.musician_id).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-semibold">Staffing</h4>
          {totalPositions > 0 && (
            <span className="text-xs text-muted-foreground">
              {filledPositions}/{totalPositions} filled
            </span>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-1">
            {totalPositions > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={handleClearAll}
                disabled={clearing}
              >
                Clear All
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
              Import from Book
            </Button>
          </div>
        )}
      </div>

      {totalPositions === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No positions defined. Import from a book to set up staffing.
        </p>
      ) : (
        <div className="rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-xs">Instrument</th>
                <th className="px-3 py-2 text-left font-medium text-xs">Chair</th>
                <th className="px-3 py-2 text-left font-medium text-xs">Musician</th>
                <th className="px-3 py-2 text-left font-medium text-xs">Status</th>
                {canManage && (
                  <th className="px-3 py-2 text-right font-medium text-xs">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {INSTRUMENT_SECTIONS.map((section) => {
                const sectionPositions = grouped[section]
                if (sectionPositions.length === 0) return null
                return (
                  <Fragment key={section}>
                    <tr>
                      <td
                        colSpan={canManage ? 5 : 4}
                        className="px-3 py-1.5 bg-muted/20 text-xs font-semibold text-muted-foreground"
                      >
                        {SECTION_LABELS[section]}
                      </td>
                    </tr>
                    {sectionPositions.map((position) => (
                      <tr key={position.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2">{position.instrument?.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{position.chair_number}</td>
                        <td className="px-3 py-2">
                          {position.musician
                            ? `${position.musician.first_name} ${position.musician.last_name}`
                            : <span className="text-muted-foreground italic">Unassigned</span>
                          }
                        </td>
                        <td className="px-3 py-2">
                          {canManage ? (
                            <select
                              className="rounded border bg-background px-2 py-0.5 text-xs"
                              value={position.status}
                              onChange={(e) => handleStatusChange(position.id, e.target.value)}
                            >
                              <option value="vacant">Vacant</option>
                              <option value="offered">Offered</option>
                              <option value="confirmed">Confirmed</option>
                              <option value="declined">Declined</option>
                            </select>
                          ) : (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[position.status] || ''}`}>
                              {STATUS_LABELS[position.status] || position.status}
                            </span>
                          )}
                        </td>
                        {canManage && (
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {position.musician_id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUnassign(position.id)}
                                >
                                  Unassign
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleRemovePosition(position.id)}
                              >
                                Remove
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ImportFromBookDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        books={books}
        projectId={projectId}
        onSuccess={onPositionChange}
      />
    </div>
  )
}
