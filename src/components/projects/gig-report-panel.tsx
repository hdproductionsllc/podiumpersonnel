'use client'

import { OVERALL_LABELS, DETAILS_LABELS, FEEDBACK_LABELS, type DetailsAccuracy, type ClientFeedback } from '@/lib/after-gig/survey'
import { GigReportPhotoGallery } from './gig-report-photo-gallery'
import { reloadPage } from '@/lib/reload-page'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/** Admin-reviewed attendance drives attributed survey requests; historical reports remain visible. */

export interface GigReportRow {
  details_accuracy?: DetailsAccuracy | null
  client_feedback?: ClientFeedback | null
  id: string
  project_id: string
  musician_id: string
  requested_at: string
  opened_at: string | null
  submitted_at: string | null
  overall: 'great' | 'good' | 'issues' | null
  all_on_time: boolean | null
  late_notes: string | null
  hiccups: string | null
  client_follow_up: string | null
  /** Migration 101; null on reports from before the client questions. */
  client_interacted?: boolean | null
  client_experience?: 'positive' | 'neutral' | 'negative' | null
  arrangement_notes: string | null
  other_notes: string | null
  musician: { first_name: string | null; last_name: string | null } | null
}

interface PositionLike {
  status: string
  musician_id: string | null
  chair_number?: number | null
  instrument?: { name: string | null } | null
  musician?: { id: string; first_name: string | null; last_name: string | null } | null
}

interface GigReportPanelProps {
  projectId: string
  positions: PositionLike[]
  /** NULL means attendance has not been reviewed. */
  playedIds: string[] | null
  chosenLeadId: string | null
  reports: GigReportRow[]
  timezone: string
}

const OVERALL: Record<NonNullable<GigReportRow['overall']>, { label: string; className: string }> = {
  great: { label: 'Went great', className: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' },
  good: { label: 'Fine, small things', className: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200' },
  issues: { label: 'There were problems', className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
}

const CLIENT: Record<'positive' | 'neutral' | 'negative', { label: string; className: string }> = {
  positive: { label: 'Positive', className: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' },
  neutral: { label: 'Neutral', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  negative: { label: 'Negative', className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
}

function name(m: { first_name: string | null; last_name: string | null } | null | undefined) {
  return [m?.first_name, m?.last_name].filter(Boolean).join(' ') || 'Musician'
}

function ReportItem({ label, report, when }: { label: string; report: GigReportRow | undefined; when: (iso: string) => string }) {
  return (
    <li className="rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">
          {report?.submitted_at
            ? `Report received ${when(report.submitted_at)}`
            : report?.opened_at
              ? `Opened ${when(report.opened_at)}, not sent yet`
              : report
                ? `Asked ${when(report.requested_at)}`
                : 'Not requested yet'}
        </span>
      </div>

      {report?.submitted_at && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {report.overall && (
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${OVERALL[report.overall].className}`}>
                {report.details_accuracy ? OVERALL_LABELS[report.overall] : OVERALL[report.overall].label}
              </span>
            )}
            {report.all_on_time !== null && (
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${report.all_on_time ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'}`}>
                {report.all_on_time ? 'Everyone on time' : 'Someone was late'}
              </span>
            )}
            {report.client_interacted === true && (
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${CLIENT[report.client_experience ?? 'neutral'].className}`}>
                {report.client_experience ? `Client: ${CLIENT[report.client_experience].label}` : 'Talked with the client'}
              </span>
            )}
            {report.client_interacted === false && (
              <span className="rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                No client contact
              </span>
            )}
          </div>
          {[
            ['Who was late', report.all_on_time ? null : report.late_notes],
            ['Gig details', report.details_accuracy ? DETAILS_LABELS[report.details_accuracy] : null],
            ['Client feedback', report.client_feedback ? FEEDBACK_LABELS[report.client_feedback] : null],
            ['Hiccups', report.hiccups],
            ['Follow up with the client', report.client_follow_up],
            ['Arrangements that need work', report.arrangement_notes],
            ['Anything else', report.other_notes],
          ].map(([heading, value]) =>
            value ? (
              <div key={heading as string}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{heading}</p>
                <p className="whitespace-pre-wrap">{value}</p>
              </div>
            ) : null
          )}
        </div>
      )}
    </li>
  )
}

export function GigReportPanel({ projectId, positions, playedIds, chosenLeadId, reports, timezone }: GigReportPanelProps) {
  const confirmed = Array.from(new Map(positions.filter(p => p.status === 'confirmed' && p.musician_id && p.musician?.id === p.musician_id).map(p => [p.musician_id!, p.musician])).entries())
  const [selected, setSelected] = useState<string[]>(playedIds || [])
  const [sending, setSending] = useState(false)
  const [savingLead, setSavingLead] = useState(false)
  async function setLead(musicianId: string | null) {
    setSavingLead(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/gig-lead`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ musicianId }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save the gig lead')
      reloadPage()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not save the gig lead') }
    finally { setSavingLead(false) }
  }
  const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone })
  async function sendNow() {
    setSending(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/gig-report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playedMusicianIds: selected }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not request reports')
      const outcomes = (data.outcomes || []) as { outcome: string }[]
      if (outcomes.some(o => o.outcome === 'failed' || o.outcome === 'no-email')) toast.error('Some requests could not be sent. Check email addresses and retry.')
      else if (outcomes.some(o => o.outcome === 'suppressed')) toast.warning('Played roster saved. Requests held by email safe mode.')
      else toast.success('Played roster saved. Eligible report requests processed.')
      reloadPage()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not request reports') }
    finally { setSending(false) }
  }
  return <div className="space-y-3">
    <h4 className="text-sm font-semibold">Gig reports</h4>
    <label className="flex flex-wrap gap-2 text-sm">Gig lead (separate from survey recipients)
      <select value={chosenLeadId || ''} disabled={savingLead} onChange={e => setLead(e.target.value || null)} className="rounded border bg-background p-1">
        <option value="">Automatic lead selection</option>
        {confirmed.map(([id, musician]) => <option key={id} value={id}>{name(musician)}</option>)}
      </select>
    </label>
    <p className="text-sm">After the gig, select everyone who actually played, including substitutes. Booking confirmation alone does not confirm attendance. Reconcile substitutions on the roster first.</p>
    <fieldset disabled={sending} className="space-y-2">
      <legend className="text-sm font-medium">Played roster</legend>
      {confirmed.map(([id, musician]) => <label key={id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(id)} onChange={e => setSelected(previous => e.target.checked ? [...previous, id] : previous.filter(value => value !== id))} />{name(musician)}</label>)}
      <Button size="sm" variant="outline" onClick={sendNow} disabled={sending}>{sending ? 'Processing…' : 'Confirm played roster and request reports'}</Button>
    </fieldset>
    <p className="text-xs text-muted-foreground">One attributed report per musician. Submitted reports are never requested again; repeat requests within one minute are ignored. No automatic requests until this roster is confirmed.</p>
    <ul className="space-y-3">{reports.map(report => <ReportItem key={report.id} label={name(report.musician)} report={report} when={when} />)}</ul>
    <GigReportPhotoGallery projectId={projectId} />
  </div>
}
