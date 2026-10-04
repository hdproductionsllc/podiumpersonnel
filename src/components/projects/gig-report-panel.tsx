'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useVertical } from '@/components/providers/vertical-provider'
import { noLeadReason } from '@/lib/after-gig/rules'

/**
 * The lead musician's after-gig report, on the gig's row.
 *
 * Every gig has ONE lead: the admin's pick, or else whoever is confirmed in
 * Violin 1 (the chair that usually leads). With neither, nobody is asked until
 * an admin picks. Same rule as lib/after-gig/rules gigLead, which the cron
 * uses. "Leader" on the roster is NOT used: it only means someone CAN lead. The request
 * goes out automatically 30 minutes after the gig ends; this panel sets the
 * lead, shows where the report is, and can send it now or again.
 */

export interface GigReportRow {
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
  /** projects.gig_lead_musician_id (090): the admin's pick, if any. */
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
  return [m?.first_name, m?.last_name].filter(Boolean).join(' ') || 'Lead'
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
                : 'Asked automatically 30 minutes after the gig ends'}
        </span>
      </div>

      {report?.submitted_at && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {report.overall && (
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${OVERALL[report.overall].className}`}>
                {OVERALL[report.overall].label}
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

export function GigReportPanel({ projectId, positions, chosenLeadId, reports, timezone }: GigReportPanelProps) {
  // Who leads when nobody was picked (music: Violin 1; null: always pick). The same rule as gigLead.
  const { leadFallbackSkill } = useVertical()
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [savingLead, setSavingLead] = useState(false)

  // Everyone confirmed on the gig, once each.
  const confirmed = Array.from(
    new Map(
      positions
        .filter((p) => p.status === 'confirmed' && p.musician_id)
        .map((p) => [p.musician_id!, p.musician])
    ).entries()
  )
  const violinOne = leadFallbackSkill
    ? positions
        .filter((p) => p.status === 'confirmed' && p.musician_id && leadFallbackSkill.matches(p.instrument?.name))
        .sort((a, b) => (a.chair_number ?? 99) - (b.chair_number ?? 99))[0]
    : undefined
  const chosenIsConfirmed = !!chosenLeadId && confirmed.some(([id]) => id === chosenLeadId)
  const leadId = chosenIsConfirmed ? chosenLeadId : violinOne?.musician_id ?? null
  const source: 'chosen' | 'violin-1' | 'needs-pick' = chosenIsConfirmed ? 'chosen' : leadId ? 'violin-1' : 'needs-pick'
  const leads = confirmed.filter(([id]) => id === leadId)

  async function setLead(musicianId: string | null) {
    setSavingLead(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/gig-lead`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ musicianId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save the gig lead')
      toast.success('Gig lead saved')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the gig lead')
    } finally {
      setSavingLead(false)
    }
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone })

  const allSubmitted = leads.length > 0 && leads.every(([id]) => reports.some((r) => r.musician_id === id && r.submitted_at))
  const anyAsked = leads.some(([id]) => reports.some((r) => r.musician_id === id))
  // Reports from anyone who is not the current lead (asked before a lead was
  // picked): still shown, never lost.
  const otherReports = reports.filter((r) => r.musician_id !== leadId)

  async function sendNow() {
    setSending(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/gig-report`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not send the request')
      const outcomes = (data.outcomes || []) as { name: string; outcome: string }[]
      const sent = outcomes.filter((o) => o.outcome === 'sent').map((o) => o.name)
      const held = outcomes.filter((o) => o.outcome === 'suppressed').map((o) => o.name)
      const noEmail = outcomes.filter((o) => o.outcome === 'no-email').map((o) => o.name)
      if (sent.length) toast.success(`Report request sent to ${sent.join(', ')}`)
      if (held.length) toast.warning(`Not sent (email safe mode): ${held.join(', ')}`)
      if (noEmail.length) toast.error(`No email on file for ${noEmail.join(', ')}`)
      if (!sent.length && !held.length && !noEmail.length) toast.info('Everyone has already sent their report.')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the request')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
          </svg>
          Gig report
        </h4>
        {leads.length > 0 && !allSubmitted && (
          <Button size="sm" variant="outline" onClick={sendNow} disabled={sending}>
            {sending ? 'Sending…' : anyAsked ? 'Send again' : 'Send request now'}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor={`gig-lead-${projectId}`} className="text-muted-foreground">Gig lead</label>
        <select
          id={`gig-lead-${projectId}`}
          className="rounded-md border bg-background px-2 py-1 text-sm"
          value={chosenIsConfirmed ? chosenLeadId! : ''}
          disabled={savingLead}
          onChange={(e) => void setLead(e.target.value || null)}
        >
          <option value="">
            {source === 'violin-1' ? `${leadFallbackSkill?.label}: ${name(leads[0]?.[1])}` : 'Pick the gig lead…'}
          </option>
          {confirmed.map(([id, m]) => (
            <option key={id} value={id}>
              {name(m)}
            </option>
          ))}
        </select>
        {source === 'violin-1' && (
          <span className="text-xs text-muted-foreground">{leadFallbackSkill?.label} leads by default. Pick someone else to override.</span>
        )}
      </div>

      {source === 'needs-pick' && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {`${noLeadReason(leadFallbackSkill)}, so pick who is leading this gig. Nobody is asked for a report until you do.`}
        </p>
      )}

      {leads.length > 0 && (
        <ul className="space-y-3">
          {leads.map(([musicianId, musician]) => (
            <ReportItem key={musicianId} label={name(musician)} report={reports.find((r) => r.musician_id === musicianId)} when={when} />
          ))}
        </ul>
      )}

      {otherReports.length > 0 && (
        <ul className="space-y-3">
          {otherReports.map((r) => (
            <ReportItem key={r.id} label={`${name(r.musician)} (asked earlier)`} report={r} when={when} />
          ))}
        </ul>
      )}
    </div>
  )
}
