'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

type TaxPayment = {
  id: string
  amount: number
  status: string
  payment_date: string | null
  payment_method: string | null
  created_at: string
  musician: {
    id: string
    first_name: string
    last_name: string
    email: string | null
    phone: string | null
    w9_on_file: boolean
    w9_verified_at: string | null
    street_address: string | null
    city: string | null
    state: string | null
    zip_code: string | null
  }
}

interface TaxReportClientProps {
  payments: TaxPayment[]
  organizationName: string
}

const DEFAULT_THRESHOLD = 600

export function TaxReportClient({ payments, organizationName }: TaxReportClientProps) {
  // Determine available years from payment data
  const availableYears = useMemo(() => {
    const years = new Set<number>()
    payments.forEach((p) => {
      const date = p.payment_date || p.created_at
      if (date) years.add(new Date(date).getFullYear())
    })
    const sorted = Array.from(years).sort((a, b) => b - a)
    return sorted.length > 0 ? sorted : [new Date().getFullYear()]
  }, [payments])

  // Default: current year during the year, previous year in January
  const now = new Date()
  const defaultYear = now.getMonth() === 0 && availableYears.includes(now.getFullYear() - 1)
    ? now.getFullYear() - 1
    : now.getFullYear()

  const [selectedYear, setSelectedYear] = useState(defaultYear)
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)

  // Filter payments by selected year and aggregate by musician
  const musicianSummaries = useMemo(() => {
    const yearPayments = payments.filter((p) => {
      const date = p.payment_date || p.created_at
      return date && new Date(date).getFullYear() === selectedYear
    })

    const byMusician: Record<string, {
      musician: TaxPayment['musician']
      totalPaid: number
      paymentCount: number
      methods: Set<string>
    }> = {}

    yearPayments.forEach((p) => {
      const mid = p.musician.id
      if (!byMusician[mid]) {
        byMusician[mid] = {
          musician: p.musician,
          totalPaid: 0,
          paymentCount: 0,
          methods: new Set(),
        }
      }
      byMusician[mid].totalPaid += Number(p.amount)
      byMusician[mid].paymentCount += 1
      if (p.payment_method) byMusician[mid].methods.add(p.payment_method)
    })

    return Object.values(byMusician).sort((a, b) => b.totalPaid - a.totalPaid)
  }, [payments, selectedYear])

  // Summary stats
  const stats = useMemo(() => {
    const totalPaid = musicianSummaries.reduce((sum, m) => sum + m.totalPaid, 0)
    const above = musicianSummaries.filter((m) => m.totalPaid >= threshold)
    const missingW9 = above.filter((m) => !m.musician.w9_on_file)
    const missingAddress = above.filter((m) =>
      !m.musician.street_address || !m.musician.city || !m.musician.state || !m.musician.zip_code
    )
    return {
      totalPaid,
      totalMusicians: musicianSummaries.length,
      above1099: above.length,
      missingW9: missingW9.length,
      missingAddress: missingAddress.length,
    }
  }, [musicianSummaries, threshold])

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  function hasCompleteAddress(m: TaxPayment['musician']) {
    return !!(m.street_address && m.city && m.state && m.zip_code)
  }

  async function handleExport() {
    try {
      // Dynamically import xlsx
      const XLSX = await import('xlsx')

      const rows = musicianSummaries
        .filter((m) => m.totalPaid >= threshold)
        .map((m) => ({
          'Last Name': m.musician.last_name,
          'First Name': m.musician.first_name,
          'Email': m.musician.email || '',
          'Phone': m.musician.phone || '',
          'Street Address': m.musician.street_address || '',
          'City': m.musician.city || '',
          'State': m.musician.state || '',
          'ZIP': m.musician.zip_code || '',
          'Total Paid': m.totalPaid,
          'Payment Count': m.paymentCount,
          'Payment Methods': Array.from(m.methods).join(', '),
          'W-9 On File': m.musician.w9_on_file ? 'Yes' : 'No',
          'W-9 Verified': m.musician.w9_verified_at ? 'Yes' : 'No',
          'Address Complete': hasCompleteAddress(m.musician) ? 'Yes' : 'No',
        }))

      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '1099 Report')

      // Auto-size columns
      const colWidths = Object.keys(rows[0] || {}).map((key) => ({
        wch: Math.max(key.length, ...rows.map((r) => String((r as Record<string, unknown>)[key] || '').length)) + 2,
      }))
      ws['!cols'] = colWidths

      XLSX.writeFile(wb, `1099-report-${organizationName.replace(/\s+/g, '-')}-${selectedYear}.xlsx`)
      toast.success(`Exported ${rows.length} musician${rows.length !== 1 ? 's' : ''} to Excel`)
    } catch {
      toast.error('Failed to export report')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="page-header">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/payments" className="text-muted-foreground hover:text-foreground transition-colors">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </Link>
            <div>
              <h2 className="text-3xl font-bold tracking-tight">1099 Report</h2>
              <p className="text-muted-foreground mt-1">
                Year-end payment summary for 1099-NEC filing.
              </p>
              <div className="mt-3 w-12 h-px bg-gold/50" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Year:</label>
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Threshold:</label>
            <div className="flex items-center">
              <span className="text-sm text-muted-foreground mr-1">$</span>
              <input
                type="number"
                className="w-20 rounded-md border bg-background px-2 py-2 text-sm"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value) || 0)}
                min={0}
              />
            </div>
          </div>
          <Button
            onClick={handleExport}
            disabled={musicianSummaries.filter((m) => m.totalPaid >= threshold).length === 0}
          >
            Export to Excel
          </Button>
        </div>
      </div>

      <Separator />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground">Total Paid</p>
          <p className="text-2xl font-bold text-primary">{formatCurrency(stats.totalPaid)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground">Musicians Paid</p>
          <p className="text-2xl font-bold">{stats.totalMusicians}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground">1099 Required</p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.above1099}</p>
          <p className="text-xs text-muted-foreground">{formatCurrency(threshold)}+ threshold</p>
        </div>
        <div className={`rounded-lg border p-4 ${stats.missingW9 > 0 ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800' : 'bg-card'}`}>
          <p className="text-sm font-medium text-muted-foreground">Missing W-9</p>
          <p className={`text-2xl font-bold ${stats.missingW9 > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
            {stats.missingW9}
          </p>
          <p className="text-xs text-muted-foreground">above threshold</p>
        </div>
        <div className={`rounded-lg border p-4 ${stats.missingAddress > 0 ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800' : 'bg-card'}`}>
          <p className="text-sm font-medium text-muted-foreground">Missing Address</p>
          <p className={`text-2xl font-bold ${stats.missingAddress > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
            {stats.missingAddress}
          </p>
          <p className="text-xs text-muted-foreground">above threshold</p>
        </div>
      </div>

      {/* Musicians Table */}
      {musicianSummaries.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-medium">No paid payments found for {selectedYear}</p>
          <p className="text-sm mt-1">Payments marked as &ldquo;paid&rdquo; will appear here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Musician</th>
                <th className="px-4 py-3 text-left font-medium">Contact</th>
                <th className="px-4 py-3 text-right font-medium">Total Paid</th>
                <th className="px-4 py-3 text-center font-medium">Payments</th>
                <th className="px-4 py-3 text-center font-medium">Methods</th>
                <th className="px-4 py-3 text-center font-medium">W-9</th>
                <th className="px-4 py-3 text-center font-medium">Address</th>
                <th className="px-4 py-3 text-center font-medium">1099?</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {musicianSummaries.map((entry) => {
                const needs1099 = entry.totalPaid >= threshold
                const hasW9 = entry.musician.w9_on_file
                const isVerified = !!entry.musician.w9_verified_at
                const addressComplete = hasCompleteAddress(entry.musician)
                const hasIssue = needs1099 && (!hasW9 || !addressComplete)

                return (
                  <tr
                    key={entry.musician.id}
                    className={hasIssue ? 'bg-red-50/50 dark:bg-red-950/10' : ''}
                  >
                    <td className="px-4 py-3 font-medium">
                      {entry.musician.last_name}, {entry.musician.first_name}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-muted-foreground">
                        {entry.musician.email || '\u2014'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {entry.musician.phone || ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(entry.totalPaid)}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      {entry.paymentCount}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-muted-foreground">
                        {Array.from(entry.methods).join(', ') || '\u2014'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        isVerified
                          ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                          : hasW9
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                      }`}>
                        {isVerified ? 'Verified' : hasW9 ? 'On File' : 'Missing'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        addressComplete
                          ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                          : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                      }`}>
                        {addressComplete ? 'Complete' : 'Incomplete'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {needs1099 ? (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          hasW9 && addressComplete
                            ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}>
                          {hasW9 && addressComplete ? 'Ready' : 'Needs Info'}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Below threshold</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
