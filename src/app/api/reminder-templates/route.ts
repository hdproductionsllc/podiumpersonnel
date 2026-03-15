import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: List all templates for the user's org
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: mem } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()
    if (!mem) return NextResponse.json({ error: 'No organization' }, { status: 403 })

    const { data: templates } = await supabase
      .from('reminder_templates')
      .select('id, name, content, created_at')
      .eq('organization_id', mem.organization_id)
      .order('name', { ascending: true })

    return NextResponse.json({ templates: templates || [] })
  } catch (error) {
    console.error('Failed to fetch templates:', error)
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
  }
}

// POST: Create a new template
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: mem } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single()
    if (!mem || !['owner', 'admin'].includes(mem.role)) {
      return NextResponse.json({ error: 'Only admins can create templates' }, { status: 403 })
    }

    const body = await request.json()
    const { name, content } = body
    if (!name?.trim() || !content?.trim()) {
      return NextResponse.json({ error: 'Name and content are required' }, { status: 400 })
    }

    const { data: template, error } = await supabase
      .from('reminder_templates')
      .insert({
        organization_id: mem.organization_id,
        name: name.trim(),
        content: content.trim(),
        created_by: user.id,
      })
      .select('id, name, content, created_at')
      .single()

    if (error) {
      console.error('Failed to create template:', error)
      return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
    }

    return NextResponse.json({ template })
  } catch (error) {
    console.error('Failed to create template:', error)
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  }
}
