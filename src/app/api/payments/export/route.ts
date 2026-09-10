import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrgPlan, serverError } from '@/lib/api-helpers'
import { canExport } from '@/lib/plan'
import { DEFAULT_TIMEZONE } from '@/lib/utils'
import * as XLSX from 'xlsx'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization found' }, { status: 404 })
  }

  if (membership.role !== 'owner' && membership.role !== 'admin') {
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
  }

  // Export is an Orchestra-tier feature. getOrgPlan returns null when billing
  // is not enforced (pre-launch) — in that case, no gating.
  const plan = await getOrgPlan(membership.organization_id)
  if (plan && !canExport(plan)) {
    return NextResponse.json(
      { error: 'Payment export is available on the Orchestra plan and above.' },
      { status: 402 }
    )
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('timezone')
    .eq('id', membership.organization_id)
    .single()
  const timezone = org?.timezone || DEFAULT_TIMEZONE

  try {
    const body = await request.json()
    const { paymentIds, format = 'quickbooks' } = body as {
      paymentIds: string[]
      format?: 'quickbooks' | 'detailed'
    }

    if (!paymentIds || paymentIds.length === 0) {
      return NextResponse.json({ error: 'No payment IDs provided' }, { status: 400 })
    }

    // Fetch payments with all related data
    const { data: payments, error: fetchError } = await supabase
      .from('payments')
      .select(`
        *,
        musician:musicians(
          id,
          first_name,
          last_name,
          email,
          phone,
          w9_on_file,
          zelle_method,
          zelle_verified,
          musician_instruments(
            instrument:instruments(name)
          )
        ),
        service:services(
          id,
          name,
          service_type,
          start_time,
          project:projects(
            id,
            name
          )
        )
      `)
      .in('id', paymentIds)
      .eq('organization_id', membership.organization_id)
      .order('service(start_time)', { ascending: true })

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!payments || payments.length === 0) {
      return NextResponse.json({ error: 'No payments found' }, { status: 404 })
    }

    // Generate batch ID for export tracking
    const batchId = `BATCH-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${Date.now().toString(36).toUpperCase()}`

    // Format data for export
    const rows = payments.map((payment) => {
      const musician = payment.musician as unknown as {
        first_name: string
        last_name: string
        email: string | null
        phone: string | null
        w9_on_file: boolean
        zelle_method: 'email' | 'phone' | null
        zelle_verified: boolean
        musician_instruments: Array<{ instrument: { name: string } }>
      }

      const service = payment.service as unknown as {
        name: string
        service_type: string
        start_time: string
        project: { id: string; name: string }
      }

      const instruments = musician.musician_instruments
        ?.map((mi) => mi.instrument?.name)
        .filter(Boolean)
        .join(', ') || ''

      const payeeName = `${musician.last_name}, ${musician.first_name}`
      const serviceDate = new Date(service.start_time).toLocaleDateString('en-US', { timeZone: timezone })
      const memo = `${service.project.name} - ${service.name} - ${instruments || 'N/A'}`
      const paymentType = payment.is_leader_fee ? 'Leader Fee' : 'Service Pay'

      let zelleReady = 'No'
      if (musician.zelle_verified) {
        zelleReady = musician.zelle_method === 'email'
          ? `Yes (${musician.email})`
          : `Yes (${musician.phone})`
      } else if (musician.zelle_method) {
        zelleReady = musician.zelle_method === 'email'
          ? `Unverified (${musician.email})`
          : `Unverified (${musician.phone})`
      }

      if (format === 'quickbooks') {
        return {
          'Vendor/Payee': payeeName,
          'Payment Date': payment.payment_date || '',
          'Payment Amount': payment.amount,
          'Account': 'Contractor Expenses',
          'Reference': batchId,
          'Memo': memo,
          'Payment Type': paymentType,
          'Instrument': instruments,
          'Email': musician.email || '',
          'Phone': musician.phone || '',
          'W-9 Status': musician.w9_on_file ? 'On File' : 'MISSING',
          'Zelle Ready': zelleReady,
        }
      } else {
        // Detailed format
        return {
          'Payment ID': payment.id,
          'Payee': payeeName,
          'First Name': musician.first_name,
          'Last Name': musician.last_name,
          'Email': musician.email || '',
          'Phone': musician.phone || '',
          'Project': service.project.name,
          'Service': service.name,
          'Service Type': service.service_type,
          'Service Date': serviceDate,
          'Amount': payment.amount,
          'Payment Type': paymentType,
          'Status': payment.status,
          'Payment Date': payment.payment_date || '',
          'Payment Method': payment.payment_method || '',
          'Payment Reference': payment.payment_reference || '',
          'Notes': payment.notes || '',
          'Instrument': instruments,
          'W-9 On File': musician.w9_on_file ? 'Yes' : 'No',
          'Zelle Method': musician.zelle_method || 'None',
          'Zelle Verified': musician.zelle_verified ? 'Yes' : 'No',
          'Zelle Ready': zelleReady,
          'Export Batch': batchId,
        }
      }
    })

    // Create workbook
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet(rows)

    // Auto-size columns
    const colWidths = Object.keys(rows[0] || {}).map((key) => {
      const maxLength = Math.max(
        key.length,
        ...rows.map((row) => String((row as Record<string, unknown>)[key] || '').length)
      )
      return { wch: Math.min(maxLength + 2, 50) }
    })
    worksheet['!cols'] = colWidths

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Payments')

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    // Mark payments as exported. If this fails the file must not go out either:
    // an unstamped export would be silently re-exported next time.
    const { error: stampError } = await supabase
      .from('payments')
      .update({
        exported_at: new Date().toISOString(),
        export_batch_id: batchId,
      })
      .in('id', paymentIds)

    if (stampError) {
      return serverError(`Failed to mark payments exported (batch ${batchId})`, stampError)
    }

    // Return Excel file
    const fileName = `payments-${format}-${batchId}.xlsx`

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (err) {
    console.error('Export payments error:', err)
    return NextResponse.json({ error: 'Failed to export payments' }, { status: 500 })
  }
}
