import { z } from 'zod'

export const INSTRUMENT_SECTIONS = [
  'strings',
  'woodwinds',
  'brass',
  'percussion',
  'other',
] as const

export type InstrumentSection = (typeof INSTRUMENT_SECTIONS)[number]

export const instrumentSchema = z.object({
  name: z
    .string()
    .min(1, 'Instrument name is required')
    .max(255, 'Name must be less than 255 characters'),
  abbreviation: z
    .string()
    .max(10, 'Abbreviation must be 10 characters or less')
    .optional()
    .or(z.literal('')),
  section: z
    .enum(INSTRUMENT_SECTIONS)
    .optional()
    .or(z.literal('')),
  sort_order: z
    .number()
    .int()
    .min(0),
})

export type InstrumentInput = z.infer<typeof instrumentSchema>

export const SECTION_LABELS: Record<InstrumentSection, string> = {
  strings: 'Strings',
  woodwinds: 'Woodwinds',
  brass: 'Brass',
  percussion: 'Percussion',
  other: 'Other',
}

export const STANDARD_INSTRUMENTS: {
  name: string
  abbreviation: string
  section: InstrumentSection
  sort_order: number
}[] = [
  // Strings
  { name: 'Violin 1', abbreviation: 'Vln 1', section: 'strings', sort_order: 1 },
  { name: 'Violin 2', abbreviation: 'Vln 2', section: 'strings', sort_order: 2 },
  { name: 'Viola', abbreviation: 'Vla', section: 'strings', sort_order: 3 },
  { name: 'Cello', abbreviation: 'Vc', section: 'strings', sort_order: 4 },
  { name: 'Double Bass', abbreviation: 'Db', section: 'strings', sort_order: 5 },
  { name: 'Harp', abbreviation: 'Hp', section: 'strings', sort_order: 6 },

  // Woodwinds
  { name: 'Flute', abbreviation: 'Fl', section: 'woodwinds', sort_order: 10 },
  { name: 'Piccolo', abbreviation: 'Picc', section: 'woodwinds', sort_order: 11 },
  { name: 'Oboe', abbreviation: 'Ob', section: 'woodwinds', sort_order: 12 },
  { name: 'English Horn', abbreviation: 'EH', section: 'woodwinds', sort_order: 13 },
  { name: 'Clarinet', abbreviation: 'Cl', section: 'woodwinds', sort_order: 14 },
  { name: 'Bass Clarinet', abbreviation: 'BCl', section: 'woodwinds', sort_order: 15 },
  { name: 'Bassoon', abbreviation: 'Bsn', section: 'woodwinds', sort_order: 16 },
  { name: 'Contrabassoon', abbreviation: 'Cbsn', section: 'woodwinds', sort_order: 17 },

  // Brass
  { name: 'French Horn', abbreviation: 'Hn', section: 'brass', sort_order: 20 },
  { name: 'Trumpet', abbreviation: 'Tpt', section: 'brass', sort_order: 21 },
  { name: 'Trombone', abbreviation: 'Tbn', section: 'brass', sort_order: 22 },
  { name: 'Bass Trombone', abbreviation: 'BTbn', section: 'brass', sort_order: 23 },
  { name: 'Tuba', abbreviation: 'Tba', section: 'brass', sort_order: 24 },

  // Percussion
  { name: 'Timpani', abbreviation: 'Timp', section: 'percussion', sort_order: 30 },
  { name: 'Percussion', abbreviation: 'Perc', section: 'percussion', sort_order: 31 },
  { name: 'Keyboard', abbreviation: 'Kbd', section: 'percussion', sort_order: 32 },

  // Other
  { name: 'Piano', abbreviation: 'Pno', section: 'other', sort_order: 40 },
  { name: 'Celesta', abbreviation: 'Cel', section: 'other', sort_order: 41 },
  { name: 'Organ', abbreviation: 'Org', section: 'other', sort_order: 42 },
]
