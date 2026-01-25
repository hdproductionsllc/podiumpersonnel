import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

// Column name variations for fuzzy matching
const COLUMN_MAPPINGS = {
  firstName: [
    'first name', 'firstname', 'first', 'fname', 'given name', 'givenname',
    'forename', 'first_name'
  ],
  lastName: [
    'last name', 'lastname', 'last', 'lname', 'surname', 'family name',
    'familyname', 'last_name'
  ],
  fullName: [
    'name', 'full name', 'fullname', 'full_name', 'musician name', 'musician'
  ],
  email: [
    'email', 'e-mail', 'email address', 'emailaddress', 'e-mail address',
    'mail', 'email_address'
  ],
  phone: [
    'phone', 'phone number', 'phonenumber', 'cell', 'mobile', 'telephone',
    'tel', 'cell phone', 'cellphone', 'mobile phone', 'mobilephone',
    'phone_number', 'contact'
  ],
  notes: [
    'notes', 'comments', 'remarks', 'note', 'comment', 'description', 'info',
    'additional info', 'additional information'
  ],
}

function normalizeColumnName(name: string): string {
  return name.toLowerCase().trim().replace(/[_-]/g, ' ')
}

function findColumnIndex(headers: string[], variations: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const normalized = normalizeColumnName(headers[i])
    if (variations.includes(normalized)) {
      return i
    }
  }
  return -1
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' }
  }
  // Assume last part is last name, rest is first name
  const lastName = parts.pop() || ''
  const firstName = parts.join(' ')
  return { firstName, lastName }
}

interface ImportResult {
  success: number
  errors: number
  errorRows: { row: number; reason: string }[]
}

export async function POST(request: Request) {
  const supabase = await createClient()

  // Check authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user's organization
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization found' }, { status: 404 })
  }

  // Check permission
  if (membership.role !== 'owner' && membership.role !== 'admin') {
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
  }

  // Parse form data
  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // Validate file type
  const validExtensions = ['.xlsx', '.xls', '.csv']
  const fileName = file.name.toLowerCase()
  if (!validExtensions.some(ext => fileName.endsWith(ext))) {
    return NextResponse.json(
      { error: 'Invalid file type. Please upload an Excel (.xlsx, .xls) or CSV file.' },
      { status: 400 }
    )
  }

  try {
    // Read file content
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })

    // Get first sheet
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      return NextResponse.json({ error: 'Excel file is empty' }, { status: 400 })
    }

    const sheet = workbook.Sheets[sheetName]
    const data: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })

    if (data.length < 2) {
      return NextResponse.json(
        { error: 'File must have a header row and at least one data row' },
        { status: 400 }
      )
    }

    // Parse headers
    const headers = data[0].map(h => String(h || ''))

    // Find column indices
    const firstNameCol = findColumnIndex(headers, COLUMN_MAPPINGS.firstName)
    const lastNameCol = findColumnIndex(headers, COLUMN_MAPPINGS.lastName)
    const fullNameCol = findColumnIndex(headers, COLUMN_MAPPINGS.fullName)
    const emailCol = findColumnIndex(headers, COLUMN_MAPPINGS.email)
    const phoneCol = findColumnIndex(headers, COLUMN_MAPPINGS.phone)
    const notesCol = findColumnIndex(headers, COLUMN_MAPPINGS.notes)

    // Check if we have name columns
    const hasFirstLast = firstNameCol !== -1 && lastNameCol !== -1
    const hasFullName = fullNameCol !== -1

    if (!hasFirstLast && !hasFullName) {
      return NextResponse.json(
        {
          error: 'Could not find name columns. Please include columns for "First Name" and "Last Name", or a "Name" column.',
          detectedColumns: headers,
        },
        { status: 400 }
      )
    }

    // Process rows
    const result: ImportResult = {
      success: 0,
      errors: 0,
      errorRows: [],
    }

    const musiciansToInsert: {
      organization_id: string
      first_name: string
      last_name: string
      email: string | null
      phone: string | null
      notes: string | null
      is_active: boolean
    }[] = []

    for (let i = 1; i < data.length; i++) {
      const row = data[i]
      if (!row || row.every(cell => !cell)) {
        // Skip empty rows
        continue
      }

      let firstName = ''
      let lastName = ''

      if (hasFirstLast) {
        firstName = String(row[firstNameCol] || '').trim()
        lastName = String(row[lastNameCol] || '').trim()
      } else if (hasFullName) {
        const fullName = String(row[fullNameCol] || '').trim()
        const split = splitFullName(fullName)
        firstName = split.firstName
        lastName = split.lastName
      }

      // Validate required fields
      if (!firstName && !lastName) {
        result.errors++
        result.errorRows.push({
          row: i + 1, // 1-indexed for user display
          reason: 'Missing name',
        })
        continue
      }

      // If only one name is provided, use it as first name
      if (!firstName && lastName) {
        firstName = lastName
        lastName = ''
      }

      const email = emailCol !== -1 ? String(row[emailCol] || '').trim() || null : null
      const phone = phoneCol !== -1 ? String(row[phoneCol] || '').trim() || null : null
      const notes = notesCol !== -1 ? String(row[notesCol] || '').trim() || null : null

      // Validate email format if provided
      if (email && !email.includes('@')) {
        result.errors++
        result.errorRows.push({
          row: i + 1,
          reason: `Invalid email format: ${email}`,
        })
        continue
      }

      musiciansToInsert.push({
        organization_id: membership.organization_id,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        notes,
        is_active: true,
      })
    }

    // Batch insert
    if (musiciansToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('musicians')
        .insert(musiciansToInsert)

      if (insertError) {
        return NextResponse.json(
          { error: `Database error: ${insertError.message}` },
          { status: 500 }
        )
      }

      result.success = musiciansToInsert.length
    }

    return NextResponse.json({
      success: result.success,
      errors: result.errors,
      errorRows: result.errorRows.slice(0, 10), // Limit error details
      totalErrorRows: result.errorRows.length,
    })
  } catch (err) {
    console.error('Excel import error:', err)
    return NextResponse.json(
      { error: 'Failed to parse file. Please ensure it is a valid Excel or CSV file.' },
      { status: 400 }
    )
  }
}
