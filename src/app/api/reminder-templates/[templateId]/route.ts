import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// DELETE: Remove a template
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const { templateId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: mem } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single()
    if (!mem || !['owner', 'admin'].includes(mem.role)) {
      return NextResponse.json({ error: 'Only admins can delete templates' }, { status: 403 })
    }

    const { error } = await supabase
      .from('reminder_templates')
      .delete()
      .eq('id', templateId)
      .eq('organization_id', mem.organization_id)

    if (error) {
      console.error('Failed to delete template:', error)
      return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete template:', error)
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  }
}
