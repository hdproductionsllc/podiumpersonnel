'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export type MusicianScheduleEntry = {
  id: string
  title: string
  start_time: string
  end_time: string
}

export type MusicianForOffer = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  musician_instruments: { instrument_id: string }[]
  competing_schedules: MusicianScheduleEntry[]
  zip_code?: string | null
  service_radius_miles?: number | null
  call_order?: number
  is_leader?: boolean
}

interface SendOfferDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  positionId: string
  instrumentId: string
  instrumentName?: string
  chairNumber: number
  musicians: MusicianForOffer[]
  existingOfferMusicianIds: string[]
  basePay?: number | null
  leaderFee?: number | null
  suggestedCustomPay?: string
  projectEndDate?: string | null
  nextVacantCount?: number
  nextInstrumentName?: string
  onSuccess: (applyPayToRemaining?: { customPay: string }) => void
  onSendNext?: () => void
}

export function SendOfferDialog({
  open,
  onOpenChange,
  positionId,
  instrumentId,
  instrumentName,
  chairNumber,
  musicians,
  existingOfferMusicianIds,
  basePay,
  leaderFee,
  suggestedCustomPay,
  projectEndDate,
  nextVacantCount,
  nextInstrumentName,
  onSuccess,
  onSendNext,
}: SendOfferDialogProps) {
  const [selectedMusicianId, setSelectedMusicianId] = useState('')
  const [expiresIn, setExpiresIn] = useState<string>('2')
  const [customDeadline, setCustomDeadline] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [customPay, setCustomPay] = useState<string>(suggestedCustomPay || '')
  const [applyToRemaining, setApplyToRemaining] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddMusician, setShowAddMusician] = useState(false)
  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName, setNewLastName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [addingMusician, setAddingMusician] = useState(false)
  const [locallyAddedMusicians, setLocallyAddedMusicians] = useState<MusicianForOffer[]>([])
  const [updatedEmails, setUpdatedEmails] = useState<Record<string, string>>({})
  const [editingEmail, setEditingEmail] = useState('')
  const [savingEmail, setSavingEmail] = useState(false)
  const [personalMessage, setPersonalMessage] = useState('')
  const [includeLeaderFee, setIncludeLeaderFee] = useState(false)
  const [leaderFeeAmount, setLeaderFeeAmount] = useState<string>('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [sentMusicianName, setSentMusicianName] = useState('')

  // Search state for musician picker
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Initialize pay fields when dialog opens
  useEffect(() => {
    if (open) {
      const isLeader = chairNumber === 1
      const defaultLeaderFee = leaderFee ?? 50
      setIncludeLeaderFee(isLeader && !!leaderFee)
      setLeaderFeeAmount(defaultLeaderFee.toString())

      if (suggestedCustomPay) {
        setCustomPay(suggestedCustomPay)
      } else if (basePay != null) {
        setCustomPay(basePay.toString())
      } else {
        setCustomPay('')
      }

      setLocallyAddedMusicians([])
      setUpdatedEmails({})
      setEditingEmail('')
      setSavingEmail(false)
      setPersonalMessage('')
      setShowConfirmation(false)
      setShowSuccess(false)
      setSentMusicianName('')
      setSearchQuery('')
      setSearchOpen(false)
      setError(null)
    }
  }, [open, suggestedCustomPay, basePay, leaderFee, chairNumber])

  // Auto-suggest the top call-order musician when the dialog opens
  useEffect(() => {
    if (open && !selectedMusicianId) {
      const available = allMusicians
        .filter((m) => !existingOfferMusicianIds.includes(m.id))
        .filter((m) => m.musician_instruments.some((mi) => mi.instrument_id === instrumentId))
        .sort((a, b) => {
          if (isLeaderPosition) {
            if (a.is_leader && !b.is_leader) return -1
            if (!a.is_leader && b.is_leader) return 1
          }
          return (a.call_order ?? 100) - (b.call_order ?? 100)
        })
      if (available.length > 0) {
        setSelectedMusicianId(available[0].id)
      }
    }
  }, [open, instrumentId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Click-outside for search dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Combine prop musicians with locally added ones
  const allMusicians = [...musicians, ...locallyAddedMusicians]

  // Get selected musician's email status
  const selectedMusician = allMusicians.find((m) => m.id === selectedMusicianId)
  const hasEmail = selectedMusician?.email || updatedEmails[selectedMusicianId] ? true : false

  // Calculate pay - base + optional leader fee
  const isLeaderPosition = chairNumber === 1
  const basePayNum = customPay ? parseFloat(customPay) : (basePay ?? 0)
  const leaderFeeNum = includeLeaderFee && leaderFeeAmount ? parseFloat(leaderFeeAmount) : 0
  const finalPay = customPay || basePay != null ? basePayNum + leaderFeeNum : null

  if (!open) return null

  // All musicians without existing offers, split by instrument match
  const allAvailable = allMusicians.filter((m) => !existingOfferMusicianIds.includes(m.id))

  const playsInstrument = (m: MusicianForOffer) =>
    m.musician_instruments.some((mi) => mi.instrument_id === instrumentId)

  const sortByCallOrder = (a: MusicianForOffer, b: MusicianForOffer) => {
    if (isLeaderPosition) {
      if (a.is_leader && !b.is_leader) return -1
      if (!a.is_leader && b.is_leader) return 1
    }
    return (a.call_order ?? 100) - (b.call_order ?? 100)
  }

  const instrumentMusicians = allAvailable.filter(playsInstrument).sort(sortByCallOrder)
  const otherMusicians = allAvailable.filter((m) => !playsInstrument(m)).sort(sortByCallOrder)

  // By default show instrument musicians; when searching, show all
  const availableMusicians = searchQuery.trim()
    ? [...instrumentMusicians, ...otherMusicians]
    : instrumentMusicians

  // Filter by search query
  const filteredMusicians = searchQuery.trim()
    ? availableMusicians.filter((m) => {
        const q = searchQuery.toLowerCase()
        return (
          m.first_name.toLowerCase().includes(q) ||
          m.last_name.toLowerCase().includes(q) ||
          `${m.first_name} ${m.last_name}`.toLowerCase().includes(q) ||
          `${m.last_name}, ${m.first_name}`.toLowerCase().includes(q)
        )
      })
    : availableMusicians

  // Calculate deadline context
  function getDeadlineContext(): { text: string; color: string } | null {
    if (!projectEndDate) return null

    let deadlineDate: Date | null = null
    if (expiresIn === 'custom' && customDeadline) {
      deadlineDate = new Date(customDeadline + 'T23:59:59')
    } else if (expiresIn === '0.17') {
      deadlineDate = new Date(Date.now() + 4 * 60 * 60 * 1000)
    } else if (expiresIn && expiresIn !== '') {
      deadlineDate = new Date(Date.now() + parseInt(expiresIn) * 24 * 60 * 60 * 1000)
    }

    if (!deadlineDate) return null

    const concertDate = new Date(projectEndDate + 'T23:59:59')
    const diffMs = concertDate.getTime() - deadlineDate.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays < 0) {
      return { text: 'Deadline is after the concert date!', color: 'text-red-600 dark:text-red-400' }
    }
    if (diffDays <= 2) {
      return { text: `Concert is in ${diffDays} day${diffDays !== 1 ? 's' : ''} — tight timeline!`, color: 'text-amber-600 dark:text-amber-400' }
    }
    return { text: `${diffDays} days before the concert`, color: 'text-muted-foreground' }
  }

  const deadlineContext = getDeadlineContext()

  async function handleSend() {
    if (!selectedMusicianId) return

    setLoading(true)
    setError(null)

    const supabase = createClient()

    let expiresAt: string | null = null
    if (expiresIn === '0.17') {
      // ASAP = 4 hours
      expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
    } else if (expiresIn === 'custom') {
      expiresAt = customDeadline ? new Date(customDeadline + 'T23:59:59').toISOString() : null
    } else if (expiresIn) {
      expiresAt = new Date(Date.now() + parseInt(expiresIn) * 24 * 60 * 60 * 1000).toISOString()
    }

    const insertData: Record<string, unknown> = {
      project_position_id: positionId,
      musician_id: selectedMusicianId,
      status: 'pending',
      sent_at: new Date().toISOString(),
      expires_at: expiresAt,
      custom_pay: finalPay ?? null,
    }
    if (personalMessage.trim()) {
      insertData.personal_message = personalMessage.trim()
    }

    const { data: offerData, error: insertError } = await supabase
      .from('contract_offers')
      .insert(insertData)
      .select('id')
      .single()

    if (insertError) {
      setLoading(false)
      setError(insertError.message)
      return
    }

    // Update position status to offered
    await supabase
      .from('project_positions')
      .update({ status: 'offered' })
      .eq('id', positionId)

    // Send email notification if enabled and musician has email
    if (sendEmail && hasEmail && offerData?.id) {
      try {
        const response = await fetch('/api/offers/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offerId: offerData.id }),
        })

        if (!response.ok) {
          toast.error('Offer created but email failed to send. Contact the musician manually.')
        }
      } catch {
        toast.error('Offer created but email failed to send. Contact the musician manually.')
      }
    }

    setLoading(false)

    const musicianName = `${selectedMusician?.first_name} ${selectedMusician?.last_name}`

    // Show celebration toast
    if (sendEmail && hasEmail) {
      toast.success(`Call sent to ${musicianName}! They'll receive the email in seconds.`)
    } else {
      toast.success(`Offer created for ${musicianName}.`)
    }

    // If there are more vacant positions, show success view with "Send Next"
    if (nextVacantCount && nextVacantCount > 0 && onSendNext) {
      setSentMusicianName(musicianName)
      setShowSuccess(true)
    } else {
      setSelectedMusicianId('')
      onOpenChange(false)
      if (applyToRemaining && customPay) {
        onSuccess({ customPay })
      } else {
        onSuccess()
      }
    }
  }

  function handleClose() {
    setSelectedMusicianId('')
    setCustomPay('')
    setApplyToRemaining(false)
    setShowConfirmation(false)
    setShowSuccess(false)
    setPersonalMessage('')
    setError(null)
    onOpenChange(false)
  }

  function handleSuccessClose() {
    setShowSuccess(false)
    setSelectedMusicianId('')
    onOpenChange(false)
    if (applyToRemaining && customPay) {
      onSuccess({ customPay })
    } else {
      onSuccess()
    }
  }

  function handleSendNext() {
    setShowSuccess(false)
    setShowConfirmation(false)
    setSelectedMusicianId('')
    setError(null)
    onOpenChange(false)
    if (applyToRemaining && customPay) {
      onSuccess({ customPay })
    } else {
      onSuccess()
    }
    // Trigger the parent to open the next vacant position
    setTimeout(() => onSendNext?.(), 100)
  }

  function handleProceedToConfirm() {
    if (!selectedMusicianId) return
    setShowConfirmation(true)
  }

  function handleBackToForm() {
    setShowConfirmation(false)
  }

  // Success view after sending
  if (showSuccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="fixed inset-0 bg-black/50" onClick={handleSuccessClose} />
        <div className="relative bg-background rounded-lg border shadow-lg w-full max-w-md p-6 space-y-4 text-center">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <svg className="h-8 w-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
          </div>
          <h3 className="text-lg font-semibold">Offer Sent!</h3>
          <p className="text-sm text-muted-foreground">
            {sentMusicianName} has been sent the offer.
          </p>
          {nextVacantCount && nextVacantCount > 0 && nextInstrumentName && (
            <div className="rounded-md border bg-muted/30 p-4">
              <p className="text-sm font-medium">
                {nextVacantCount} more vacant {nextInstrumentName} position{nextVacantCount !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Send the next offer?</p>
            </div>
          )}
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={handleSuccessClose}>
              Done
            </Button>
            {nextVacantCount && nextVacantCount > 0 && onSendNext && (
              <Button onClick={handleSendNext}>
                Send Next
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const formView = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-background rounded-lg border shadow-lg w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold">Send Contract Offer</h3>
        <p className="text-sm text-muted-foreground">
          Select a musician to send an offer for this position.
        </p>

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Musician</label>
            {availableMusicians.length === 0 && allAvailable.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No available musicians. Add one below or from the Musicians page.
              </p>
            ) : (
              <>
                {/* Searchable musician picker */}
                <div ref={searchRef} className="relative">
                  <input
                    type="text"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    placeholder="Search by name..."
                    value={selectedMusicianId && !searchOpen
                      ? `${selectedMusician?.last_name}, ${selectedMusician?.first_name}`
                      : searchQuery
                    }
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setSearchOpen(true)
                      if (selectedMusicianId) {
                        setSelectedMusicianId('')
                        setEditingEmail('')
                      }
                    }}
                    onFocus={() => {
                      setSearchOpen(true)
                      if (selectedMusicianId) {
                        setSearchQuery('')
                      }
                    }}
                  />
                  {selectedMusicianId && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMusicianId('')
                        setSearchQuery('')
                        setSearchOpen(true)
                        setEditingEmail('')
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  {searchOpen && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-64 overflow-auto">
                      {filteredMusicians.length > 0 ? (
                        (() => {
                          const instrumentGroup = filteredMusicians.filter(playsInstrument)
                          const otherGroup = filteredMusicians.filter((m) => !playsInstrument(m))
                          return (
                            <>
                              {instrumentGroup.map((m) => {
                                const hasConflict = m.competing_schedules && m.competing_schedules.length > 0
                                return (
                                  <button
                                    key={m.id}
                                    type="button"
                                    className="w-full px-3 py-2 text-left hover:bg-muted flex items-center justify-between gap-2"
                                    onClick={() => {
                                      setSelectedMusicianId(m.id)
                                      setSearchQuery('')
                                      setSearchOpen(false)
                                    }}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="font-medium text-sm truncate">
                                        {m.last_name}, {m.first_name}
                                      </span>
                                      {m.is_leader && (
                                        <span className="text-amber-500 flex-shrink-0" title="Leader">&#9733;</span>
                                      )}
                                      {!m.email && !updatedEmails[m.id] && (
                                        <span className="text-xs text-amber-600 dark:text-amber-400 flex-shrink-0" title="No email">
                                          No email
                                        </span>
                                      )}
                                      {hasConflict && (
                                        <span className="text-xs text-red-600 dark:text-red-400 flex-shrink-0" title="Schedule conflict">
                                          Conflict
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {m.call_order != null && m.call_order < 100 && (
                                        <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
                                          #{m.call_order}
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                )
                              })}
                              {otherGroup.length > 0 && (
                                <>
                                  <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50 border-t">
                                    Other musicians
                                  </div>
                                  {otherGroup.map((m) => {
                                    const hasConflict = m.competing_schedules && m.competing_schedules.length > 0
                                    return (
                                      <button
                                        key={m.id}
                                        type="button"
                                        className="w-full px-3 py-2 text-left hover:bg-muted flex items-center justify-between gap-2"
                                        onClick={async () => {
                                          // Auto-link instrument
                                          const supabase = createClient()
                                          await supabase.from('musician_instruments').insert({
                                            musician_id: m.id,
                                            instrument_id: instrumentId,
                                            is_primary: false,
                                            proficiency: 'professional',
                                          })
                                          m.musician_instruments.push({ instrument_id: instrumentId })
                                          toast.success(`Added ${instrumentName || 'instrument'} to ${m.first_name} ${m.last_name}'s profile`)
                                          setSelectedMusicianId(m.id)
                                          setSearchQuery('')
                                          setSearchOpen(false)
                                        }}
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="font-medium text-sm truncate">
                                            {m.last_name}, {m.first_name}
                                          </span>
                                          <span className="text-xs text-muted-foreground flex-shrink-0">(other instrument)</span>
                                          {!m.email && !updatedEmails[m.id] && (
                                            <span className="text-xs text-amber-600 dark:text-amber-400 flex-shrink-0" title="No email">
                                              No email
                                            </span>
                                          )}
                                          {hasConflict && (
                                            <span className="text-xs text-red-600 dark:text-red-400 flex-shrink-0" title="Schedule conflict">
                                              Conflict
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                          {m.call_order != null && m.call_order < 100 && (
                                            <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
                                              #{m.call_order}
                                            </span>
                                          )}
                                        </div>
                                      </button>
                                    )
                                  })}
                                </>
                              )}
                            </>
                          )
                        })()
                      ) : (
                        <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                          No musicians match &quot;{searchQuery}&quot;
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {selectedMusicianId && !hasEmail && (
                  <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200">
                    <p className="font-medium mb-2">This musician has no email on file.</p>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        placeholder="Enter email address"
                        value={editingEmail}
                        onChange={(e) => setEditingEmail(e.target.value)}
                        className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
                      />
                      <Button
                        size="sm"
                        disabled={savingEmail || !editingEmail.trim() || !editingEmail.includes('@')}
                        onClick={async () => {
                          setSavingEmail(true)
                          try {
                            const supabase = createClient()
                            const email = editingEmail.trim().toLowerCase()
                            const { error: updateErr } = await supabase
                              .from('musicians')
                              .update({ email })
                              .eq('id', selectedMusicianId)
                            if (updateErr) {
                              toast.error('Failed to save email: ' + updateErr.message)
                              return
                            }
                            setUpdatedEmails(prev => ({ ...prev, [selectedMusicianId]: email }))
                            setEditingEmail('')
                            setSendEmail(true)
                            toast.success('Email saved!')
                          } catch {
                            toast.error('Failed to save email')
                          } finally {
                            setSavingEmail(false)
                          }
                        }}
                      >
                        {savingEmail ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                    <p className="text-xs mt-1.5 opacity-70">
                      Add an email to send the offer notification.
                    </p>
                  </div>
                )}
                {!selectedMusicianId && (
                  !showAddMusician ? (
                    <button
                      type="button"
                      className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                      onClick={() => setShowAddMusician(true)}
                    >
                      + Add New Musician
                    </button>
                  ) : (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Quick Add Musician</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="First name"
                          value={newFirstName}
                          onChange={(e) => setNewFirstName(e.target.value)}
                          className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Last name"
                          value={newLastName}
                          onChange={(e) => setNewLastName(e.target.value)}
                          className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                        />
                      </div>
                      <input
                        type="email"
                        placeholder="Email address (required)"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={addingMusician || (!newFirstName.trim() && !newLastName.trim()) || !newEmail.trim() || !newEmail.includes('@')}
                          onClick={async () => {
                            if (!newFirstName.trim() && !newLastName.trim()) return
                            if (!newEmail.trim() || !newEmail.includes('@')) return
                            setAddingMusician(true)
                            try {
                              const supabase = createClient()
                              const { data: membership } = await supabase
                                .from('organization_members')
                                .select('organization_id')
                                .single()
                              if (!membership) { setError('No organization found'); return }
                              const { data: newMusician, error: insertErr } = await supabase
                                .from('musicians')
                                .insert({
                                  organization_id: membership.organization_id,
                                  first_name: newFirstName.trim() || newLastName.trim(),
                                  last_name: newFirstName.trim() ? newLastName.trim() : '',
                                  email: newEmail.trim().toLowerCase(),
                                  is_active: true,
                                })
                                .select('id')
                                .single()
                              if (insertErr) { setError(insertErr.message); return }
                              // Also link to the current instrument
                              if (newMusician) {
                                await supabase
                                  .from('musician_instruments')
                                  .insert({
                                    musician_id: newMusician.id,
                                    instrument_id: instrumentId,
                                    is_primary: true,
                                    proficiency: 'professional',
                                  })
                                // Add to local list so dropdown and confirmation can find them
                                setLocallyAddedMusicians(prev => [...prev, {
                                  id: newMusician.id,
                                  first_name: newFirstName.trim() || newLastName.trim(),
                                  last_name: newFirstName.trim() ? newLastName.trim() : '',
                                  email: newEmail.trim().toLowerCase(),
                                  musician_instruments: [{ instrument_id: instrumentId }],
                                  competing_schedules: [],
                                }])
                                setSelectedMusicianId(newMusician.id)
                              }
                              setNewFirstName('')
                              setNewLastName('')
                              setNewEmail('')
                              setShowAddMusician(false)
                            } catch {
                              setError('Failed to add musician')
                            } finally {
                              setAddingMusician(false)
                            }
                          }}
                        >
                          {addingMusician ? 'Adding...' : 'Add & Select'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setShowAddMusician(false); setNewFirstName(''); setNewLastName(''); setNewEmail('') }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )
                )}
              </>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Response deadline</label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={expiresIn}
              onChange={(e) => setExpiresIn(e.target.value)}
            >
              <option value="0.17">ASAP (4 hours)</option>
              <option value="1">24 hours</option>
              <option value="2">48 hours (recommended)</option>
              <option value="7">1 week</option>
              <option value="custom">Custom date</option>
              <option value="">No expiration</option>
            </select>
            {expiresIn === 'custom' && (
              <input
                type="date"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm mt-2"
                value={customDeadline}
                onChange={(e) => setCustomDeadline(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            )}
            {deadlineContext && (
              <p className={`text-xs ${deadlineContext.color}`}>
                {deadlineContext.text}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium">Pay <span className="text-destructive">*</span></label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="Base pay amount"
                  value={customPay}
                  onChange={(e) => setCustomPay(e.target.value)}
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="includeLeaderFee"
                  checked={includeLeaderFee}
                  onChange={(e) => setIncludeLeaderFee(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="includeLeaderFee" className="text-sm">
                  Add leader fee
                </label>
                {includeLeaderFee && (
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">+$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={leaderFeeAmount}
                      onChange={(e) => setLeaderFeeAmount(e.target.value)}
                      className="w-20 rounded-md border bg-background px-2 py-1 text-sm"
                    />
                  </div>
                )}
              </div>
            </div>

            {finalPay != null && (customPay || basePay != null) && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                <div className="flex justify-between font-medium">
                  <span>Total offer:</span>
                  <span className="tabular-nums">${finalPay.toFixed(2)}</span>
                </div>
                {includeLeaderFee && leaderFeeNum > 0 && (
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>${basePayNum} base + ${leaderFeeNum} leader fee</span>
                  </div>
                )}
              </div>
            )}

            {customPay && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="applyToRemaining"
                  checked={applyToRemaining}
                  onChange={(e) => setApplyToRemaining(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="applyToRemaining" className="text-sm">
                  Apply this pay to remaining unsent offers
                </label>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="sendEmail"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              disabled={!hasEmail}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="sendEmail" className="text-sm">
              Send email notification
            </label>
            {selectedMusicianId && !hasEmail && (
              <span className="text-xs text-amber-600">(No email on file)</span>
            )}
          </div>

          {/* Personal Message */}
          {sendEmail && hasEmail && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Personal Note <span className="text-xs text-muted-foreground">(optional)</span></label>
              <textarea
                className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Add a personal touch to the email..."
                value={personalMessage}
                onChange={(e) => setPersonalMessage(e.target.value.slice(0, 500))}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-right">
                {personalMessage.length}/500
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleProceedToConfirm} disabled={!selectedMusicianId || finalPay == null || finalPay <= 0 || loading}>
            Review & Send
          </Button>
        </div>
      </div>
    </div>
  )

  // Confirmation view
  const confirmationView = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-background rounded-lg border shadow-lg w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-semibold">Confirm Offer</h3>

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="rounded-md border bg-muted/30 p-4 space-y-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Musician:</span>
            <span className="font-medium">
              {selectedMusician?.first_name} {selectedMusician?.last_name}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email:</span>
            <span>{updatedEmails[selectedMusicianId] || selectedMusician?.email || 'No email on file'}</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pay:</span>
              <span className="font-medium">${finalPay?.toFixed(2) ?? 'Not set'}</span>
            </div>
            {includeLeaderFee && leaderFeeNum > 0 && (
              <div className="text-xs text-muted-foreground pl-2">
                ${basePayNum} base + ${leaderFeeNum} leader fee
              </div>
            )}
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Expires:</span>
            <span>
              {expiresIn === '0.17' ? '4 hours' :
               expiresIn === 'custom' ? (customDeadline || 'No date selected') :
               expiresIn ? `${expiresIn} day${expiresIn === '1' ? '' : 's'}` :
               'No expiration'}
            </span>
          </div>
          {personalMessage.trim() && (
            <div className="pt-2 border-t">
              <span className="text-xs text-muted-foreground">Personal note:</span>
              <p className="text-sm mt-1 italic">&quot;{personalMessage.trim()}&quot;</p>
            </div>
          )}
          {sendEmail && hasEmail && (
            <div className="pt-2 border-t text-sm text-green-600">
              Email will be sent to {updatedEmails[selectedMusicianId] || selectedMusician?.email}
            </div>
          )}
          {sendEmail && !hasEmail && (
            <div className="pt-2 border-t text-sm text-amber-600 font-medium">
              No email will be sent - musician has no email on file.
              You must contact them manually.
            </div>
          )}
          {!sendEmail && (
            <div className="pt-2 border-t text-sm text-muted-foreground">
              Email notification disabled
            </div>
          )}
        </div>

        <div className="flex justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={previewLoading || loading}
            onClick={async () => {
              setPreviewLoading(true)
              try {
                const res = await fetch('/api/offers/preview-email', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    positionId,
                    musicianId: selectedMusicianId,
                    personalMessage: personalMessage.trim() || undefined,
                    customPay: finalPay ?? undefined,
                  }),
                })
                const data = await res.json()
                if (data.html) {
                  setPreviewHtml(data.html)
                  setShowPreview(true)
                }
              } catch {
                // ignore preview errors
              }
              setPreviewLoading(false)
            }}
          >
            {previewLoading ? 'Loading...' : 'Preview Email'}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleBackToForm} disabled={loading}>
              Back
            </Button>
            <Button onClick={handleSend} disabled={loading}>
              {loading ? 'Sending...' : 'Confirm & Send Offer'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  // Email preview modal
  const previewModal = showPreview && previewHtml ? (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={() => setShowPreview(false)} />
      <div className="relative bg-background rounded-lg border shadow-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Email Preview</h3>
          <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}>
            Close
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <iframe
            srcDoc={previewHtml}
            className="w-full h-[600px] border rounded"
            title="Email Preview"
          />
        </div>
      </div>
    </div>
  ) : null

  return (
    <>
      {showConfirmation ? confirmationView : formView}
      {previewModal}
    </>
  )
}
