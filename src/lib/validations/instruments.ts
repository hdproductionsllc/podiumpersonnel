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
  { name: 'Violin 1', abbreviation: 'Vln 1', section: 'strings', sort_order: 100 },
  { name: 'Violin 2', abbreviation: 'Vln 2', section: 'strings', sort_order: 101 },
  { name: 'Viola', abbreviation: 'Vla', section: 'strings', sort_order: 102 },
  { name: 'Cello', abbreviation: 'Vc', section: 'strings', sort_order: 103 },
  { name: 'Double Bass', abbreviation: 'Db', section: 'strings', sort_order: 104 },
  { name: 'Harp', abbreviation: 'Hp', section: 'other', sort_order: 510 },
  { name: 'Guitar', abbreviation: 'Gtr', section: 'other', sort_order: 511 },
  { name: 'Electric Guitar', abbreviation: 'EGtr', section: 'other', sort_order: 512 },
  { name: 'Bass Guitar', abbreviation: 'Bass', section: 'other', sort_order: 513 },
  { name: 'Banjo', abbreviation: 'Bnj', section: 'other', sort_order: 514 },
  { name: 'Mandolin', abbreviation: 'Mand', section: 'other', sort_order: 515 },

  // Woodwinds
  { name: 'Flute', abbreviation: 'Fl', section: 'woodwinds', sort_order: 200 },
  { name: 'Piccolo', abbreviation: 'Picc', section: 'woodwinds', sort_order: 201 },
  { name: 'Alto Flute', abbreviation: 'AFl', section: 'woodwinds', sort_order: 202 },
  { name: 'Bass Flute', abbreviation: 'BFl', section: 'woodwinds', sort_order: 203 },
  { name: 'Oboe', abbreviation: 'Ob', section: 'woodwinds', sort_order: 204 },
  { name: "Oboe d'Amore", abbreviation: 'OdA', section: 'woodwinds', sort_order: 205 },
  { name: 'English Horn', abbreviation: 'EH', section: 'woodwinds', sort_order: 206 },
  { name: 'Clarinet', abbreviation: 'Cl', section: 'woodwinds', sort_order: 207 },
  { name: 'Clarinet in A', abbreviation: 'Cl(A)', section: 'woodwinds', sort_order: 208 },
  { name: 'Eb Clarinet', abbreviation: 'EbCl', section: 'woodwinds', sort_order: 209 },
  { name: 'Bass Clarinet', abbreviation: 'BCl', section: 'woodwinds', sort_order: 210 },
  { name: 'Contrabass Clarinet', abbreviation: 'CbCl', section: 'woodwinds', sort_order: 211 },
  { name: 'Bassoon', abbreviation: 'Bsn', section: 'woodwinds', sort_order: 212 },
  { name: 'Contrabassoon', abbreviation: 'Cbsn', section: 'woodwinds', sort_order: 213 },
  { name: 'Soprano Saxophone', abbreviation: 'SSax', section: 'woodwinds', sort_order: 214 },
  { name: 'Alto Saxophone', abbreviation: 'ASax', section: 'woodwinds', sort_order: 215 },
  { name: 'Tenor Saxophone', abbreviation: 'TSax', section: 'woodwinds', sort_order: 216 },
  { name: 'Baritone Saxophone', abbreviation: 'BSax', section: 'woodwinds', sort_order: 217 },
  { name: 'Recorder', abbreviation: 'Rec', section: 'woodwinds', sort_order: 218 },

  // Brass
  { name: 'French Horn', abbreviation: 'Hn', section: 'brass', sort_order: 300 },
  { name: 'Trumpet', abbreviation: 'Tpt', section: 'brass', sort_order: 301 },
  { name: 'Piccolo Trumpet', abbreviation: 'PicTpt', section: 'brass', sort_order: 302 },
  { name: 'Cornet', abbreviation: 'Cnt', section: 'brass', sort_order: 303 },
  { name: 'Flugelhorn', abbreviation: 'Flug', section: 'brass', sort_order: 304 },
  { name: 'Trombone', abbreviation: 'Tbn', section: 'brass', sort_order: 305 },
  { name: 'Alto Trombone', abbreviation: 'ATbn', section: 'brass', sort_order: 306 },
  { name: 'Bass Trombone', abbreviation: 'BTbn', section: 'brass', sort_order: 307 },
  { name: 'Bass Trumpet', abbreviation: 'BTpt', section: 'brass', sort_order: 308 },
  { name: 'Euphonium', abbreviation: 'Euph', section: 'brass', sort_order: 309 },
  { name: 'Tuba', abbreviation: 'Tba', section: 'brass', sort_order: 310 },
  { name: 'Wagner Tuba', abbreviation: 'WTba', section: 'brass', sort_order: 311 },

  // Percussion
  { name: 'Timpani', abbreviation: 'Timp', section: 'percussion', sort_order: 400 },
  { name: 'Percussion', abbreviation: 'Perc', section: 'percussion', sort_order: 401 },
  { name: 'Snare Drum', abbreviation: 'SD', section: 'percussion', sort_order: 402 },
  { name: 'Bass Drum', abbreviation: 'BD', section: 'percussion', sort_order: 403 },
  { name: 'Cymbals', abbreviation: 'Cym', section: 'percussion', sort_order: 404 },
  { name: 'Tam-tam', abbreviation: 'TT', section: 'percussion', sort_order: 405 },
  { name: 'Triangle', abbreviation: 'Tri', section: 'percussion', sort_order: 406 },
  { name: 'Tambourine', abbreviation: 'Tamb', section: 'percussion', sort_order: 407 },
  { name: 'Crotales', abbreviation: 'Crot', section: 'percussion', sort_order: 408 },
  { name: 'Vibraphone', abbreviation: 'Vib', section: 'percussion', sort_order: 409 },
  { name: 'Marimba', abbreviation: 'Mar', section: 'percussion', sort_order: 410 },
  { name: 'Xylophone', abbreviation: 'Xyl', section: 'percussion', sort_order: 411 },
  { name: 'Glockenspiel', abbreviation: 'Glock', section: 'percussion', sort_order: 412 },
  { name: 'Chimes', abbreviation: 'Chm', section: 'percussion', sort_order: 413 },
  { name: 'Drum Set', abbreviation: 'Drums', section: 'percussion', sort_order: 414 },

  // Keyboards & Other
  { name: 'Piano', abbreviation: 'Pno', section: 'other', sort_order: 500 },
  { name: 'Keyboard', abbreviation: 'Kbd', section: 'other', sort_order: 501 },
  { name: 'Celesta', abbreviation: 'Cel', section: 'other', sort_order: 502 },
  { name: 'Organ', abbreviation: 'Org', section: 'other', sort_order: 503 },
  { name: 'Harpsichord', abbreviation: 'Hpd', section: 'other', sort_order: 504 },
  { name: 'Synthesizer', abbreviation: 'Synth', section: 'other', sort_order: 505 },
  { name: 'Accordion', abbreviation: 'Acc', section: 'other', sort_order: 506 },

  // Voices
  { name: 'Voice - Soprano', abbreviation: 'Sop', section: 'other', sort_order: 600 },
  { name: 'Voice - Mezzo-Soprano', abbreviation: 'Mez', section: 'other', sort_order: 601 },
  { name: 'Voice - Alto', abbreviation: 'Alto', section: 'other', sort_order: 602 },
  { name: 'Voice - Countertenor', abbreviation: 'CTen', section: 'other', sort_order: 603 },
  { name: 'Voice - Tenor', abbreviation: 'Ten', section: 'other', sort_order: 604 },
  { name: 'Voice - Baritone', abbreviation: 'Bar', section: 'other', sort_order: 605 },
  { name: 'Voice - Bass', abbreviation: 'Bas', section: 'other', sort_order: 606 },

  // Staff Positions
  { name: 'Conductor', abbreviation: 'Cond', section: 'other', sort_order: 700 },
  { name: 'Music Librarian', abbreviation: 'Lib', section: 'other', sort_order: 701 },
]
