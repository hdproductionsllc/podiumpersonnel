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

export function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return phone
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

function toTitleCase(str: string): string {
  if (!str) return str
  return str
    .toLowerCase()
    .split(/(\s+|-)/g)
    .map(part => {
      if (part.match(/^\s+$/) || part === '-') return part
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
  cleaned = cleaned.replace(/^[,\s:;\-]+/, '').replace(/[,\s:;]+$/, '')
  cleaned = cleaned.replace(/^\d{3}[\-\.\s]?\d{3}[\-\.\s]?\d{4}[\s,:]*/g, '')
  cleaned = cleaned.replace(/^\(\d{3}\)\s*\d{3}[\-\.\s]?\d{4}[\s,:]*/g, '')
  cleaned = cleaned.replace(/^\d{3}[\-\.\s]\d{4}[\s,:]*/g, '')
  cleaned = cleaned.replace(/\s*\(\d{3}\)\s*$/, '')
  cleaned = cleaned.replace(/\s*\d{3}[\-\.\s]?\d{3}[\-\.\s]?\d{4}\s*$/, '')
  cleaned = cleaned.replace(/["<>]/g, '')
  cleaned = cleaned.replace(/:+$/, '')
  cleaned = cleaned.replace(/^[,\s:;\-]+/, '').replace(/[,\s:;]+$/, '')
  return cleaned.trim()
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const cleaned = cleanName(fullName)
  if (!cleaned) return { firstName: '', lastName: '' }
  const parts = cleaned.split(/\s+/).filter(p => p.length > 0)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: toTitleCase(parts[0]), lastName: '' }
  const lastName = toTitleCase(parts.pop() || '')
  const firstName = toTitleCase(parts.join(' '))
  return { firstName, lastName }
}

function looksLikeInstrumentHeader(text: string): boolean {
  if (!text || typeof text !== 'string') return false
  return INSTRUMENT_PATTERNS.some(pattern => pattern.test(text))
}

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

const LOCATION_PATTERNS = [
  /^(san|los|new|las|el|la|santa|north|south|east|west|mount|fort|saint|st\.?)\s/i,
  /\b(ca|california|ny|tx|florida|usa|street|ave|avenue|blvd|road|rd|city|county)\b/i,
  /^\d{5}(-\d{4})?$/,
  /^\d{5},?\s/,
  /,\s*(ca|california|ny|tx|fl|az|wa|or|nv|co)\s*\d{0,5}$/i,
]

const CATEGORY_WORDS = new Set([
  'winds', 'brass', 'strings', 'woodwinds', 'percussion', 'keyboards', 'vocals',
  'section', 'principal', 'associate', 'assistant', 'substitute', 'extra',
  'tutti', 'solo', 'lead', 'backup', 'rhythm', 'melody',
])

function looksLikeLocation(text: string): boolean {
  if (!text) return false
  const lower = text.trim().toLowerCase()
  if (COMMON_CITIES.has(lower)) return true
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
  return CATEGORY_WORDS.has(text.trim().toLowerCase())
}

function looksLikeName(text: string): boolean {
  if (!text || typeof text !== 'string') return false
  const trimmed = text.trim()
  if (trimmed.length < 2 || trimmed.length > 50) return false
  if (/^[\-\s,.:;]+$/.test(trimmed)) return false
  if (/^\d+$/.test(trimmed)) return false
  if (looksLikePhone(trimmed)) return false
  if (/^(yes|no|n\/a|tbd|tba|none|null|undefined|\d{1,2}\/\d{1,2}|\d+:\d+|winds|brass|strings|woodwinds|percussion)$/i.test(trimmed)) return false
  if (/@/.test(trimmed)) return false
  if (/^<.*>/.test(trimmed)) return false
  if (trimmed.includes('@') || trimmed.includes('.com') || trimmed.includes('.net') || trimmed.includes('.org')) return false
  if (/^\d/.test(trimmed)) return false
  if (/^\+\d/.test(trimmed)) return false
  if (/^\(\d{3}\)/.test(trimmed)) return false
  if (looksLikeInstrumentHeader(trimmed)) return false
  if (looksLikeLocation(trimmed)) return false
  if (looksLikeCategory(trimmed)) return false
  if (trimmed === trimmed.toUpperCase() && /^[A-Z\s]+$/.test(trimmed)) {
    const words = trimmed.split(/\s+/)
    if (words.length === 1 || trimmed.length > 20) return false
  }
  if (/^[a-zA-Z]/.test(trimmed) && /[a-zA-Z]/.test(trimmed)) {
    const words = trimmed.split(/\s+/)
    if (words.length >= 1 && words.length <= 5) {
      const hasNameWord = words.some(w => /^[a-zA-Z][a-zA-Z\-'\.]*$/.test(w) && w.length >= 2)
      if (hasNameWord) return true
    }
  }
  return false
}

function splitMixedCell(text: string): { name: string; email: string | null; phone: string | null } | null {
  if (!text || typeof text !== 'string') return null
  const trimmed = text.trim()

  const dashParenMatch = trimmed.match(/^(.+?)-\((\d{3})\)\s*(\d{3}[\-\.\s]?\d{4})$/)
  if (dashParenMatch) {
    const name = dashParenMatch[1].trim()
    const phone = `(${dashParenMatch[2]}) ${dashParenMatch[3]}`
    if (name && /[a-zA-Z]{2,}/.test(name)) {
      return { name, email: null, phone }
    }
  }

  const parts = trimmed.split(',').map(p => p.trim()).filter(p => p)
  if (parts.length >= 2) {
    let name: string | null = null
    let email: string | null = null
    let phone: string | null = null

    for (const part of parts) {
      if (!email && looksLikeEmail(part)) {
        email = part.toLowerCase()
      } else if (!phone && looksLikePhone(part)) {
        phone = part
      } else if (!name && /[a-zA-Z]{2,}/.test(part) && !looksLikePhone(part) && !looksLikeEmail(part)) {
        name = part
      }
    }

    if (!phone) {
      for (const part of parts) {
        const phoneInPart = part.match(/\((\d{3})\)\s*(\d{3}[\-\.\s]?\d{4})/)
        if (phoneInPart) {
          phone = phoneInPart[0]
          const beforePhone = part.replace(phoneInPart[0], '').trim()
          if (beforePhone && !name && /[a-zA-Z]{2,}/.test(beforePhone)) {
            name = beforePhone
          }
        }
      }
    }

    if (name && (email || phone)) {
      return { name, email, phone }
    }
  }

  const spaceParenMatch = trimmed.match(/^(.+?)\s+\((\d{3})\)\s*(\d{3}[\-\.\s]?\d{4})$/)
  if (spaceParenMatch) {
    const name = spaceParenMatch[1].trim()
    const phone = `(${spaceParenMatch[2]}) ${spaceParenMatch[3]}`
    if (name && /[a-zA-Z]{2,}/.test(name) && !looksLikePhone(name)) {
      return { name, email: null, phone }
    }
  }

  return null
}

export function looksLikeEmail(text: string): boolean {
  if (!text || typeof text !== 'string') return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim())
}

export function looksLikePhone(text: string): boolean {
  if (!text || typeof text !== 'string') return false
  const trimmed = text.trim()
  if (/^\+?\(?\d{1,4}\)?[\s\-\.]?\d{2,4}[\s\-\.]?\d{3,4}$/.test(trimmed)) return true
  if (/^\+?\d[\d\s\-\.\(\)]{6,16}$/.test(trimmed)) return true
  const cleaned = trimmed.replace(/[\s\-\(\)\.\+]/g, '')
  return /^\d{7,15}$/.test(cleaned)
}

export interface ExtractedMusician {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  notes: string | null
}

type CellValue = string | number | boolean | Date | null | undefined

export function parseStandardFormat(
  data: CellValue[][],
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

  if (!hasFirstLast && !hasFullName) return null

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
    if (!firstName && lastName) { firstName = lastName; lastName = '' }

    const email = emailCol !== -1 ? String(row[emailCol] || '').trim().toLowerCase() || null : null
    const phone = phoneCol !== -1 ? String(row[phoneCol] || '').trim() || null : null
    const notes = notesCol !== -1 ? String(row[notesCol] || '').trim() || null : null

    if (email && !looksLikeEmail(email)) continue

    musicians.push({ firstName, lastName, email, phone, notes })
  }

  return musicians.length > 0 ? musicians : null
}

export function parseSmartScan(data: CellValue[][]): ExtractedMusician[] {
  const musicians: ExtractedMusician[] = []
  const seenNames = new Set<string>()

  for (let rowIdx = 0; rowIdx < data.length; rowIdx++) {
    const row = data[rowIdx]
    if (!row) continue

    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const cell = row[colIdx]
      if (!cell) continue

      const cellStr = String(cell).trim()
      let nameStr = cellStr
      let extractedEmail: string | null = null
      let extractedPhone: string | null = null

      if (looksLikeName(cellStr)) {
        // Cell is a clean name
      } else {
        const mixed = splitMixedCell(cellStr)
        if (mixed) {
          nameStr = mixed.name
          extractedEmail = mixed.email
          extractedPhone = mixed.phone
        } else {
          continue
        }
      }

      const normalizedName = nameStr.toLowerCase()
      if (seenNames.has(normalizedName)) continue
      seenNames.add(normalizedName)

      const { firstName, lastName } = splitFullName(nameStr)

      let email: string | null = extractedEmail
      let phone: string | null = extractedPhone

      for (let nearCol = colIdx + 1; nearCol < Math.min(colIdx + 5, row.length); nearCol++) {
        const nearCell = row[nearCol]
        if (!nearCell) continue
        const nearStr = String(nearCell).trim()
        if (!email && looksLikeEmail(nearStr)) email = nearStr
        else if (!phone && looksLikePhone(nearStr)) phone = nearStr
      }

      musicians.push({ firstName, lastName, email, phone, notes: null })
    }
  }

  return musicians
}

export function parseSectionFormat(data: CellValue[][]): ExtractedMusician[] {
  const musicians: ExtractedMusician[] = []
  const seenNames = new Set<string>()

  const headers = data[0] || []
  const instrumentColumns: number[] = []

  for (let i = 0; i < headers.length; i++) {
    if (headers[i] && looksLikeInstrumentHeader(String(headers[i]))) {
      instrumentColumns.push(i)
    }
  }

  if (instrumentColumns.length === 0) return []

  for (let rowIdx = 1; rowIdx < data.length; rowIdx++) {
    const row = data[rowIdx]
    if (!row) continue

    for (const colIdx of instrumentColumns) {
      const cell = row[colIdx]
      if (!cell) continue

      const cellStr = String(cell).trim()
      let nameStr = cellStr
      let extractedEmail: string | null = null
      let extractedPhone: string | null = null

      if (looksLikeName(cellStr)) {
        // Cell is a clean name
      } else {
        const mixed = splitMixedCell(cellStr)
        if (mixed) {
          nameStr = mixed.name
          extractedEmail = mixed.email
          extractedPhone = mixed.phone
        } else {
          continue
        }
      }

      const normalizedName = nameStr.toLowerCase()
      if (seenNames.has(normalizedName)) continue
      seenNames.add(normalizedName)

      const { firstName, lastName } = splitFullName(nameStr)

      let email: string | null = extractedEmail
      let phone: string | null = extractedPhone

      for (let nearCol = colIdx + 1; nearCol < Math.min(colIdx + 3, row.length); nearCol++) {
        const nearCell = row[nearCol]
        if (!nearCell) continue
        const nearStr = String(nearCell).trim()
        if (!email && looksLikeEmail(nearStr)) email = nearStr
        else if (!phone && looksLikePhone(nearStr)) phone = nearStr
      }

      musicians.push({ firstName, lastName, email, phone, notes: null })
    }
  }

  return musicians
}

export function parseVCard(text: string): ExtractedMusician[] {
  const musicians: ExtractedMusician[] = []
  const cards = text.split(/(?=BEGIN:VCARD)/i).filter(c => c.trim())

  for (const card of cards) {
    const lines = card.split(/\r?\n/)
    let firstName = ''
    let lastName = ''
    let email: string | null = null
    let phone: string | null = null

    for (const line of lines) {
      if (/^N[;:]/.test(line)) {
        const value = line.replace(/^N[^:]*:/, '')
        const parts = value.split(';')
        lastName = (parts[0] || '').trim()
        firstName = (parts[1] || '').trim()
      } else if (/^FN[;:]/.test(line) && !firstName && !lastName) {
        const value = line.replace(/^FN[^:]*:/, '').trim()
        const nameParts = value.split(/\s+/)
        if (nameParts.length >= 2) {
          firstName = nameParts.slice(0, -1).join(' ')
          lastName = nameParts[nameParts.length - 1]
        } else {
          firstName = value
        }
      } else if (/^TEL[;:]/.test(line)) {
        const value = line.replace(/^TEL[^:]*:/, '').trim()
        if (!phone && value) phone = value
      } else if (/^EMAIL[;:]/.test(line)) {
        const value = line.replace(/^EMAIL[^:]*:/, '').trim()
        if (!email && value) email = value.toLowerCase()
      }
    }

    if (firstName || lastName) {
      musicians.push({
        firstName: firstName ? toTitleCase(firstName) : '',
        lastName: lastName ? toTitleCase(lastName) : '',
        email,
        phone,
        notes: null,
      })
    }
  }

  return musicians
}
