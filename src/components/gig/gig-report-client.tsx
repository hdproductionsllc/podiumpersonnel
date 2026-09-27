'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { SupportLink } from '@/components/ui/support-link'

interface GigReportClientProps {
  token: string
  leadFirstName: string
  organizationName: string
  projectName: string
  gigDate: string
  alreadySubmitted: boolean
  brandColor: string | null
}

type Overall = 'great' | 'good' | 'issues'

const OVERALL_CHOICES: { value: Overall; label: string }[] = [
  { value: 'great', label: 'Went great' },
  { value: 'good', label: 'Fine, small things' },
  { value: 'issues', label: 'There were problems' },
]

export const REPORT_TEXT_LIMIT = 4000

export function GigReportClient({
  token,
  leadFirstName,
  organizationName,
  projectName,
  gigDate,
  alreadySubmitted,
  brandColor,
}: GigReportClientProps) {
  const [submitted, setSubmitted] = useState(alreadySubmitted)
  const [overall, setOverall] = useState<Overall | null>(null)
  const [allOnTime, setAllOnTime] = useState<boolean | null>(null)
  const [lateNotes, setLateNotes] = useState('')
  const [hiccups, setHiccups] = useState('')
  const [clientFollowUp, setClientFollowUp] = useState('')
  const [arrangementNotes, setArrangementNotes] = useState('')
  const [otherNotes, setOtherNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const headerStyle = brandColor ? { backgroundColor: brandColor } : undefined

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!overall || allOnTime === null) {
      setError('Please answer the first two questions.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/report/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overall, allOnTime, lateNotes, hiccups, clientFollowUp, arrangementNotes, otherNotes }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok && !data.alreadySubmitted) throw new Error(data.error || 'Could not send your report')
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const choice = (active: boolean) =>
    `rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
      active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
    }`

  const textField = (id: string, label: string, hint: string, value: string, set: (v: string) => void) => (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-slate-900">{label}</Label>
      <p className="text-xs text-slate-500">{hint}</p>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => set(e.target.value.slice(0, REPORT_TEXT_LIMIT))}
        rows={3}
        className="bg-white"
      />
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-start sm:items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-xl shadow-lg border overflow-hidden">
          <div className="bg-slate-900 px-6 py-5 text-center" style={headerStyle}>
            <h1 className="text-white text-lg font-semibold">{organizationName}</h1>
          </div>

          <div className="p-6">
            {submitted ? (
              <div className="text-center space-y-4 py-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-green-800">Thank you!</h2>
                <p className="text-slate-600">
                  Your report on <strong>{projectName}</strong> is with the team.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Hi {leadFirstName || 'there'}, how did it go?
                  </h2>
                  <p className="text-sm text-slate-600 mt-1">
                    {projectName}{gigDate ? ` · ${gigDate}` : ''}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    Only {organizationName}&apos;s owners and admins see this.
                  </p>
                </div>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-slate-900">Overall</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {OVERALL_CHOICES.map((c) => (
                      <button type="button" key={c.value} className={choice(overall === c.value)} onClick={() => setOverall(c.value)} aria-pressed={overall === c.value}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-slate-900">Was everyone on time?</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" className={choice(allOnTime === true)} onClick={() => setAllOnTime(true)} aria-pressed={allOnTime === true}>Yes</button>
                    <button type="button" className={choice(allOnTime === false)} onClick={() => setAllOnTime(false)} aria-pressed={allOnTime === false}>No</button>
                  </div>
                  {allOnTime === false && (
                    <Textarea
                      aria-label="Who was late, and by how much?"
                      placeholder="Who was late, and by how much?"
                      value={lateNotes}
                      onChange={(e) => setLateNotes(e.target.value.slice(0, REPORT_TEXT_LIMIT))}
                      rows={2}
                      className="bg-white"
                    />
                  )}
                </fieldset>

                {textField('hiccups', 'Any hiccups?', 'Sound, venue, timing, cues, anything that went sideways.', hiccups, setHiccups)}
                {textField('client', 'Anything to follow up with the client?', 'Complaints, compliments, requests, things we promised.', clientFollowUp, setClientFollowUp)}
                {textField('arrangements', 'Do any arrangements need work?', 'Songs or parts that did not land, wrong keys, missing pages.', arrangementNotes, setArrangementNotes)}
                {textField('other', 'Anything else we should know?', 'Optional.', otherNotes, setOtherNotes)}

                {error && (
                  <div className="text-center text-sm">
                    <p className="text-red-600">{error}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Having trouble? Email <SupportLink subject="Help sending a gig report" />
                    </p>
                  </div>
                )}

                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? 'Sending…' : 'Send report'}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
