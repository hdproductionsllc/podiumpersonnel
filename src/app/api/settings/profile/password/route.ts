import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { changePasswordSchema } from '@/lib/validations/settings'

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = changePasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  // Verify current password by attempting sign-in
  const adminClient = createAdminClient()
  const { data: { user: verifiedUser } } = await adminClient.auth.admin.getUserById(user.id)
  if (!verifiedUser?.email) {
    return NextResponse.json({ error: 'Could not verify user' }, { status: 500 })
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: verifiedUser.email,
    password: parsed.data.currentPassword,
  })

  if (signInError) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
  }

  // Update password
  const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
    password: parsed.data.newPassword,
  })

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
