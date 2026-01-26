import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

// Column name variations for standard format detection
const COLUMN_MAPPINGS = {
  firstName: [
    'first name', 'firstname', 'first', 'fname', 'given name', 'givenname',
    'forename', 'first_name', 'first names', 'givennames', 'prénom'
  ],
  lastName: [
    'last name', 'lastname', 'last', 'lname', 'surname', 'family name',
    'familyname', 'last_name', 'family', 'nom', 'nom de famille'
  ],
  fullName: [
    'name', 'full name', 'fullname', 'full_name', 'musician name', 'musician',
    'member', 'member name', 'player', 'player name', 'person', 'contact name'
  ],
  email: [
    'email', 'e-mail', 'email address', 'emailaddress', 'e-mail address',
    'mail', 'email_address', 'e mail', 'courriel', 'primary email'
  ],
  phone: [
    'phone', 'phone number', 'phonenumber', 'cell', 'mobile', 'telephone',
    'tel', 'cell phone', 'cellphone', 'mobile phone', 'mobilephone',
    'phone_number', 'contact', 'contact number', 'primary phone', 'home phone',
    'work phone', 'number', 'téléphone'
  ],
  notes: [
    'notes', 'comments', 'remarks', 'note', 'comment', 'description', 'info',
    'additional info', 'additional information', 'other', 'details', 'bio'
  ],
}

// Common instrument/section names to detect section-based layouts
const INSTRUMENT_PATTERNS = [
  /violin/i, /viola/i, /cello/i, /bass/i, /contrabass/i,
  /flute/i, /oboe/i, /clarinet/i, /bassoon/i,
  /horn/i, /trumpet/i, /trombone/i, /tuba/i,
  /percussion/i, /timpani/i, /harp/i, /piano/i, /keyboard/i,
  /guitar/i, /vocal/i, /singer/i, /soprano/i, /alto/i, /tenor/i, /baritone/i,
  /woodwind/i, /brass/i, /string/i,
  /1st/i, /2nd/i, /first/i, /second/i, /principal/i,
  /violinist/i, /violist/i, /cellist/i, /bassist/i, /flutist/i, /guitarist/i,
]

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

function toTitleCase(str: string): string {
  if (!str) return str
  return str
    .toLowerCase()
    .split(/(\s+|-)/g)
    .map(part => {
      if (part.match(/^\s+$/) || part === '-') return part
      // Handle special cases like O'Connor, McDonald, etc.
      if (part.startsWith("o'") || part.startsWith("O'")) {
        return "O'" + part.charAt(2).toUpperCase() + part.slice(3)
      }
      if (part.startsWith('mc') && part.length > 2) {
        return 'Mc' + part.charAt(2).toUpperCase() + part.slice(3)
      }
      if (part.startsWith('mac') && part.length > 3 && /^mac[a-z]/.test(part)) {
        return 'Mac' + part.charAt(3).toUpperCase() + part.slice(4)
      }
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join('')
}

function cleanName(name: string): string {
  if (!name) return name

  let cleaned = name.trim()

  // Remove leading/trailing punctuation except hyphens and apostrophes in names
  cleaned = cleaned.replace(/^[,\s:;\-]+/, '').replace(/[,\s:;]+$/, '')

  // Remove phone numbers in various formats that might be at the start
  // Matches: 617-519-9849, 626.225.7286, (213) 858-1956, etc.
  cleaned = cleaned.replace(/^\d{3}[\-\.\s]?\d{3}[\-\.\s]?\d{4}[\s,:]*/g, '')
  cleaned = cleaned.replace(/^\(\d{3}\)\s*\d{3}[\-\.\s]?\d{4}[\s,:]*/g, '')
  cleaned = cleaned.replace(/^\d{3}[\-\.\s]\d{4}[\s,:]*/g, '') // 7-digit numbers like 858-1956

  // Remove phone numbers that appear AFTER the name (with comma separator)
  // e.g., "Clement Chow (213)" -> "Clement Chow"
  cleaned = cleaned.replace(/\s*\(\d{3}\)\s*$/, '')
  cleaned = cleaned.replace(/\s*\d{3}[\-\.\s]?\d{3}[\-\.\s]?\d{4}\s*$/, '')

  // Remove quotes, angle brackets
  cleaned = cleaned.replace(/["<>]/g, '')

  // Remove trailing colons
  cleaned = cleaned.replace(/:+$/, '')

  // Clean up any remaining leading/trailing junk
  cleaned = cleaned.replace(/^[,\s:;\-]+/, '').replace(/[,\s:;]+$/, '')

  return cleaned.trim()
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  // Clean the name first
  const cleaned = cleanName(fullName)
  if (!cleaned) return { firstName: '', lastName: '' }

  const parts = cleaned.split(/\s+/).filter(p => p.length > 0)

  if (parts.length === 0) {
    return { firstName: '', lastName: '' }
  }

  if (parts.length === 1) {
    return { firstName: toTitleCase(parts[0]), lastName: '' }
  }

  // Assume last part is last name, rest is first name
  const lastName = toTitleCase(parts.pop() || '')
  const firstName = toTitleCase(parts.join(' '))
  return { firstName, lastName }
}

function looksLikeInstrumentHeader(text: string): boolean {
  if (!text || typeof text !== 'string') return false
  return INSTRUMENT_PATTERNS.some(pattern => pattern.test(text))
}

// Common US cities that might appear in spreadsheets
const COMMON_CITIES = new Set([
  'san diego', 'diego', 'los angeles', 'angeles', 'san francisco', 'francisco',
  'new york', 'chicago', 'houston', 'phoenix', 'philadelphia', 'san antonio',
  'dallas', 'austin', 'jacksonville', 'fort worth', 'columbus', 'charlotte',
  'seattle', 'denver', 'boston', 'nashville', 'detroit', 'portland', 'memphis',
  'oklahoma city', 'las vegas', 'vegas', 'baltimore', 'milwaukee', 'albuquerque',
  'tucson', 'fresno', 'sacramento', 'mesa', 'atlanta', 'kansas city', 'miami',
  'oakland', 'minneapolis', 'tulsa', 'cleveland', 'wichita', 'arlington',
  'bakersfield', 'tampa', 'aurora', 'anaheim', 'honolulu', 'santa ana',
  'riverside', 'corpus christi', 'lexington', 'stockton', 'henderson', 'saint paul',
  'pittsburgh', 'cincinnati', 'anchorage', 'greensboro', 'plano', 'newark',
  'lincoln', 'orlando', 'irvine', 'venice', 'pasadena', 'glendale', 'burbank',
  'hollywood', 'beverly hills', 'santa monica', 'long beach', 'torrance',
])

// Common location/city keywords to filter out
const LOCATION_PATTERNS = [
  /^(san|los|new|las|el|la|santa|north|south|east|west|mount|fort|saint|st\.?)\s/i,
  /\b(ca|california|ny|tx|florida|usa|street|ave|avenue|blvd|road|rd|city|county)\b/i,
  /^\d{5}(-\d{4})?$/, // ZIP codes
  /^\d{5},?\s/, // ZIP code at start
  /,\s*(ca|california|ny|tx|fl|az|wa|or|nv|co)\s*\d{0,5}$/i, // City, State ZIP pattern
]

// Non-name categories that might appear
const CATEGORY_WORDS = new Set([
  'winds', 'brass', 'strings', 'woodwinds', 'percussion', 'keyboards', 'vocals',
  'section', 'principal', 'associate', 'assistant', 'substitute', 'extra',
  'tutti', 'solo', 'lead', 'backup', 'rhythm', 'melody',
])

function looksLikeLocation(text: string): boolean {
  if (!text) return false
  const lower = text.trim().toLowerCase()

  // Check against known cities
  if (COMMON_CITIES.has(lower)) return true

  // Check if it's a reversed city name like "Diego, San" -> "san diego"
  if (lower.includes(',')) {
    const parts = lower.split(',').map(p => p.trim()).filter(p => p)
    if (parts.length === 2) {
      const reversed = `${parts[1]} ${parts[0]}`
      if (COMMON_CITIES.has(reversed)) return true
    }
  }

  return LOCATION_PATTERNS.some(pattern => pattern.test(text.trim()))
}

function looksLikeCategory(text: string): boolean {
  if (!text) return false
  const lower = text.trim().toLowerCase()
  return CATEGORY_WORDS.has(lower)
}

function looksLikeName(text: string): boolean {
  if (!text || typeof text !== 'string') return false
  let trimmed = text.trim()

  // Skip if too short or too long
  if (trimmed.length < 2 || trimmed.length > 50) return false

  // Skip if it's just punctuation or dashes
  if (/^[\-\s,.:;]+$/.test(trimmed)) return false

  // Skip if it's just numbers
  if (/^\d+$/.test(trimmed)) return false

  // Skip common non-name patterns
  if (/^(yes|no|n\/a|tbd|tba|none|null|undefined|\d{1,2}\/\d{1,2}|\d+:\d+|winds|brass|strings|woodwinds|percussion)$/i.test(trimmed)) return false

  // Skip if it looks like an email (with or without angle brackets)
  if (/@/.test(trimmed)) return false
  if (/^<.*>/.test(trimmed)) return false
  if (trimmed.includes('@') || trimmed.includes('.com') || trimmed.includes('.net') || trimmed.includes('.org')) return false

  // Skip if it STARTS with digits (likely phone or number)
  if (/^\d/.test(trimmed)) return false

  // Skip if it's an instrument header
  if (looksLikeInstrumentHeader(trimmed)) return false

  // Skip if it looks like a location/address
  if (looksLikeLocation(trimmed)) return false

  // Skip if it looks like a category
  if (looksLikeCategory(trimmed)) return false

  // Skip if it's all caps and short (likely a header like "WINDS", "DIEGO")
  if (trimmed === trimmed.toUpperCase() && /^[A-Z\s]+$/.test(trimmed)) {
    // Allow all-caps if it's a plausible name (2-3 words, reasonable length)
    const words = trimmed.split(/\s+/)
    if (words.length === 1 || trimmed.length > 20) return false
  }

  // Good signs it's a name:
  // - Starts with a letter
  // - Contains letters
  // - Reasonable length
  // - May have spaces (first + last name)
  if (/^[a-zA-Z]/.test(trimmed) && /[a-zA-Z]/.test(trimmed)) {
    // Extract just the name part if there's extra stuff
    const words = trimmed.split(/\s+/)
    if (words.length >= 1 && words.length <= 5) {
      // Must have at least one word that's primarily letters (min 2 chars)
      const hasNameWord = words.some(w => /^[a-zA-Z][a-zA-Z\-'\.]*$/.test(w) && w.length >= 2)
      if (hasNameWord) {
        return true
      }
    }
  }

  return false
}

function looksLikeEmail(text: string): boolean {
  if (!text || typeof text !== 'string') return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim())
}

function looksLikePhone(text: string): boolean {
  if (!text || typeof text !== 'string') return false
  const cleaned = text.replace(/[\s\-\(\)\.\+]/g, '')
  return /^\d{7,15}$/.test(cleaned)
}

interface ExtractedMusician {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  notes: string | null
}

// Strategy 1: Standard column-based parsing
function parseStandardFormat(
  data: (string | number | boolean | Date | null | undefined)[][],
  headers: string[]
): ExtractedMusician[] | null {
  const firstNameCol = findColumnIndex(headers, COLUMN_MAPPINGS.firstName)
  const lastNameCol = findColumnIndex(headers, COLUMN_MAPPINGS.lastName)
  const fullNameCol = findColumnIndex(headers, COLUMN_MAPPINGS.fullName)
  const emailCol = findColumnIndex(headers, COLUMN_MAPPINGS.email)
  const phoneCol = findColumnIndex(headers, COLUMN_MAPPINGS.phone)
  const notesCol = findColumnIndex(headers, COLUMN_MAPPINGS.notes)

  const hasFirstLast = firstNameCol !== -1 && lastNameCol !== -1
  const hasFullName = fullNameCol !== -1

  if (!hasFirstLast && !hasFullName) {
    return null // Can't use standard format
  }

  const musicians: ExtractedMusician[] = []

  for (let i = 1; i < data.length; i++) {
    const row = data[i]
    if (!row || row.every(cell => !cell)) continue

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

    if (!firstName && !lastName) continue

    if (!firstName && lastName) {
      firstName = lastName
      lastName = ''
    }

    const email = emailCol !== -1 ? String(row[emailCol] || '').trim() || null : null
    const phone = phoneCol !== -1 ? String(row[phoneCol] || '').trim() || null : null
    const notes = notesCol !== -1 ? String(row[notesCol] || '').trim() || null : null

    if (email && !looksLikeEmail(email)) continue

    musicians.push({ firstName, lastName, email, phone, notes })
  }

  return musicians.length > 0 ? musicians : null
}

// Strategy 2: Smart scanning - find all name-like values in the spreadsheet
function parseSmartScan(
  data: (string | number | boolean | Date | null | undefined)[][]
): ExtractedMusician[] {
  const musicians: ExtractedMusician[] = []
  const seenNames = new Set<string>()

  // Scan all cells for name-like values
  for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
    const row = data[rowIdx]
    if (!row) continue

    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const cell = row[colIdx]
      if (!cell) continue

      const cellStr = String(cell).trim()

      if (looksLikeName(cellStr)) {
        // Normalize for deduplication
        const normalizedName = cellStr.toLowerCase()
        if (seenNames.has(normalizedName)) continue
        seenNames.add(normalizedName)

        const { firstName, lastName } = splitFullName(cellStr)

        // Look for email/phone in nearby cells (same row, next few columns)
        let email: string | null = null
        let phone: string | null = null

        for (let nearCol = colIdx + 1; nearCol < Math.min(colIdx + 5, row.length); nearCol++) {
          const nearCell = row[nearCol]
          if (!nearCell) continue
          const nearStr = String(nearCell).trim()

          if (!email && looksLikeEmail(nearStr)) {
            email = nearStr
          } else if (!phone && looksLikePhone(nearStr)) {
            phone = nearStr
          }
        }

        musicians.push({
          firstName,
          lastName,
          email,
          phone,
          notes: null,
        })
      }
    }
  }

  return musicians
}

// Strategy 3: Section-based parsing (instrument headers with names below)
function parseSectionFormat(
  data: (string | number | boolean | Date | null | undefined)[][]
): ExtractedMusician[] {
  const musicians: ExtractedMusician[] = []
  const seenNames = new Set<string>()

  // Check if first row has instrument-like headers
  const headers = data[0] || []
  const instrumentColumns: number[] = []

  for (let i = 0; i < headers.length; i++) {
    if (headers[i] && looksLikeInstrumentHeader(String(headers[i]))) {
      instrumentColumns.push(i)
    }
  }

  if (instrumentColumns.length === 0) {
    return [] // Not a section-based format
  }

  // Scan rows under each instrument column
  for (let rowIdx = 1; rowIdx < data.length; rowIdx++) {
    const row = data[rowIdx]
    if (!row) continue

    for (const colIdx of instrumentColumns) {
      const cell = row[colIdx]
      if (!cell) continue

      const cellStr = String(cell).trim()

      if (looksLikeName(cellStr)) {
        const normalizedName = cellStr.toLowerCase()
        if (seenNames.has(normalizedName)) continue
        seenNames.add(normalizedName)

        const { firstName, lastName } = splitFullName(cellStr)

        // Look for email/phone in adjacent cells
        let email: string | null = null
        let phone: string | null = null

        for (let nearCol = colIdx + 1; nearCol < Math.min(colIdx + 3, row.length); nearCol++) {
          const nearCell = row[nearCol]
          if (!nearCell) continue
          const nearStr = String(nearCell).trim()

          if (!email && looksLikeEmail(nearStr)) {
            email = nearStr
          } else if (!phone && looksLikePhone(nearStr)) {
            phone = nearStr
          }
        }

        musicians.push({
          firstName,
          lastName,
          email,
          phone,
          notes: null,
        })
      }
    }
  }

  return musicians
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization found' }, { status: 404 })
  }

  if (membership.role !== 'owner' && membership.role !== 'admin') {
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const tagInput = formData.get('tag') as string | null
  const tags = tagInput ? [tagInput.trim()] : []

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const validExtensions = ['.xlsx', '.xls', '.csv']
  const fileName = file.name.toLowerCase()
  if (!validExtensions.some(ext => fileName.endsWith(ext))) {
    return NextResponse.json(
      { error: 'Invalid file type. Please upload an Excel (.xlsx, .xls) or CSV file.' },
      { status: 400 }
    )
  }

  try {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      cellNF: false,
      cellText: false,
    })

    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      return NextResponse.json({ error: 'Excel file is empty' }, { status: 400 })
    }

    const sheet = workbook.Sheets[sheetName]
    const data: (string | number | boolean | Date | null | undefined)[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: '',
    })

    if (data.length < 1) {
      return NextResponse.json({ error: 'File appears to be empty' }, { status: 400 })
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
      return NextResponse.json(
        {
          error: 'Could not find any musician names in the file. Please check that your spreadsheet contains names.',
          detectedColumns: headers.filter(h => h),
        },
        { status: 400 }
      )
    }

    // Filter out invalid entries and prepare for insert
    const validMusicians = musicians.filter(m => m.firstName || m.lastName)

    const musiciansToInsert = validMusicians.map(m => ({
      organization_id: membership.organization_id,
      first_name: m.firstName || m.lastName,
      last_name: m.firstName ? m.lastName : '',
      email: m.email && looksLikeEmail(m.email) ? m.email : null,
      phone: m.phone,
      notes: m.notes,
      is_active: true,
      tags: tags,
    }))

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
    }

    return NextResponse.json({
      success: musiciansToInsert.length,
      parseMethod,
      errors: 0,
      errorRows: [],
      totalErrorRows: 0,
    })
  } catch (err) {
    console.error('Excel import error:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to parse file: ${errorMessage}. Please ensure it is a valid Excel or CSV file.` },
      { status: 400 }
    )
  }
}
