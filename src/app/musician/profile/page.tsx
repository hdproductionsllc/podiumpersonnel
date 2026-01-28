import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProfileForm } from '@/components/musician/profile-form'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

async function ProfileContent() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/musician/login')
  }

  // Get all musician records for this user
  const { data: musicians, error } = await supabase
    .from('musicians')
    .select(`
      id,
      first_name,
      last_name,
      email,
      phone,
      profile_photo_url,
      organization:organizations(id, name)
    `)
    .eq('user_id', user.id)
    .eq('is_active', true)

  if (error || !musicians || musicians.length === 0) {
    redirect('/musician/login?error=no_musician_records')
  }

  // Get notification preferences for the primary musician
  const primaryMusician = musicians[0]
  const { data: preferences } = await supabase
    .from('musician_notification_preferences')
    .select('*')
    .eq('musician_id', primaryMusician.id)
    .maybeSingle()

  // Get auth user info
  const authProviders = user.app_metadata?.providers || []
  const hasGoogleLinked = authProviders.includes('google')

  return (
    <ProfileForm
      user={{
        id: user.id,
        email: user.email || '',
        hasGoogleLinked,
      }}
      musician={{
        id: primaryMusician.id,
        first_name: primaryMusician.first_name,
        last_name: primaryMusician.last_name,
        email: primaryMusician.email,
        phone: primaryMusician.phone,
        profile_photo_url: primaryMusician.profile_photo_url,
      }}
      organizations={musicians.map((m: any) => ({
        id: m.organization?.id,
        name: m.organization?.name,
        musicianId: m.id,
      }))}
      notificationPreferences={preferences || {
        email_new_offers: true,
        email_offer_reminders: true,
        email_schedule_changes: true,
        email_payment_updates: true,
      }}
    />
  )
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}

export default function MusicianProfilePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Profile</h1>
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileContent />
      </Suspense>
    </div>
  )
}
