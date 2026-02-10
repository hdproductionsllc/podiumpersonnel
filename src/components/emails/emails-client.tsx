'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/ui/empty-state'
import type { EmailLog } from '@/types/database'

const EMAIL_TYPE_LABELS: Record<string, string> = {
  contract_offer: 'Offer',
  offer_reminder: 'Reminder',
  offer_accepted: 'Accepted',
  offer_declined: 'Declined',
  w9_request: 'W-9 Request',
  portal_invite: 'Portal Invite',
  offer_expired: 'Expired',
  admin_offer_sent: 'Admin Notification',
}

const EMAIL_TYPE_VARIANTS: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline'> = {
  contract_offer: 'default',
  offer_reminder: 'warning',
  offer_accepted: 'success',
  offer_declined: 'destructive',
  w9_request: 'secondary',
  portal_invite: 'secondary',
  offer_expired: 'outline',
  admin_offer_sent: 'outline',
}

interface EmailsClientProps {
  emailLogs: EmailLog[]
  timezone: string
}

export function EmailsClient({ emailLogs, timezone }: EmailsClientProps) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  // Get unique email types for filter
  const emailTypes = useMemo(() => {
    const types = new Set(emailLogs.map((log) => log.email_type))
    return Array.from(types).sort()
  }, [emailLogs])

  const filtered = useMemo(() => {
    return emailLogs.filter((log) => {
      if (typeFilter !== 'all' && log.email_type !== typeFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const matchName = log.recipient_name?.toLowerCase().includes(q)
        const matchEmail = log.recipient_email.toLowerCase().includes(q)
        const matchSubject = log.subject.toLowerCase().includes(q)
        if (!matchName && !matchEmail && !matchSubject) return false
      }
      return true
    })
  }, [emailLogs, search, typeFilter])

  const hasFilters = search !== '' || typeFilter !== 'all'

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="page-header">
          <h2 className="text-3xl font-bold tracking-tight">Sent Emails</h2>
          <p className="text-muted-foreground mt-1">
            A log of every email sent to your musicians.
          </p>
          <div className="mt-3 w-12 h-px bg-gold/50" />
        </div>
      </div>

      <Separator />

      {emailLogs.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search by name, email, or subject..."
            className="rounded-md border bg-background px-3 py-2 text-sm w-72"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All types</option>
            {emailTypes.map((type) => (
              <option key={type} value={type}>
                {EMAIL_TYPE_LABELS[type] || type}
              </option>
            ))}
          </select>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setTypeFilter('all')
              }}
            >
              Clear
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} of {emailLogs.length} emails
          </span>
        </div>
      )}

      {emailLogs.length === 0 ? (
        <EmptyState
          icon={
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
          }
          title="No emails sent yet"
          description="Emails sent to musicians will appear here as an audit trail."
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No emails match your filters" />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium px-4 py-3">Date</th>
                  <th className="text-left font-medium px-4 py-3">Recipient</th>
                  <th className="text-left font-medium px-4 py-3">Subject</th>
                  <th className="text-left font-medium px-4 py-3">Type</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {formatDate(log.sent_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{log.recipient_name || '—'}</div>
                      <div className="text-muted-foreground text-xs">{log.recipient_email}</div>
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate">{log.subject}</td>
                    <td className="px-4 py-3">
                      <Badge variant={EMAIL_TYPE_VARIANTS[log.email_type] || 'outline'}>
                        {EMAIL_TYPE_LABELS[log.email_type] || log.email_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="success" className="capitalize">
                        {log.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
