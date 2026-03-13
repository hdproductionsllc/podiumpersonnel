'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/ui/empty-state'
import { PaymentStatusDialog } from './payment-status-dialog'
import { ExportDialog } from './export-dialog'
import { toast } from 'sonner'

const PAGE_SIZE = 50

export type PaymentWithRelations = {
  id: string
  organization_id: string
  service_id: string
  musician_id: string
  project_position_id: string | null
  amount: number
  is_leader_fee: boolean
  status: 'unpaid' | 'pending' | 'paid'
  payment_date: string | null
  payment_method: string | null
  payment_reference: string | null
  notes: string | null
  exported_at: string | null
  export_batch_id: string | null
  created_at: string
  updated_at: string
  musician: {
    id: string
    first_name: string
    last_name: string
    email: string | null
    phone: string | null
    w9_on_file: boolean
    zelle_method: 'email' | 'phone' | null
    zelle_verified: boolean
    musician_instruments: Array<{
      instrument: {
        id: string
        name: string
        abbreviation: string | null
      }
    }>
  }
  service: {
    id: string
    name: string
    service_type: string
    start_time: string
    base_pay: number | null
    leader_fee: number | null
    project: {
      id: string
      name: string
    }
  }
}

interface PaymentsClientProps {
  payments: PaymentWithRelations[]
  projects: Array<{ id: string; name: string }>
  organizationId: string
  userRole: string
  initialProjectFilter?: string
  initialStatusFilter?: string
}

export function PaymentsClient({
  payments,
  projects,
  organizationId,
  userRole,
  initialProjectFilter = '',
  initialStatusFilter = '',
}: PaymentsClientProps) {
  const router = useRouter()
  const canManage = userRole === 'owner' || userRole === 'admin'

  // Filter state
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState(initialProjectFilter)
  const [statusFilter, setStatusFilter] = useState<'' | 'unpaid' | 'pending' | 'paid'>(
    initialStatusFilter as '' | 'unpaid' | 'pending' | 'paid'
  )
  const [w9Filter, setW9Filter] = useState<'' | 'has_w9' | 'no_w9'>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Pagination
  const [page, setPage] = useState(1)

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Dialog state
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)

  // Generate payments loading state
  const [isGenerating, setIsGenerating] = useState(false)

  const hasFilters = search !== '' || projectFilter !== '' || statusFilter !== '' || w9Filter !== '' || dateFrom !== '' || dateTo !== ''

  // Calculate summary totals
  const summary = useMemo(() => {
    const totals = { unpaid: 0, pending: 0, paid: 0 }
    payments.forEach((p) => {
      totals[p.status] += Number(p.amount)
    })
    return totals
  }, [payments])

  // Filter payments
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (search) {
        const q = search.toLowerCase()
        const name = `${p.musician.first_name} ${p.musician.last_name}`.toLowerCase()
        const reverseName = `${p.musician.last_name}, ${p.musician.first_name}`.toLowerCase()
        const project = p.service.project.name.toLowerCase()
        if (!name.includes(q) && !reverseName.includes(q) && !project.includes(q)) return false
      }
      if (projectFilter && p.service.project.id !== projectFilter) return false
      if (statusFilter && p.status !== statusFilter) return false
      if (w9Filter === 'has_w9' && !p.musician.w9_on_file) return false
      if (w9Filter === 'no_w9' && p.musician.w9_on_file) return false

      const serviceDate = new Date(p.service.start_time).toISOString().split('T')[0]
      if (dateFrom && serviceDate < dateFrom) return false
      if (dateTo && serviceDate > dateTo) return false

      return true
    })
  }, [payments, search, projectFilter, statusFilter, w9Filter, dateFrom, dateTo])

  // Paginated payments
  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginatedPayments = filteredPayments.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  // Reset page when filters change
  function resetPage() { setPage(1) }

  // Selection handlers
  function toggleSelectAll() {
    if (selectedIds.size === paginatedPayments.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(paginatedPayments.map((p) => p.id)))
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Generate payments
  async function handleGeneratePayments() {
    setIsGenerating(true)
    try {
      const response = await fetch('/api/payments/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: projectFilter || null }),
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || 'Failed to generate payments')
        return
      }

      if (result.created > 0) {
        toast.success(result.message)
        router.refresh()
      } else {
        toast.info(result.message)
      }
    } catch {
      toast.error('Failed to generate payments')
    } finally {
      setIsGenerating(false)
    }
  }

  // Quick status update
  async function handleQuickStatusChange(paymentIds: string[], status: 'unpaid' | 'pending' | 'paid') {
    try {
      const response = await fetch('/api/payments/bulk-update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIds,
          updates: { status },
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || 'Failed to update payments')
        return
      }

      toast.success(result.message)
      setSelectedIds(new Set())
      router.refresh()
    } catch {
      toast.error('Failed to update payments')
    }
  }

  const selectedPayments = payments.filter((p) => selectedIds.has(p.id))

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="page-header">
          <h2 className="text-3xl font-bold tracking-tight">Payments</h2>
          <p className="text-muted-foreground mt-1">
            Track and manage musician payments.
          </p>
          <div className="mt-3 w-12 h-px bg-gold/50" />
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/payments/1099">
            <Button variant="outline">1099 Report</Button>
          </Link>
          {canManage && (
            <Button onClick={handleGeneratePayments} disabled={isGenerating}>
              {isGenerating ? 'Generating...' : 'Generate Payments'}
            </Button>
          )}
        </div>
      </div>

      <Separator />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-gold-top rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Unpaid</p>
              <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                {formatCurrency(summary.unpaid)}
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <span className="text-red-600 dark:text-red-400 text-lg">$</span>
            </div>
          </div>
        </div>
        <div className="card-gold-top rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Pending</p>
              <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
                {formatCurrency(summary.pending)}
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <span className="text-yellow-600 dark:text-yellow-400 text-lg">$</span>
            </div>
          </div>
        </div>
        <div className="card-gold-top rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Paid</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                {formatCurrency(summary.paid)}
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <span className="text-green-600 dark:text-green-400 text-lg">$</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by name or project..."
          className="rounded-md border bg-background px-3 py-2 text-sm w-64"
          value={search}
          onChange={(e) => { setSearch(e.target.value); resetPage() }}
        />
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={projectFilter}
          onChange={(e) => { setProjectFilter(e.target.value); resetPage() }}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as '' | 'unpaid' | 'pending' | 'paid'); resetPage() }}
        >
          <option value="">All statuses</option>
          <option value="unpaid">Unpaid</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
        </select>
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={w9Filter}
          onChange={(e) => { setW9Filter(e.target.value as '' | 'has_w9' | 'no_w9'); resetPage() }}
        >
          <option value="">All W-9 status</option>
          <option value="has_w9">Has W-9</option>
          <option value="no_w9">Missing W-9</option>
        </select>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Date:</span>
          <input
            type="date"
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); resetPage() }}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <input
            type="date"
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); resetPage() }}
          />
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setProjectFilter('')
              setStatusFilter('')
              setW9Filter('')
              setDateFrom('')
              setDateTo('')
              resetPage()
            }}
          >
            Clear all
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {filteredPayments.length} of {payments.length} payments
        </span>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && canManage && (
        <div className="flex items-center gap-4 rounded-lg bg-gold/10 border border-gold/20 dark:bg-gold/5 p-3">
          <span className="text-sm font-medium">
            {selectedIds.size} payment{selectedIds.size !== 1 ? 's' : ''} selected
            <span className="ml-2 text-muted-foreground">
              ({formatCurrency(selectedPayments.reduce((sum, p) => sum + Number(p.amount), 0))})
            </span>
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleQuickStatusChange(Array.from(selectedIds), 'pending')}
          >
            Mark Pending
          </Button>
          <Button
            size="sm"
            onClick={() => setStatusDialogOpen(true)}
          >
            Mark Paid
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setExportDialogOpen(true)}
          >
            Export Selected
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear Selection
          </Button>
        </div>
      )}

      {/* Payments Table */}
      {payments.length === 0 ? (
        <EmptyState
          icon={
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          }
          title="No payments yet"
          description="Generate payments once you have confirmed musician positions on services."
          action={canManage ? (
            <Button onClick={handleGeneratePayments} disabled={isGenerating}>
              Generate Payments from Confirmed Positions
            </Button>
          ) : undefined}
        />
      ) : filteredPayments.length === 0 ? (
        <EmptyState title="No payments match your filters" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  {canManage && (
                    <th className="w-10 px-2 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300"
                        checked={selectedIds.size === paginatedPayments.length && paginatedPayments.length > 0}
                        onChange={toggleSelectAll}
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left font-medium">Musician</th>
                  <th className="px-4 py-3 text-left font-medium">Project</th>
                  <th className="px-4 py-3 text-left font-medium">Service</th>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-center font-medium">Type</th>
                  <th className="px-4 py-3 text-center font-medium">Status</th>
                  <th className="px-4 py-3 text-center font-medium">W-9</th>
                  <th className="px-4 py-3 text-center font-medium">Zelle</th>
                  {canManage && (
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginatedPayments.map((payment) => (
                  <tr
                    key={payment.id}
                    className={`hover:bg-muted/50 ${selectedIds.has(payment.id) ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}
                    onClick={canManage ? () => toggleSelect(payment.id) : undefined}
                  >
                    {canManage && (
                      <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300"
                          checked={selectedIds.has(payment.id)}
                          onChange={() => toggleSelect(payment.id)}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {payment.musician.last_name}, {payment.musician.first_name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {payment.musician.musician_instruments
                          .map((mi) => mi.instrument.abbreviation || mi.instrument.name)
                          .join(', ') || '\u2014'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <Link
                        href={`/dashboard/projects?expand=${payment.service.project.id}`}
                        className="hover:text-foreground hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {payment.service.project.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {payment.service.name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(payment.service.start_time)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {payment.is_leader_fee ? (
                        <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                          + Leader
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                          Base
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div>
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          payment.status === 'paid'
                            ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                            : payment.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                        }`}>
                          {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                        </span>
                        {payment.status === 'paid' && (payment.payment_method || payment.payment_date) && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {[
                              payment.payment_method,
                              payment.payment_date && formatDate(payment.payment_date),
                            ].filter(Boolean).join(' \u2022 ')}
                            {payment.payment_reference && (
                              <span className="block truncate max-w-[120px]" title={payment.payment_reference}>
                                Ref: {payment.payment_reference}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        payment.musician.w9_on_file
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-orange-950 dark:text-orange-300'
                      }`}>
                        {payment.musician.w9_on_file ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        payment.musician.zelle_verified
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : payment.musician.zelle_method
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {payment.musician.zelle_verified
                          ? payment.musician.zelle_method === 'email' ? 'Email' : 'Phone'
                          : payment.musician.zelle_method
                            ? 'Unverified'
                            : 'No'}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {payment.status !== 'paid' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedIds(new Set([payment.id]))
                                setStatusDialogOpen(true)
                              }}
                            >
                              Mark Paid
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}\u2013{Math.min(currentPage * PAGE_SIZE, filteredPayments.length)} of {filteredPayments.length}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .map((p, idx, arr) => {
                    const showEllipsis = idx > 0 && p - arr[idx - 1] > 1
                    return (
                      <span key={p}>
                        {showEllipsis && <span className="px-1 text-muted-foreground">&hellip;</span>}
                        <Button
                          variant={p === currentPage ? 'default' : 'outline'}
                          size="sm"
                          className="w-9"
                          onClick={() => setPage(p)}
                        >
                          {p}
                        </Button>
                      </span>
                    )
                  })}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <PaymentStatusDialog
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        paymentIds={Array.from(selectedIds)}
        totalAmount={selectedPayments.reduce((sum, p) => sum + Number(p.amount), 0)}
        onSuccess={() => {
          setSelectedIds(new Set())
          router.refresh()
        }}
      />

      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        paymentIds={Array.from(selectedIds)}
        paymentCount={selectedIds.size}
        totalAmount={selectedPayments.reduce((sum, p) => sum + Number(p.amount), 0)}
      />
    </div>
  )
}
