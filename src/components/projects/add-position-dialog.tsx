'use client'

import { useState, useEffect } from 'react'
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
import { Input } from '@/components/ui/input'
import { INSTRUMENT_SECTIONS, SECTION_LABELS, type InstrumentSection } from '@/lib/validations/instruments'

interface Instrument {
  id: string
  name: string
  section: string | null
  sort_order: number
}

interface SavedPreset {
  id: string
  name: string
  description: string | null
  category: string
  positions: { instrument_name: string; chair_number: number }[]
}

// Built-in preset ensemble configurations
const BUILTIN_PRESETS: { key: string; label: string; description: string; category: string; instruments: [string, number][] }[] = [
  {
    key: 'violin-cello-duo',
    label: 'Violin/Cello Duo',
    description: 'Violin + Cello',
    category: 'chamber',
    instruments: [
      ['Violin 1', 1],
      ['Cello', 1],
    ],
  },
  {
    key: 'string-trio',
    label: 'String Trio',
    description: '2 Violins + Cello',
    category: 'chamber',
    instruments: [
      ['Violin 1', 1],
      ['Violin 1', 2],
      ['Cello', 1],
    ],
  },
  {
    key: 'string-quartet',
    label: 'String Quartet',
    description: '2 Violins + Viola + Cello',
    category: 'chamber',
    instruments: [
      ['Violin 1', 1],
      ['Violin 2', 1],
      ['Viola', 1],
      ['Cello', 1],
    ],
  },
  {
    key: 'string-quintet',
    label: 'String Quintet',
    description: '2 Violins + Viola + Cello + Bass',
    category: 'chamber',
    instruments: [
      ['Violin 1', 1],
      ['Violin 2', 1],
      ['Viola', 1],
      ['Cello', 1],
      ['Double Bass', 1],
    ],
  },
]

interface AddPositionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  organizationId: string
  existingPositions: { instrument_id: string; chair_number: number }[]
  initialMode?: 'presets' | 'single'
  onSuccess: () => void
}

export function AddPositionDialog({
  open,
  onOpenChange,
  projectId,
  organizationId,
  existingPositions,
  initialMode = 'presets',
  onSuccess,
}: AddPositionDialogProps) {
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([])
  const [mode, setMode] = useState<'presets' | 'single'>('presets')
  const [selectedInstrumentId, setSelectedInstrumentId] = useState('')
  const [chairNumber, setChairNumber] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      const supabase = createClient()

      // Fetch instruments
      supabase
        .from('instruments')
        .select('id, name, section, sort_order')
        .eq('organization_id', organizationId)
        .order('sort_order')
        .order('name')
        .then(({ data }) => {
          setInstruments(data || [])
        })

      // Fetch saved presets
      supabase
        .from('staffing_presets')
        .select('id, name, description, category, positions')
        .eq('organization_id', organizationId)
        .order('category')
        .order('name')
        .then(({ data }) => {
          setSavedPresets((data as SavedPreset[]) || [])
        })

      // Reset form
      setMode(initialMode)
      setSelectedInstrumentId('')
      setChairNumber(1)
      setError(null)
    }
  }, [open, organizationId, initialMode])

  // Calculate next available chair number when instrument changes
  useEffect(() => {
    if (selectedInstrumentId) {
      const existingChairs = existingPositions
        .filter(p => p.instrument_id === selectedInstrumentId)
        .map(p => p.chair_number)

      if (existingChairs.length === 0) {
        setChairNumber(1)
      } else {
        const maxChair = Math.max(...existingChairs)
        setChairNumber(maxChair + 1)
      }
    }
  }, [selectedInstrumentId, existingPositions])

  // Find instrument ID by name
  function getInstrumentId(name: string): string | null {
    const inst = instruments.find(i => i.name === name)
    return inst?.id || null
  }

  async function handleAddBuiltinPreset(preset: typeof BUILTIN_PRESETS[0]) {
    setLoading(true)
    setError(null)

    // Build positions to insert
    const positionsToInsert: { project_id: string; instrument_id: string; chair_number: number; status: string }[] = []

    for (const [instrumentName, chair] of preset.instruments) {
      const instrumentId = getInstrumentId(instrumentName)
      if (!instrumentId) {
        setError(`Instrument "${instrumentName}" not found. Please add it in Settings > Instruments first.`)
        setLoading(false)
        return
      }

      // Check if position already exists
      const exists = existingPositions.some(
        p => p.instrument_id === instrumentId && p.chair_number === chair
      )
      if (!exists) {
        positionsToInsert.push({
          project_id: projectId,
          instrument_id: instrumentId,
          chair_number: chair,
          status: 'vacant',
        })
      }
    }

    if (positionsToInsert.length === 0) {
      setError('All positions in this preset already exist')
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { error: insertError } = await supabase
      .from('project_positions')
      .insert(positionsToInsert)

    setLoading(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    onSuccess()
    onOpenChange(false)
  }

  async function handleAddSavedPreset(preset: SavedPreset) {
    setLoading(true)
    setError(null)

    // Build positions to insert
    const positionsToInsert: { project_id: string; instrument_id: string; chair_number: number; status: string }[] = []

    for (const position of preset.positions) {
      const instrumentId = getInstrumentId(position.instrument_name)
      if (!instrumentId) {
        setError(`Instrument "${position.instrument_name}" not found. Please add it in Settings > Instruments first.`)
        setLoading(false)
        return
      }

      // Check if position already exists
      const exists = existingPositions.some(
        p => p.instrument_id === instrumentId && p.chair_number === position.chair_number
      )
      if (!exists) {
        positionsToInsert.push({
          project_id: projectId,
          instrument_id: instrumentId,
          chair_number: position.chair_number,
          status: 'vacant',
        })
      }
    }

    if (positionsToInsert.length === 0) {
      setError('All positions in this preset already exist')
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { error: insertError } = await supabase
      .from('project_positions')
      .insert(positionsToInsert)

    setLoading(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    onSuccess()
    onOpenChange(false)
  }

  async function handleDeletePreset(presetId: string, presetName: string) {
    if (!confirm(`Delete preset "${presetName}"? This cannot be undone.`)) return

    const supabase = createClient()
    const { error: deleteError } = await supabase
      .from('staffing_presets')
      .delete()
      .eq('id', presetId)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setSavedPresets(prev => prev.filter(p => p.id !== presetId))
  }

  async function handleAddSingle() {
    if (!selectedInstrumentId) {
      setError('Please select an instrument')
      return
    }

    // Check for duplicate
    const exists = existingPositions.some(
      p => p.instrument_id === selectedInstrumentId && p.chair_number === chairNumber
    )
    if (exists) {
      setError('This position already exists')
      return
    }

    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: insertError } = await supabase
      .from('project_positions')
      .insert({
        project_id: projectId,
        instrument_id: selectedInstrumentId,
        chair_number: chairNumber,
        status: 'vacant',
      })

    setLoading(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    onSuccess()
    onOpenChange(false)
  }

  // Group instruments by section
  const groupedInstruments = INSTRUMENT_SECTIONS.reduce((acc, section) => {
    acc[section] = instruments.filter(i => i.section === section)
    return acc
  }, {} as Record<InstrumentSection, Instrument[]>)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Positions</DialogTitle>
          <DialogDescription>
            Choose a preset ensemble or add individual positions.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Mode toggle */}
        <div className="flex gap-2 border-b pb-3">
          <Button
            variant={mode === 'presets' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('presets')}
          >
            Ensemble Presets
          </Button>
          <Button
            variant={mode === 'single' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('single')}
          >
            Single Position
          </Button>
        </div>

        {mode === 'presets' ? (
          <div className="space-y-4 py-2 max-h-[400px] overflow-y-auto">
            {/* Saved Presets */}
            {savedPresets.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Your Saved Presets
                </p>
                {savedPresets.map((preset) => (
                  <div key={preset.id} className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 h-auto py-3 flex flex-col items-start"
                      onClick={() => handleAddSavedPreset(preset)}
                      disabled={loading}
                    >
                      <span className="font-semibold">{preset.name}</span>
                      <span className="text-sm text-muted-foreground font-normal">
                        {preset.description || `${preset.positions.length} positions`}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive h-auto py-3"
                      onClick={() => handleDeletePreset(preset.id, preset.name)}
                      disabled={loading}
                      title="Delete preset"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Built-in Presets */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Ensemble Presets
              </p>
              {BUILTIN_PRESETS.map((preset) => (
                <Button
                  key={preset.key}
                  variant="outline"
                  className="w-full h-auto py-3 flex flex-col items-start"
                  onClick={() => handleAddBuiltinPreset(preset)}
                  disabled={loading}
                >
                  <span className="font-semibold">{preset.label}</span>
                  <span className="text-sm text-muted-foreground font-normal">
                    {preset.description}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Instrument</label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={selectedInstrumentId}
                onChange={(e) => setSelectedInstrumentId(e.target.value)}
              >
                <option value="">-- Select instrument --</option>
                {INSTRUMENT_SECTIONS.map((section) => {
                  const sectionInstruments = groupedInstruments[section]
                  if (sectionInstruments.length === 0) return null
                  return (
                    <optgroup key={section} label={SECTION_LABELS[section]}>
                      {sectionInstruments.map((inst) => (
                        <option key={inst.id} value={inst.id}>
                          {inst.name}
                        </option>
                      ))}
                    </optgroup>
                  )
                })}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Chair Number</label>
              <Input
                type="number"
                min={1}
                value={chairNumber}
                onChange={(e) => setChairNumber(parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-muted-foreground">
                Chair 1 typically receives the leader fee for principal positions.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddSingle} disabled={loading || !selectedInstrumentId}>
                {loading ? 'Adding...' : 'Add Position'}
              </Button>
            </DialogFooter>
          </div>
        )}

        {mode === 'presets' && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
