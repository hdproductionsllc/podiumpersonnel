'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  paymentIds: string[]
  paymentCount: number
  totalAmount: number
}

export function ExportDialog({
  open,
  onOpenChange,
  paymentIds,
  paymentCount,
  totalAmount,
}: ExportDialogProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [format, setFormat] = useState<'quickbooks' | 'detailed'>('quickbooks')

  if (!open) return null

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  async function handleExport() {
    setIsExporting(true)

    try {
      const response = await fetch('/api/payments/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIds,
          format,
        }),
      })

      if (!response.ok) {
        const result = await response.json()
        toast.error(result.error || 'Failed to export payments')
        return
      }

      // Download the file
      const blob = await response.blob()
      const contentDisposition = response.headers.get('Content-Disposition')
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/)
      const filename = filenameMatch ? filenameMatch[1] : `payments-${format}-${Date.now()}.xlsx`

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success(`Exported ${paymentCount} payments to Excel`)
      onOpenChange(false)
    } catch {
      toast.error('Failed to export payments')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg">
        <h3 className="text-lg font-semibold">Export Payments</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Export {paymentCount} payment{paymentCount !== 1 ? 's' : ''} totaling {formatCurrency(totalAmount)} to Excel.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm font-medium">Export Format</label>
            <div className="mt-2 space-y-2">
              <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                <input
                  type="radio"
                  name="format"
                  value="quickbooks"
                  checked={format === 'quickbooks'}
                  onChange={() => setFormat('quickbooks')}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium">QuickBooks Format</div>
                  <div className="text-sm text-muted-foreground">
                    Optimized for QuickBooks manual entry or third-party import tools (SaasAnt, Transaction Pro).
                    Includes: Vendor, Amount, Account, Reference, Memo, W-9 status, Zelle info.
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50">
                <input
                  type="radio"
                  name="format"
                  value="detailed"
                  checked={format === 'detailed'}
                  onChange={() => setFormat('detailed')}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium">Detailed Format</div>
                  <div className="text-sm text-muted-foreground">
                    Full payment details for internal records. Includes all fields: project, service, dates, status, payment method, notes, and more.
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 p-3">
            <h4 className="text-sm font-medium mb-2">QuickBooks Import Notes</h4>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>For manual entry: Use the exported file as a reference while entering transactions in QuickBooks</li>
              <li>For bulk import: Use third-party tools like SaasAnt or Transaction Pro Importer</li>
              <li>All exported payments will be marked with an export timestamp and batch ID</li>
            </ul>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isExporting}
            >
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={isExporting}>
              {isExporting ? 'Exporting...' : 'Export to Excel'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
