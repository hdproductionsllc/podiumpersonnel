/**
 * Contract reader: pasted contract text -> the fields of a new gig.
 *
 * The office writes every booking as a 17hats contract with the same labelled
 * block ("Ensemble:", "Service:", "Client:", "Date:", "Venue:", "Performance
 * Time:", "Total Fee:", "50% Deposit:") followed by the standard terms. An admin
 * selects the whole page and pastes it, so the text arrives wrapped in the CRM's
 * menus and followed by pages of legal terms. Only the labelled block and a few
 * known sentences are read; everything else is ignored.
 *
 * SAME CONTRACT AS THE QUESTIONNAIRE PARSER (src/lib/intake/parser.ts): this
 * module only PROPOSES. Every value it returns lands in a visible, editable box
 * on the Add Project form, and anything it could not read, had to assume, or
 * found inconsistent is reported in `warnings`. It never guesses silently.
 *
 * Pure functions only: no I/O, deterministic. Dates are `yyyy-MM-dd`, times are
 * 24-hour `HH:mm`, both in the gig's local time (the form applies the org's
 * time zone, exactly as it does for hand-typed values).
 */

import type { EVENT_TYPES } from '@/lib/validations/projects'

/** The Add Project templates a contract's ensemble can select. */
export type ContractTemplate = 'string-quartet' | 'string-trio' | 'duo' | 'solo'

export type ContractEventType = (typeof EVENT_TYPES)[number]

export interface ParsedContract {
  /** The company named in the contract ("SUBITO STRINGS"), as written. */
  company: string | null
  /** Ensemble as written ("String Quartet"). */
  ensemble: string | null
  /** The template that ensemble maps to, or null when there is none (quintet, harp...). */
  template: ContractTemplate | null
  /** Service as written ("Wedding Ceremony and Coffee Hour"). */
  service: string | null
  /** Closest Event Type from the form's list, or '' when nothing fits. */
  eventType: ContractEventType | ''
  clientName: string | null
  /** yyyy-MM-dd */
  date: string | null
  venueName: string | null
  /** The "Performance Time" text, verbatim: the run of the day in the office's words. */
  performanceTime: string | null
  /** HH:mm. When the musicians arrive. */
  callTime: string | null
  /** HH:mm. When the music starts. */
  startTime: string | null
  /** HH:mm. When the music ends. */
  endTime: string | null
  totalFee: number | null
  depositAmount: number | null
  /** The percentage the deposit is labelled with ("50% Deposit" -> 50). */
  depositPercent: number | null
  /** How many days before the gig the balance is due. */
  balanceDueDays: number | null
  /** yyyy-MM-dd */
  balanceDueDate: string | null
  /** false = the page still shows "Sign Contract" for the client; null = cannot tell. */
  clientSigned: boolean | null
  /** How many of the labelled fields were found. 0 means this is not a contract. */
  fieldsFound: number
  warnings: string[]
}

// --- labelled fields ------------------------------------------------------------

type Label =
  | 'ensemble'
  | 'service'
  | 'client'
  | 'date'
  | 'venue'
  | 'performanceTime'
  | 'totalFee'
  | 'deposit'

// Anchored at the start of a line. "SERVICES:" (the paragraph that introduces the
// block) and "PERFORMANCE:" (a terms heading) must NOT match "Service:" and
// "Performance Time:", hence the exact words and the `\s*:` straight after.
const LABELS: { label: Label; re: RegExp }[] = [
  { label: 'ensemble', re: /^ensemble\s*:/i },
  { label: 'service', re: /^(?:service|event(?:\s+type)?|occasion)\s*:/i },
  { label: 'client', re: /^client(?:\s+name)?\s*:/i },
  { label: 'date', re: /^(?:(?:event|performance|wedding)\s+)?date\s*:/i },
  { label: 'venue', re: /^(?:venue|location)\s*:/i },
  { label: 'performanceTime', re: /^(?:(?:performance|event)\s+)?times?\s*:/i },
  { label: 'totalFee', re: /^total(?:\s+(?:fee|amount|price|cost))?\s*:/i },
  { label: 'deposit', re: /^(?:\d{1,3}\s*%\s*)?deposit(?:\s+amount)?\s*:/i },
]

const matchLabel = (line: string) => LABELS.find(({ re }) => re.test(line)) ?? null

/**
 * Read the labelled block. A value normally sits on the label's own line; when
 * the paste broke it onto the next line ("Client:" / "Monica Traupmann") the next
 * non-empty line is taken instead, unless that line is itself a label. The first
 * occurrence of a label wins.
 */
function readLabels(lines: string[]): Partial<Record<Label, { label: string; value: string }>> {
  const found: Partial<Record<Label, { label: string; value: string }>> = {}
  for (let i = 0; i < lines.length; i++) {
    const hit = matchLabel(lines[i])
    if (!hit || found[hit.label]) continue
    const colon = lines[i].indexOf(':')
    let value = lines[i].slice(colon + 1).trim()
    if (!value) {
      let j = i + 1
      while (j < lines.length && !lines[j]) j += 1
      if (j < lines.length && !matchLabel(lines[j])) value = lines[j]
    }
    if (value) found[hit.label] = { label: lines[i].slice(0, colon).trim(), value }
  }
  return found
}

// --- dates ------------------------------------------------------------------------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const pad = (n: number) => String(n).padStart(2, '0')

/** Build yyyy-MM-dd, or null when the day does not exist (2/30, 13/1). */
function toISODate(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

/**
 * "4/3/27", "04/03/2027", "April 3, 2027", "Saturday, April 3rd 2027", "3 April 2027".
 * Numeric dates are read month-first (US), which is how the office writes them.
 */
export function parseContractDate(text: string): string | null {
  const t = text.trim()

  const numeric = /\b(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4}|\d{2})\b/.exec(t)
  if (numeric) {
    const year = numeric[3].length === 2 ? 2000 + Number(numeric[3]) : Number(numeric[3])
    return toISODate(year, Number(numeric[1]), Number(numeric[2]))
  }

  const monthFirst = /\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i.exec(t)
  if (monthFirst) {
    const month = MONTHS.indexOf(monthFirst[1].slice(0, 3).toLowerCase())
    if (month >= 0) return toISODate(Number(monthFirst[3]), month + 1, Number(monthFirst[2]))
  }

  const dayFirst = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,9})\.?,?\s+(\d{4})\b/i.exec(t)
  if (dayFirst) {
    const month = MONTHS.indexOf(dayFirst[2].slice(0, 3).toLowerCase())
    if (month >= 0) return toISODate(Number(dayFirst[3]), month + 1, Number(dayFirst[1]))
  }

  return null
}

/** yyyy-MM-dd shifted by a number of days. */
function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + days))
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

// --- times ------------------------------------------------------------------------

const DAY = 24 * 60
const toMinutes = (hour12: number, minute: number, pm: boolean) => ((hour12 % 12) + (pm ? 12 : 0)) * 60 + minute
const toHHmm = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`
const fromHHmm = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

/** "08:30" -> "8:30 AM", for messages a person reads. */
export function formatContractTime(time: string): string {
  const minutes = fromHHmm(time)
  const hour = Math.floor(minutes / 60)
  return `${hour % 12 === 0 ? 12 : hour % 12}:${pad(minutes % 60)} ${hour < 12 ? 'AM' : 'PM'}`
}

// A clock time with its AM/PM: "8:30 AM", "9am", "11:00 a.m.".
const CLOCK = String.raw`(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m\b\.?`
// The first half of a range that leaves its AM/PM to the second: "5:00 - 7:00 PM".
const BARE_RANGE_RE = new RegExp(String.raw`\b(\d{1,2})(?::(\d{2}))?\s*(?:-|–|—|to|until)\s*${CLOCK}`, 'gi')

interface FoundTime {
  minutes: number
  /** Where in the text the time starts, to read the words around it. */
  index: number
}

/** Every clock time in a passage, in the order written. */
function findTimes(text: string): FoundTime[] {
  const times: FoundTime[] = []

  for (const m of text.matchAll(new RegExp(String.raw`\b${CLOCK}`, 'gi'))) {
    const hour = Number(m[1])
    const minute = m[2] ? Number(m[2]) : 0
    if (hour < 1 || hour > 12 || minute > 59) continue
    times.push({ minutes: toMinutes(hour, minute, m[3].toLowerCase() === 'p'), index: m.index })
  }

  // "5:00 - 7:00 PM": the 5:00 borrows the PM. If that would put it after the end
  // ("11:00 - 1:00 PM") it belongs to the other half of the day.
  for (const m of text.matchAll(BARE_RANGE_RE)) {
    const hour = Number(m[1])
    const minute = m[2] ? Number(m[2]) : 0
    if (hour < 1 || hour > 12 || minute > 59) continue
    const endPm = m[5].toLowerCase() === 'p'
    const end = toMinutes(Number(m[3]), m[4] ? Number(m[4]) : 0, endPm)
    let start = toMinutes(hour, minute, endPm)
    if (start >= end) start = toMinutes(hour, minute, !endPm)
    if (!times.some((t) => t.index === m.index)) times.push({ minutes: start, index: m.index })
  }

  for (const m of text.matchAll(/\bnoon\b/gi)) times.push({ minutes: 12 * 60, index: m.index })

  return times.sort((a, b) => a.index - b.index)
}

// The sentence that says when the PLAYERS arrive, as opposed to the guests.
const PLAYERS_RE = /\b(?:musicians?|artists?|players?|performers?|ensemble|quartet|trio|duo|soloist)\b/i
const ARRIVAL_RE = /\b(?:arriv\w*|load[-\s]?in|set[-\s]?up|call\s+time)\b/i
// "30 minutes prior", "1 hour before", "45 min early"
const LEAD_TIME_RE = /\b(\d{1,3}|one|an?)\s*(minutes?|mins?|hours?|hrs?)\s+(?:prior|before|early|earlier|ahead)\b/i
// Words that introduce the END of the music.
const END_CUE_RE = /\b(?:conclud\w*|end(?:s|ing)?|finish\w*|until|till|through)\b[^.;]{0,40}$/i

/** How long before the start the office asks musicians to arrive when a contract does not say. */
export const DEFAULT_CALL_LEAD_MINUTES = 30

interface ReadTimes {
  callTime: string | null
  startTime: string | null
  endTime: string | null
  warnings: string[]
}

/**
 * Read call / start / end out of the "Performance Time" sentence, e.g.
 *
 *   "8:30 AM guest arrival prelude music, ceremony at 9:00 AM, followed by coffee
 *    hour, to conclude by 11:00 AM. Musicians to arrive 30 minutes prior to guest
 *    arrival for setup at 8:00 AM."
 *
 * -> call 08:00, start 08:30, end 11:00. The music starts at the EARLIEST time in
 * the performance sentences (the prelude, not the ceremony), and ends at the time
 * introduced by "conclude / end / until", or failing that the latest time.
 */
export function readPerformanceTimes(text: string): ReadTimes {
  const warnings: string[] = []
  // A sentence ends at a full stop followed by a capital. Splitting on every
  // full stop would cut "a.m." in half.
  const sentences = text.split(/\.\s+(?=[A-Z])/)

  const arrival = sentences.filter((s) => PLAYERS_RE.test(s) && ARRIVAL_RE.test(s))
  const performance = sentences.filter((s) => !arrival.includes(s)).join('. ')

  // An evening that runs past midnight: "12:30 AM" is later than "9:00 PM", not
  // earlier. Small hours count as the next day whenever the passage also has an
  // afternoon or evening time.
  const found = findTimes(performance)
  const hasEvening = found.some((t) => t.minutes >= 12 * 60)
  const played = found.map((t) => (hasEvening && t.minutes < 5 * 60 ? { ...t, minutes: t.minutes + DAY } : t))
  let start: number | null = null
  let end: number | null = null

  if (played.length > 0) {
    start = Math.min(...played.map((t) => t.minutes))
    const cued = played.filter((t) => t.minutes !== start && END_CUE_RE.test(performance.slice(0, t.index)))
    if (cued.length > 0) end = cued[cued.length - 1].minutes
    else if (played.length > 1) end = Math.max(...played.map((t) => t.minutes))
    if (end !== null && end <= start) end = null
  }

  if (start === null) {
    warnings.push('No start time could be read from the Performance Time. Set the times yourself.')
  } else if (end !== null && end >= DAY) {
    // The form holds one calendar day, so an end after midnight has no box to go in.
    end = null
    warnings.push('The music runs past midnight, which the form cannot hold. Set the end time yourself.')
  } else if (end === null) {
    warnings.push('No end time could be read from the Performance Time. Set the end time yourself.')
  }

  // The players' arrival: a stated clock time wins ("for setup at 8:00 AM"); a
  // stated lead ("30 minutes prior") is next; the office's usual half hour is last
  // and is reported, because it is an assumption.
  let call: number | null = null
  const arrivalText = arrival.join('. ')
  const arrivalTimes = findTimes(arrivalText)
  const lead = LEAD_TIME_RE.exec(arrivalText)
  const leadMinutes = lead
    ? (/^\d+$/.test(lead[1]) ? Number(lead[1]) : 1) * (/^h/i.test(lead[2]) ? 60 : 1)
    : null

  if (arrivalTimes.length > 0) {
    call = arrivalTimes[arrivalTimes.length - 1].minutes
    if (start !== null && leadMinutes !== null && start - leadMinutes !== call) {
      warnings.push(
        `The contract says musicians arrive ${leadMinutes} minutes before a ${formatContractTime(toHHmm(start))} start, but gives ${formatContractTime(toHHmm(call))}. Check the call time.`
      )
    }
  } else if (start !== null && leadMinutes !== null) {
    call = start - leadMinutes
  } else if (start !== null) {
    call = start - DEFAULT_CALL_LEAD_MINUTES
    warnings.push(
      `The contract does not say when musicians arrive. Call time is set ${DEFAULT_CALL_LEAD_MINUTES} minutes before the start. Change it if needed.`
    )
  }

  if (call !== null && start !== null && call > start) {
    warnings.push('The call time read from the contract is after the start time. Check the times.')
  }
  if (call !== null && call < 0) call = null

  return {
    callTime: call === null ? null : toHHmm(call),
    startTime: start === null ? null : toHHmm(start),
    endTime: end === null ? null : toHHmm(end),
    warnings,
  }
}

// --- money ------------------------------------------------------------------------

/** "$5,890", "5890.00", "$ 5,890 USD" -> 5890. */
function parseMoney(text: string): number | null {
  const m = /\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?/.exec(text)
  if (!m) return null
  const amount = Number(m[1].replace(/,/g, '') + (m[2] ?? ''))
  return Number.isFinite(amount) ? amount : null
}

const formatMoney = (amount: number) =>
  `$${amount.toLocaleString('en-US', { minimumFractionDigits: amount % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`

const NUMBER_WORDS: Record<string, number> = {
  seven: 7, ten: 10, fourteen: 14, fifteen: 15, twenty: 20, 'twenty-one': 21, thirty: 30, sixty: 60, ninety: 90,
}

/** "Balance is due fourteen (14) days prior to the performance date" -> 14. */
function readBalanceDueDays(text: string): number | null {
  const m = /\bbalance\b[^.]{0,40}?\bdue\b([^.]{0,60}?)\bdays?\s+(?:prior|before|in\s+advance)/i.exec(text)
  if (!m) return null
  const digits = /\d{1,3}/.exec(m[1])
  if (digits) return Number(digits[0])
  const word = m[1].trim().toLowerCase().split(/\s+/).pop() ?? ''
  return NUMBER_WORDS[word] ?? null
}

// --- ensemble, service, company, signature ----------------------------------------

function templateFor(ensemble: string): ContractTemplate | null {
  if (/\bquartet\b/i.test(ensemble)) return 'string-quartet'
  if (/\btrio\b/i.test(ensemble)) return 'string-trio'
  if (/\b(?:duo|duet)\b/i.test(ensemble)) return 'duo'
  if (/\bsolo(?:ist)?\b/i.test(ensemble)) return 'solo'
  return null
}

/**
 * The closest Event Type on the form. Deliberately literal: "Ceremony and Coffee
 * Hour" is a Ceremony, not a "Ceremony & Cocktail Hour". The contract's own
 * wording is kept in full in the description, so nothing is lost by being strict.
 */
function eventTypeFor(service: string): ContractEventType | '' {
  const ceremony = /\bceremon/i.test(service)
  const cocktail = /\bcocktail/i.test(service)
  if (ceremony && cocktail) return 'Ceremony & Cocktail Hour'
  if (ceremony) return 'Ceremony'
  if (cocktail) return 'Cocktail Hour'
  if (/\breception\b/i.test(service)) return 'Reception'
  if (/\b(?:concert|recital)\b/i.test(service)) return 'Concert'
  if (/\b(?:corporate|company|conference|gala)\b/i.test(service)) return 'Corporate Event'
  return ''
}

/** "...purchaser of entertainment (Client) and SUBITO STRINGS (Company)." */
function readCompany(text: string): string | null {
  const m = /\band\s+([^().\n]{2,80}?)\s*\(\s*company\s*\)/i.exec(text)
  return m ? m[1].trim() : null
}

/** Letters and digits only, lowercased: "SUBITO STRINGS" and "Subito Strings" agree. */
const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Is the company on the contract the organization it is being added to? */
export function isSameCompany(company: string, organizationName: string): boolean {
  return fold(company) === fold(organizationName)
}

/**
 * 17hats shows a "Sign Contract" button under a party that has not signed and
 * "Signed <date>" under one that has. The company signs when it sends, so a
 * remaining "Sign Contract" is the client's.
 */
function readClientSigned(lines: string[]): boolean | null {
  if (lines.some((l) => /^sign\s+contract$/i.test(l))) return false
  if (lines.filter((l) => /^signed\b.*\d/i.test(l)).length >= 2) return true
  return null
}

// --- main -------------------------------------------------------------------------

export function parseContract(rawText: string): ParsedContract {
  const text = (rawText ?? '').replace(/\r\n?/g, '\n').replace(/ /g, ' ')
  const lines = text.split('\n').map((l) => l.trim())
  const fields = readLabels(lines)
  const warnings: string[] = []

  const fieldsFound = Object.keys(fields).length
  const result: ParsedContract = {
    company: readCompany(text),
    ensemble: fields.ensemble?.value ?? null,
    template: null,
    service: fields.service?.value ?? null,
    eventType: '',
    clientName: fields.client?.value ?? null,
    date: null,
    venueName: fields.venue?.value ?? null,
    performanceTime: fields.performanceTime?.value ?? null,
    callTime: null,
    startTime: null,
    endTime: null,
    totalFee: null,
    depositAmount: null,
    depositPercent: null,
    balanceDueDays: null,
    balanceDueDate: null,
    clientSigned: readClientSigned(lines),
    fieldsFound,
    warnings,
  }

  if (fieldsFound === 0) {
    warnings.push(
      'No contract details were found. Paste the whole contract, including the lines that start with "Client:", "Date:" and "Venue:".'
    )
    return result
  }

  if (result.ensemble) {
    result.template = templateFor(result.ensemble)
    if (!result.template) {
      warnings.push(`There is no template for "${result.ensemble}". The gig is created without chairs. Add the positions yourself.`)
    }
  } else {
    warnings.push('No ensemble was found. The gig is created without chairs. Add the positions yourself.')
  }

  if (result.service) result.eventType = eventTypeFor(result.service)
  if (!result.clientName) warnings.push('No client name was found.')
  if (!result.venueName) warnings.push('No venue was found.')

  if (fields.date) {
    result.date = parseContractDate(fields.date.value)
    if (!result.date) warnings.push(`The date "${fields.date.value}" could not be read. Set the date yourself.`)
  } else {
    warnings.push('No date was found.')
  }

  if (result.performanceTime) {
    const times = readPerformanceTimes(result.performanceTime)
    result.callTime = times.callTime
    result.startTime = times.startTime
    result.endTime = times.endTime
    warnings.push(...times.warnings)
  } else {
    warnings.push('No performance time was found. Set the times yourself.')
  }

  if (fields.totalFee) {
    result.totalFee = parseMoney(fields.totalFee.value)
    if (result.totalFee === null) warnings.push(`The total fee "${fields.totalFee.value}" could not be read.`)
  } else {
    warnings.push('No total fee was found.')
  }

  if (fields.deposit) {
    result.depositAmount = parseMoney(fields.deposit.value)
    const percent = /^(\d{1,3})\s*%/.exec(fields.deposit.label)
    result.depositPercent = percent ? Number(percent[1]) : null
    if (result.depositAmount === null) warnings.push(`The deposit "${fields.deposit.value}" could not be read.`)
  }

  // The label says "50% Deposit" and the amounts are typed by hand, so they can
  // disagree. That is worth knowing before the client pays the wrong figure.
  if (result.totalFee !== null && result.depositAmount !== null) {
    if (result.depositAmount > result.totalFee) {
      warnings.push(`The deposit (${formatMoney(result.depositAmount)}) is more than the total fee (${formatMoney(result.totalFee)}).`)
    } else if (result.depositPercent !== null) {
      const expected = Math.round(result.totalFee * result.depositPercent) / 100
      if (Math.abs(expected - result.depositAmount) >= 1) {
        warnings.push(
          `The deposit is labelled ${result.depositPercent}% but ${formatMoney(result.depositAmount)} is not ${result.depositPercent}% of ${formatMoney(result.totalFee)} (that would be ${formatMoney(expected)}). Both amounts are kept as written.`
        )
      }
    }
  }

  result.balanceDueDays = readBalanceDueDays(text)
  if (result.date && result.balanceDueDays !== null) {
    result.balanceDueDate = addDays(result.date, -result.balanceDueDays)
  }

  if (result.clientSigned === false) {
    warnings.push('The client has not signed this contract yet.')
  }

  return result
}

// --- wording for the form ---------------------------------------------------------

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2027-03-20" -> "Mar 20, 2027" */
function formatISODate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`
}

/**
 * The description musicians see: what the gig is, then the run of the day in the
 * contract's own words (the form only has room for call / start / end, and the
 * players need to know the ceremony is at 9:00).
 */
export function contractDescription(contract: ParsedContract): string {
  return [contract.service, contract.performanceTime].filter(Boolean).join('\n\n')
}

/** The payment terms as one team-only note: deposit, balance, and when it is due. */
export function contractPaymentNotes(contract: ParsedContract): string {
  const parts: string[] = []
  if (contract.depositAmount !== null) {
    parts.push(`Deposit ${formatMoney(contract.depositAmount)} to hold the date.`)
  }
  if (contract.totalFee !== null && contract.depositAmount !== null && contract.depositAmount <= contract.totalFee) {
    const balance = formatMoney(contract.totalFee - contract.depositAmount)
    parts.push(
      contract.balanceDueDate && contract.balanceDueDays !== null
        ? `Balance ${balance} due ${formatISODate(contract.balanceDueDate)} (${contract.balanceDueDays} days before the gig).`
        : `Balance ${balance}.`
    )
  }
  return parts.join(' ')
}
