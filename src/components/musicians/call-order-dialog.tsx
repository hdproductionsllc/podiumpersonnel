'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
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
import { toast } from 'sonner'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Star } from 'lucide-react'
import { INSTRUMENT_SECTIONS, SECTION_LABELS, type InstrumentSection } from '@/lib/validations/instruments'
import type { MusicianWithInstruments, InstrumentOption } from './musicians-client'

interface CallOrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  musicians: MusicianWithInstruments[]
  instruments: InstrumentOption[]
}

interface SortableMusician {
  id: string
  firstName: string
  lastName: string
  callOrder: number | undefined
  isLeader: boolean
}

function SortableItem({ musician, position }: { musician: SortableMusician; position: number }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: musician.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-md border bg-background px-3 py-2.5 ${
        isDragging ? 'z-50 shadow-lg ring-2 ring-primary/20' : ''
      }`}
    >
      <span className="w-7 text-center text-sm font-medium text-muted-foreground">
        {position}
      </span>
      <button
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 text-sm font-medium">
        {musician.lastName}, {musician.firstName}
      </span>
      {musician.isLeader && (
        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      )}
    </div>
  )
}

export function CallOrderDialog({
  open,
  onOpenChange,
  musicians,
  instruments,
}: CallOrderDialogProps) {
  const router = useRouter()
  const [selectedInstrument, setSelectedInstrument] = useState('')
  const [orderedMusicians, setOrderedMusicians] = useState<SortableMusician[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [hasReordered, setHasReordered] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Group instruments by section, only those with active musicians
  const instrumentsBySection = useMemo(() => {
    const activeMusicians = musicians.filter((m) => m.is_active)
    const instrumentMusicians = new Map<string, number>()

    for (const m of activeMusicians) {
      for (const mi of m.musician_instruments) {
        instrumentMusicians.set(
          mi.instrument_id,
          (instrumentMusicians.get(mi.instrument_id) || 0) + 1
        )
      }
    }

    const grouped: { section: InstrumentSection; label: string; instruments: (InstrumentOption & { count: number })[] }[] = []

    for (const section of INSTRUMENT_SECTIONS) {
      const sectionInstruments = instruments
        .filter((inst) => inst.section === section && instrumentMusicians.has(inst.id))
        .map((inst) => ({ ...inst, count: instrumentMusicians.get(inst.id) || 0 }))

      if (sectionInstruments.length > 0) {
        grouped.push({
          section,
          label: SECTION_LABELS[section],
          instruments: sectionInstruments,
        })
      }
    }

    // Also include instruments with no section
    const noSectionInstruments = instruments
      .filter((inst) => !inst.section && instrumentMusicians.has(inst.id))
      .map((inst) => ({ ...inst, count: instrumentMusicians.get(inst.id) || 0 }))

    if (noSectionInstruments.length > 0) {
      grouped.push({
        section: 'other' as InstrumentSection,
        label: 'Other',
        instruments: noSectionInstruments,
      })
    }

    return grouped
  }, [musicians, instruments])

  function handleInstrumentSelect(instrumentId: string) {
    setSelectedInstrument(instrumentId)
    setHasReordered(false)

    const activeMusicians = musicians.filter((m) => m.is_active)
    const musiciansForInstrument = activeMusicians
      .filter((m) => m.musician_instruments.some((mi) => mi.instrument_id === instrumentId))
      .map((m) => ({
        id: m.id,
        firstName: m.first_name,
        lastName: m.last_name,
        callOrder: m.call_order,
        isLeader: m.is_leader || false,
      }))
      .sort((a, b) => {
        // Sort by call_order first, then alphabetical by last name as tiebreaker
        const aOrder = a.callOrder ?? 999999
        const bOrder = b.callOrder ?? 999999
        if (aOrder !== bOrder) return aOrder - bOrder
        return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
      })

    setOrderedMusicians(musiciansForInstrument)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setOrderedMusicians((items) => {
      const oldIndex = items.findIndex((i) => i.id === active.id)
      const newIndex = items.findIndex((i) => i.id === over.id)
      return arrayMove(items, oldIndex, newIndex)
    })
    setHasReordered(true)
  }

  async function handleSave() {
    if (orderedMusicians.length === 0) return

    setIsSaving(true)
    const supabase = createClient()
    let errorCount = 0

    for (let i = 0; i < orderedMusicians.length; i++) {
      const { error } = await supabase
        .from('musicians')
        .update({ call_order: i + 1 })
        .eq('id', orderedMusicians[i].id)

      if (error) {
        console.error(`Error updating call_order for ${orderedMusicians[i].id}:`, error)
        errorCount++
      }
    }

    setIsSaving(false)

    if (errorCount > 0) {
      toast.error(`Failed to update ${errorCount} musician${errorCount !== 1 ? 's' : ''}`)
    } else {
      const instrumentName = instruments.find((i) => i.id === selectedInstrument)?.name
      toast.success(`Call order saved for ${orderedMusicians.length} ${instrumentName} musicians`)
      setHasReordered(false)
      router.refresh()
    }
  }

  function handleClose() {
    setSelectedInstrument('')
    setOrderedMusicians([])
    setHasReordered(false)
    onOpenChange(false)
  }

  function handleBack() {
    setSelectedInstrument('')
    setOrderedMusicians([])
    setHasReordered(false)
  }

  const selectedInstrumentName = instruments.find((i) => i.id === selectedInstrument)?.name

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {selectedInstrument ? `Call Order — ${selectedInstrumentName}` : 'Call Order'}
          </DialogTitle>
          <DialogDescription>
            {selectedInstrument
              ? 'Drag musicians to set the order they\'ll be offered gigs. #1 gets called first.'
              : 'Call order determines which musicians get offered gigs first in the waterfall system. Pick an instrument to reorder.'}
          </DialogDescription>
        </DialogHeader>

        {!selectedInstrument ? (
          /* Phase 1: Instrument picker */
          <div className="py-2">
            {instrumentsBySection.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No instruments with active musicians found.
              </p>
            ) : (
              <div className="space-y-4">
                {instrumentsBySection.map(({ section, label, instruments: sectionInsts }) => (
                  <div key={section}>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      {label}
                    </h4>
                    <div className="space-y-1">
                      {sectionInsts.map((inst) => (
                        <button
                          key={inst.id}
                          onClick={() => handleInstrumentSelect(inst.id)}
                          className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
                        >
                          <span className="font-medium">{inst.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {inst.count} musician{inst.count !== 1 ? 's' : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Phase 2: Drag to reorder */
          <div className="py-2 space-y-3">
            <Button variant="ghost" size="sm" onClick={handleBack} className="mb-1 -ml-2">
              <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Choose instrument
            </Button>

            {orderedMusicians.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No active musicians play this instrument.
              </p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={orderedMusicians.map((m) => m.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1.5">
                    {orderedMusicians.map((musician, index) => (
                      <SortableItem
                        key={musician.id}
                        musician={musician}
                        position={index + 1}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        )}

        {selectedInstrument && orderedMusicians.length > 0 && (
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || orderedMusicians.length <= 1}
            >
              {isSaving ? 'Saving...' : 'Save Order'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
