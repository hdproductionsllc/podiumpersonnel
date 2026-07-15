import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OnboardingForm } from '@/components/auth/onboarding-form'

export default async function OnboardingPage() {
  // A user who already belongs to an organization must never see this form
  // again: re-submitting it would create a second org + membership, and the
  // dashboard's membership lookup would then fail on every load (audit finding).
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (membership) {
      redirect('/dashboard')
    }
  }

  return <OnboardingForm />
}
