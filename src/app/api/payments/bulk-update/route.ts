import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(request: Request) {
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

  try {
    const body = await request.json()
    const { paymentIds, updates } = body as {
      paymentIds: string[]
      updates: {
        status?: 'unpaid' | 'pending' | 'paid'
        payment_date?: string | null
        payment_method?: string | null
        payment_reference?: string | null
        notes?: string | null
      }
    }

    if (!paymentIds || paymentIds.length === 0) {
      return NextResponse.json({ error: 'No payment IDs provided' }, { status: 400 })
    }

    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }

    // Validate that all payments belong to the user's organization
    const { data: payments, error: fetchError } = await supabase
      .from('payments')
      .select('id, organization_id')
      .in('id', paymentIds)

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const invalidPayments = payments?.filter(p => p.organization_id !== membership.organization_id) || []
    if (invalidPayments.length > 0) {
      return NextResponse.json({ error: 'Some payments do not belong to your organization' }, { status: 403 })
    }

    // Prepare update data
    const updateData: Record<string, unknown> = { ...updates }

    // If marking as paid and no date provided, set to today
    if (updates.status === 'paid' && !updates.payment_date) {
      updateData.payment_date = new Date().toISOString().split('T')[0]
    }

    // Update all selected payments
    const { data: updated, error: updateError } = await supabase
      .from('payments')
      .update(updateData)
      .in('id', paymentIds)
      .select()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      updated: updated?.length || 0,
      message: `Updated ${updated?.length || 0} payments`,
    })
  } catch (err) {
    console.error('Bulk update payments error:', err)
    return NextResponse.json({ error: 'Failed to update payments' }, { status: 500 })
  }
}
