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
  { name: 'Guitar', abbreviation: 'Gtr', section: 'strings', sort_order: 7 },
  { name: 'Bass Guitar', abbreviation: 'Bass', section: 'strings', sort_order: 8 },
  { name: 'Mandolin', abbreviation: 'Mand', section: 'strings', sort_order: 9 },

  // Woodwinds
  { name: 'Flute', abbreviation: 'Fl', section: 'woodwinds', sort_order: 10 },
  { name: 'Piccolo', abbreviation: 'Picc', section: 'woodwinds', sort_order: 11 },
  { name: 'Alto Flute', abbreviation: 'AFl', section: 'woodwinds', sort_order: 12 },
  { name: 'Oboe', abbreviation: 'Ob', section: 'woodwinds', sort_order: 13 },
  { name: 'English Horn', abbreviation: 'EH', section: 'woodwinds', sort_order: 14 },
  { name: 'Clarinet', abbreviation: 'Cl', section: 'woodwinds', sort_order: 15 },
  { name: 'Eb Clarinet', abbreviation: 'EbCl', section: 'woodwinds', sort_order: 16 },
  { name: 'Bass Clarinet', abbreviation: 'BCl', section: 'woodwinds', sort_order: 17 },
  { name: 'Bassoon', abbreviation: 'Bsn', section: 'woodwinds', sort_order: 18 },
  { name: 'Contrabassoon', abbreviation: 'Cbsn', section: 'woodwinds', sort_order: 19 },
  { name: 'Alto Saxophone', abbreviation: 'ASax', section: 'woodwinds', sort_order: 20 },
  { name: 'Tenor Saxophone', abbreviation: 'TSax', section: 'woodwinds', sort_order: 21 },
  { name: 'Baritone Saxophone', abbreviation: 'BSax', section: 'woodwinds', sort_order: 22 },
  { name: 'Soprano Saxophone', abbreviation: 'SSax', section: 'woodwinds', sort_order: 23 },
  { name: 'Recorder', abbreviation: 'Rec', section: 'woodwinds', sort_order: 24 },

  // Brass
  { name: 'French Horn', abbreviation: 'Hn', section: 'brass', sort_order: 30 },
  { name: 'Trumpet', abbreviation: 'Tpt', section: 'brass', sort_order: 31 },
  { name: 'Cornet', abbreviation: 'Cnt', section: 'brass', sort_order: 32 },
  { name: 'Flugelhorn', abbreviation: 'Flug', section: 'brass', sort_order: 33 },
  { name: 'Trombone', abbreviation: 'Tbn', section: 'brass', sort_order: 34 },
  { name: 'Bass Trombone', abbreviation: 'BTbn', section: 'brass', sort_order: 35 },
  { name: 'Euphonium', abbreviation: 'Euph', section: 'brass', sort_order: 36 },
  { name: 'Tuba', abbreviation: 'Tba', section: 'brass', sort_order: 37 },

  // Percussion
  { name: 'Timpani', abbreviation: 'Timp', section: 'percussion', sort_order: 40 },
  { name: 'Percussion', abbreviation: 'Perc', section: 'percussion', sort_order: 41 },
  { name: 'Snare Drum', abbreviation: 'SD', section: 'percussion', sort_order: 42 },
  { name: 'Bass Drum', abbreviation: 'BD', section: 'percussion', sort_order: 43 },
  { name: 'Cymbals', abbreviation: 'Cym', section: 'percussion', sort_order: 44 },
  { name: 'Vibraphone', abbreviation: 'Vib', section: 'percussion', sort_order: 45 },
  { name: 'Marimba', abbreviation: 'Mar', section: 'percussion', sort_order: 46 },
  { name: 'Xylophone', abbreviation: 'Xyl', section: 'percussion', sort_order: 47 },
  { name: 'Glockenspiel', abbreviation: 'Glock', section: 'percussion', sort_order: 48 },
  { name: 'Chimes', abbreviation: 'Chm', section: 'percussion', sort_order: 49 },
  { name: 'Drum Set', abbreviation: 'Drums', section: 'percussion', sort_order: 50 },

  // Other
  { name: 'Piano', abbreviation: 'Pno', section: 'other', sort_order: 60 },
  { name: 'Keyboard', abbreviation: 'Kbd', section: 'other', sort_order: 61 },
  { name: 'Celesta', abbreviation: 'Cel', section: 'other', sort_order: 62 },
  { name: 'Organ', abbreviation: 'Org', section: 'other', sort_order: 63 },
  { name: 'Harpsichord', abbreviation: 'Hpd', section: 'other', sort_order: 64 },
  { name: 'Synthesizer', abbreviation: 'Synth', section: 'other', sort_order: 65 },
  { name: 'Accordion', abbreviation: 'Acc', section: 'other', sort_order: 66 },
  { name: 'Voice - Soprano', abbreviation: 'Sop', section: 'other', sort_order: 70 },
  { name: 'Voice - Alto', abbreviation: 'Alto', section: 'other', sort_order: 71 },
  { name: 'Voice - Tenor', abbreviation: 'Ten', section: 'other', sort_order: 72 },
  { name: 'Voice - Baritone', abbreviation: 'Bar', section: 'other', sort_order: 73 },
  { name: 'Voice - Bass', abbreviation: 'Bas', section: 'other', sort_order: 74 },
  { name: 'Conductor', abbreviation: 'Cond', section: 'other', sort_order: 80 },
]
