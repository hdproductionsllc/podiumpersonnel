import * as XLSX from 'xlsx'
import {
  formatPhoneNumber,
  looksLikeEmail,
  parseStandardFormat,
  parseSmartScan,
  parseSectionFormat,
  parseVCard,
  type ExtractedMusician,
} from '@/lib/import/parse-musicians'
import { requireOrgPlan, apiSuccess, apiError } from '@/lib/api-helpers'
import { canBulkImport } from '@/lib/plan'
import { findPossibleDuplicates, type MusicianRosterEntry } from '@/lib/musicians/duplicates'

type ImportRow = {
  organization_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  notes: string | null
  is_active: boolean
  tags: string[]
}

/**
 * Compares each parsed row against the org's existing roster. A row whose
 * normalized email already exists is skipped outright — inserting it would
 * create an exact duplicate. A row that only matches by phone or name is
 * still imported, but reported so an admin can go review it.
 */
function partitionAgainstRoster(rows: ImportRow[], roster: MusicianRosterEntry[]) {
  const rowsToInsert: ImportRow[] = []
  const skippedExisting: { name: string; email: string | null }[] = []
  const possibleDuplicates: { name: string; matchedWith: string; reasons: string[] }[] = []

  for (const row of rows) {
    const name = `${row.first_name} ${row.last_name}`.trim()
    const matches = findPossibleDuplicates(
      { first_name: row.first_name, last_name: row.last_name, email: row.email, phone: row.phone },
      roster
    )

    const emailMatch = matches.find((m) => m.reasons.includes('email'))
    if (emailMatch) {
      skippedExisting.push({ name, email: row.email })
      continue
    }

    if (matches.length > 0) {
      const top = matches[0]
      possibleDuplicates.push({
        name,
        matchedWith: `${top.musician.first_name} ${top.musician.last_name}`.trim(),
        reasons: top.reasons,
      })
    }

    rowsToInsert.push(row)
  }

  return { rowsToInsert, skippedExisting, possibleDuplicates }
}

export async function POST(request: Request) {
  const { supabase, membership, plan, error } = await requireOrgPlan()
  if (error || !plan) return error!

  if (!canBulkImport(plan)) {
    return apiError('Bulk import requires a Pro subscription', 403)
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const tagInput = formData.get('tag') as string | null
  const tags = tagInput ? [tagInput.trim()] : []
  if (!file) {
    return apiError('No file provided')
  }

  const validExtensions = ['.xlsx', '.xls', '.csv', '.vcf', '.vcard']
  const fileName = file.name.toLowerCase()
  if (!validExtensions.some(ext => fileName.endsWith(ext))) {
    return apiError('Invalid file type. Please upload an Excel (.xlsx, .xls), CSV, or vCard (.vcf) file.')
  }

  // Existing roster for this org, used only to flag/skip duplicates below —
  // one query, reused for whichever parse path below ends up running. PostgREST
  // returns at most 1,000 rows; the largest roster is 180 (2026-09-27), so this
  // needs paging only if an org ever passes 1,000 musicians.
  const { data: existingRoster } = await supabase
    .from('musicians')
    .select('id, first_name, last_name, email, phone')
    .eq('organization_id', membership!.organization_id)
  const roster: MusicianRosterEntry[] = existingRoster ?? []

  try {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Check if file is a vCard
    if (fileName.endsWith('.vcf') || fileName.endsWith('.vcard')) {
      const text = buffer.toString('utf8')
      const musicians = parseVCard(text)

      if (musicians.length === 0) {
        return apiError('No contacts found in the vCard file.')
      }

      const parsedRows: ImportRow[] = musicians.map(m => ({
        organization_id: membership!.organization_id,
        first_name: m.firstName || m.lastName,
        last_name: m.firstName ? m.lastName : '',
        email: m.email && looksLikeEmail(m.email) ? m.email : null,
        phone: m.phone ? formatPhoneNumber(m.phone) : null,
        notes: m.notes,
        is_active: true,
        tags: tags,
      }))

      const { rowsToInsert: musiciansToInsert, skippedExisting, possibleDuplicates } =
        partitionAgainstRoster(parsedRows, roster)

      if (musiciansToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('musicians')
          .insert(musiciansToInsert)

        if (insertError) {
          return apiError(`Database error: ${insertError.message}`, 500)
        }
      }

      return apiSuccess({
        success: musiciansToInsert.length,
        parseMethod: 'vcard',
        errors: 0,
        errorRows: [],
        totalErrorRows: 0,
        stats: {
          withEmail: musiciansToInsert.filter(m => m.email).length,
          withoutEmail: musiciansToInsert.filter(m => !m.email).length,
          withPhone: musiciansToInsert.filter(m => m.phone).length,
          withoutPhone: musiciansToInsert.filter(m => !m.phone).length,
        },
        skippedExisting,
        possibleDuplicates,
      })
    }

    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      cellNF: false,
      cellText: false,
    })

    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      return apiError('Excel file is empty')
    }

    const sheet = workbook.Sheets[sheetName]
    const data: (string | number | boolean | Date | null | undefined)[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: '',
    })

    if (data.length < 1) {
      return apiError('File appears to be empty')
    }

    const headers = (data[0] || []).map(h => String(h || ''))

    // Try parsing strategies in order of preference
    let musicians: ExtractedMusician[] = []
    let parseMethod = ''

    // Strategy 1: Standard column format
    const standardResult = parseStandardFormat(data, headers)
    if (standardResult && standardResult.length > 0) {
      musicians = standardResult
      parseMethod = 'standard'
    }

    // Strategy 2: Section-based format (instrument headers)
    if (musicians.length === 0) {
      const sectionResult = parseSectionFormat(data)
      if (sectionResult.length > 0) {
        musicians = sectionResult
        parseMethod = 'section'
      }
    }

    // Strategy 3: Smart scan (find any name-like values)
    if (musicians.length === 0) {
      const scanResult = parseSmartScan(data)
      if (scanResult.length > 0) {
        musicians = scanResult
        parseMethod = 'smart-scan'
      }
    }

    if (musicians.length === 0) {
      return apiError('Could not find any musician names in the file. Please check that your spreadsheet contains names.')
    }

    // Filter out invalid entries and prepare for insert
    const validMusicians = musicians.filter(m => m.firstName || m.lastName)

    const parsedRows: ImportRow[] = validMusicians.map(m => ({
      organization_id: membership!.organization_id,
      first_name: m.firstName || m.lastName,
      last_name: m.firstName ? m.lastName : '',
      email: m.email && looksLikeEmail(m.email) ? m.email : null,
      phone: m.phone ? formatPhoneNumber(m.phone) : null,
      notes: m.notes,
      is_active: true,
      tags: tags,
    }))

    const { rowsToInsert: musiciansToInsert, skippedExisting, possibleDuplicates } =
      partitionAgainstRoster(parsedRows, roster)

    if (musiciansToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('musicians')
        .insert(musiciansToInsert)

      if (insertError) {
        return apiError(`Database error: ${insertError.message}`, 500)
      }
    }

    return apiSuccess({
      success: musiciansToInsert.length,
      parseMethod,
      errors: 0,
      errorRows: [],
      totalErrorRows: 0,
      stats: {
        withEmail: musiciansToInsert.filter(m => m.email).length,
        withoutEmail: musiciansToInsert.filter(m => !m.email).length,
        withPhone: musiciansToInsert.filter(m => m.phone).length,
        withoutPhone: musiciansToInsert.filter(m => !m.phone).length,
      },
      skippedExisting,
      possibleDuplicates,
    })
  } catch (err) {
    console.error('Excel import error:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return apiError(`Failed to parse file: ${errorMessage}. Please ensure it is a valid Excel or CSV file.`)
  }
}
