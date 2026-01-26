import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendW9RequestEmail } from '@/lib/email/send'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { musicianIds } = body

    if (!musicianIds || !Array.isArray(musicianIds) || musicianIds.length === 0) {
      return NextResponse.json({ error: 'Musician IDs are required' }, { status: 400 })
    }

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select(`
        role,
        organization:organizations(id, name, email_logo_url, email_brand_color, email_footer_text)
      `)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const organization = membership.organization as any

    // Fetch musicians
    const { data: musicians, error: fetchError } = await supabase
      .from('musicians')
      .select('id, first_name, last_name, email, w9_on_file')
      .in('id', musicianIds)
      .eq('organization_id', organization.id)

    if (fetchError) {
      return NextResponse.json({ error: 'Failed to fetch musicians' }, { status: 500 })
    }

    // Filter to only musicians without W-9 who have email
    const eligibleMusicians = musicians?.filter(m => !m.w9_on_file && m.email) || []

    if (eligibleMusicians.length === 0) {
      return NextResponse.json({
        error: 'No eligible musicians found (must have email and no W-9 on file)',
      }, { status: 400 })
    }

    let successCount = 0
    let errorCount = 0
    const errors: string[] = []

    // Send emails
    for (const musician of eligibleMusicians) {
      try {
        await sendW9RequestEmail({
          to: musician.email!,
          musicianName: `${musician.first_name} ${musician.last_name}`,
          organizationName: organization.name,
          adminEmail: user.email || undefined,
          branding: {
            logoUrl: organization.email_logo_url,
            brandColor: organization.email_brand_color,
            footerText: organization.email_footer_text,
          },
        })
        successCount++
      } catch (err) {
        errorCount++
        errors.push(`${musician.first_name} ${musician.last_name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    const skipped = musicianIds.length - eligibleMusicians.length

    return NextResponse.json({
      success: true,
      sent: successCount,
      failed: errorCount,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Failed to send W-9 request emails:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send emails' },
      { status: 500 }
    )
  }
}
