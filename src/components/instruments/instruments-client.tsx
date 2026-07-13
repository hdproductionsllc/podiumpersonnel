'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/ui/empty-state'
import { InstrumentSectionGroup } from './instrument-section-group'
import { InstrumentFormDialog } from './instrument-form-dialog'
import { DeleteInstrumentDialog } from './delete-instrument-dialog'
import { PrepopulateButton } from './prepopulate-button'
import { AddMissingButton } from './add-missing-button'
import { INSTRUMENT_SECTIONS, SECTION_LABELS } from '@/lib/validations/instruments'
import type { Instrument } from '@/types'
import { useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'

export type MusicianInfo = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  is_active: boolean
}

export type InstrumentWithMusicians = Instrument & {
  musician_instruments: {
    id: string
    musician: MusicianInfo
  }[]
}

interface InstrumentsClientProps {
  instruments: InstrumentWithMusicians[]
  organizationId: string
  userRole: string
}

export function InstrumentsClient({
  instruments,
  organizationId,
  userRole,
}: InstrumentsClientProps) {
  const router = useRouter()
  const terms = useTerms()
  const [formOpen, setFormOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editingInstrument, setEditingInstrument] = useState<Instrument | null>(null)
  const [deletingInstrument, setDeletingInstrument] = useState<Instrument | null>(null)

  // Filter state
  const [search, setSearch] = useState('')
  const [sectionFilter, setSectionFilter] = useState('')

  const canManage = userRole === 'owner' || userRole === 'admin'

  const hasFilters = search !== '' || sectionFilter !== ''

  const filteredInstruments = instruments.filter((i) => {
    if (search) {
      const q = search.toLowerCase()
      if (!i.name.toLowerCase().includes(q) && !(i.abbreviation || '').toLowerCase().includes(q)) return false
    }
    if (sectionFilter && (i.section || 'other') !== sectionFilter) return false
    return true
  })

  const grouped = INSTRUMENT_SECTIONS.reduce((acc, section) => {
    acc[section] = filteredInstruments.filter(
      (i) => (i.section || 'other') === section
    )
    return acc
  }, {} as Record<string, InstrumentWithMusicians[]>)

  function handleAdd() {
    setEditingInstrument(null)
    setFormOpen(true)
  }

  function handleEdit(instrument: InstrumentWithMusicians) {
    setEditingInstrument(instrument)
    setFormOpen(true)
  }

  function handleDelete(instrument: InstrumentWithMusicians) {
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
        <div className="page-header">
          <h2 className="text-3xl font-bold tracking-tight">{term(terms, 'skill', { plural: true })}</h2>
          <p className="text-muted-foreground mt-1">
            Manage the {term(terms, 'skill', { plural: true, case: 'lower' })} in your orchestra.
          </p>
          <div className="mt-3 w-12 h-px bg-gold/50" />
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {instruments.length === 0 && (
              <PrepopulateButton
                organizationId={organizationId}
                onSuccess={handleSuccess}
              />
            )}
            {instruments.length > 0 && (
              <AddMissingButton
                organizationId={organizationId}
                existingNames={instruments.map(i => i.name)}
                onSuccess={handleSuccess}
              />
            )}
            <Button onClick={handleAdd}>Add {term(terms, 'skill')}</Button>
          </div>
        )}
      </div>

      <Separator />

      {instruments.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder={`Search ${term(terms, 'skill', { plural: true, case: 'lower' })}...`}
            className="rounded-md border bg-background px-3 py-2 text-sm w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
          >
            <option value="">All sections</option>
            {INSTRUMENT_SECTIONS.map((s) => (
              <option key={s} value={s}>{SECTION_LABELS[s]}</option>
            ))}
          </select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(''); setSectionFilter('') }}
            >
              Clear
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {filteredInstruments.length} of {instruments.length} {term(terms, 'skill', { plural: true, case: 'lower' })}
          </span>
        </div>
      )}

      {instruments.length === 0 ? (
        <EmptyState
          icon={
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V4.103A2.25 2.25 0 0 0 17.378 2h-.403a2.25 2.25 0 0 0-1.5.563L9 9m10.5-3H9m0 0v7.5m0 0-4.5 1.286v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 4.5 14.25v-7.5" />
            </svg>
          }
          title={`No ${term(terms, 'skill', { plural: true, case: 'lower' })} yet`}
          description={`Set up your ${term(terms, 'skill', { case: 'lower' })} library to assign ${term(terms, 'person', { plural: true, case: 'lower' })} and build positions.`}
          action={canManage ? (
            <PrepopulateButton organizationId={organizationId} onSuccess={handleSuccess} />
          ) : undefined}
        />
      ) : filteredInstruments.length === 0 ? (
        <EmptyState title={`No ${term(terms, 'skill', { plural: true, case: 'lower' })} match your filters`} />
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
