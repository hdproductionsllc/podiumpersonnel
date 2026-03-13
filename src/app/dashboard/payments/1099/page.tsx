import { createClient } from '@/lib/supabase/server'
import { TaxReportClient } from '@/components/payments/tax-report-client'

export default async function TaxReportPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('organization_members')
    .select(`
      role,
      organization:organizations(id, name)
    `)
    .eq('user_id', user!.id)
    .single()

  const organization = membership?.organization as unknown as { id: string; name: string } | null

  // Fetch all paid payments with musician details
  const { data: payments } = await supabase
    .from('payments')
    .select(`
      id,
      amount,
      status,
      payment_date,
      payment_method,
      created_at,
      musician:musicians(
        id,
        first_name,
        last_name,
        email,
        phone,
        w9_on_file,
        w9_verified_at,
        street_address,
        city,
        state,
        zip_code
      )
    `)
    .eq('organization_id', organization!.id)
    .eq('status', 'paid')
    .order('payment_date', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (
    <TaxReportClient
      payments={(payments as any) ?? []}
      organizationName={organization!.name}
    />
  )
}
