import { requireOrgAdmin, apiSuccess, apiError } from '@/lib/api-helpers'

export async function PATCH(request: Request) {
  const { supabase, membership, error } = await requireOrgAdmin()
  if (error) return error

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
      return apiError('No payment IDs provided')
    }

    if (!updates || Object.keys(updates).length === 0) {
      return apiError('No updates provided')
    }

    // Validate that all payments belong to the user's organization
    const { data: payments, error: fetchError } = await supabase
      .from('payments')
      .select('id, organization_id')
      .in('id', paymentIds)

    if (fetchError) {
      return apiError(fetchError.message, 500)
    }

    const invalidPayments = payments?.filter(p => p.organization_id !== membership!.organization_id) || []
    if (invalidPayments.length > 0) {
      return apiError('Some payments do not belong to your organization', 403)
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
      return apiError(updateError.message, 500)
    }

    return apiSuccess({
      updated: updated?.length || 0,
      message: `Updated ${updated?.length || 0} payments`,
    })
  } catch (err) {
    console.error('Bulk update payments error:', err)
    return apiError('Failed to update payments', 500)
  }
}
