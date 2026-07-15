/**
 * Book builder (Book Builder Phase C) — turn a CONFIRMED intake into per-
 * musician "books": a 00 playlist PDF plus each song's part PDF, numbered in
 * performance order for easy combining by filename sort (Acrobat workflow).
 *
 * Faithful port of the Mac system's gig_compiler conventions
 * ("Music Compiler Local System/Music Compiler/gig_compiler/"):
 *   - files named  "NN - Title - Artist - part.pdf"  (NN = global 2-digit
 *     number across ALL sections in section order; same number in every book)
 *   - playlist named "00 - Playlist.pdf" so it sorts first
 *   - folders per instrument ("01_Violin_1", …) when downloading all books
 *   - one-page playlist: client header, date | ENSEMBLE | venue, green part
 *     label, sections with gray headers, walking order under the processional,
 *     recessional cue VERBATIM after the first recessional song, footer
 *   - missing viola falls back to the vln2 file, named "vln2 as vla"
 *
 * FIDELITY: part PDFs are never rewritten — bytes are fetched from R2 and
 * placed in the zip byte-identical; only their FILENAMES are ours. The only
 * generated PDF is the playlist.
 *
 * Pure/isomorphic: no DOM, no fetch — usable from the API route, the browser,
 * and tests. The zip assembly and downloads live in the component.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { EnsembleCanon } from './matcher'

// --- ordering -----------------------------------------------------------------

/** 069's section enum in performance order (dinner/special fold to 'other'). */
export const BOOK_SECTION_ORDER = [
  'prelude', 'ceremony', 'recessional', 'postlude', 'cocktail_hour', 'reception', 'other',
] as const

const SECTION_LABELS: Record<string, string> = {
  prelude: 'PRELUDE',
  ceremony: 'CEREMONY',
  recessional: 'RECESSIONAL',
  postlude: 'POSTLUDE',
  cocktail_hour: 'COCKTAIL HOUR',
  reception: 'RECEPTION',
  other: 'OTHER',
}

export interface OrderableSong {
  section: string
  position: number
}

/** Sort songs into global book order: section order, then position within. */
export function orderForBook<T extends OrderableSong>(songs: T[]): T[] {
  const rank = new Map<string, number>(BOOK_SECTION_ORDER.map((s, i) => [s, i]))
  return [...songs].sort(
    (a, b) =>
      (rank.get(a.section) ?? 99) - (rank.get(b.section) ?? 99) || a.position - b.position
  )
}

// --- part folders (Mac config.folder_info) --------------------------------------

export interface BookPart {
  part: string
  folder: string
  label: string
}

/** Instrument folders per ensemble — mirrors the Mac config's folder_info. */
export function bookParts(ensemble: EnsembleCanon | undefined): BookPart[] {
  switch (ensemble) {
    case 'trio':
      return [
        { part: 'vln1', folder: '01_Violin_1', label: 'VIOLIN 1' },
        { part: 'vln2', folder: '02_Violin_2', label: 'VIOLIN 2' },
        { part: 'vc', folder: '03_Cello', label: 'CELLO' },
      ]
    case 'viola-trio':
      return [
        { part: 'vln1', folder: '01_Violin', label: 'VIOLIN' },
        { part: 'vla', folder: '02_Viola', label: 'VIOLA' },
        { part: 'vc', folder: '03_Cello', label: 'CELLO' },
      ]
    case 'duo':
      return [
        { part: 'vln1', folder: '01_Violin', label: 'VIOLIN' },
        { part: 'vc', folder: '02_Cello', label: 'CELLO' },
      ]
    case 'solo':
      return [{ part: 'vln1', folder: '01_Violin', label: 'VIOLIN' }]
    case 'quintet':
      return [
        { part: 'vln1', folder: '01_Violin_1', label: 'VIOLIN 1' },
        { part: 'vln2', folder: '02_Violin_2', label: 'VIOLIN 2' },
        { part: 'vla', folder: '03_Viola', label: 'VIOLA' },
        { part: 'vc', folder: '04_Cello', label: 'CELLO' },
        { part: 'bass', folder: '05_Bass', label: 'BASS' },
      ]
    case 'quartet':
    default:
      // Unknown/other ensembles get the quartet layout (the house default).
      return [
        { part: 'vln1', folder: '01_Violin_1', label: 'VIOLIN 1' },
        { part: 'vln2', folder: '02_Violin_2', label: 'VIOLIN 2' },
        { part: 'vla', folder: '03_Viola', label: 'VIOLA' },
        { part: 'vc', folder: '04_Cello', label: 'CELLO' },
      ]
  }
}

// --- filenames (Mac utils.normalize_for_filename + compiler._dest_filename) -----

/**
 * Strip a client's own list numbering from a stored title ("1. Air On The G
 * String") — the book's NN prefix is the number. Belt-and-suspenders for
 * intakes confirmed before the parser stripped these at parse time.
 */
export function stripListNumber(text: string): string {
  return text.replace(/^\d{1,2}[.)]\s+/, '')
}

/** Strip smart quotes and path separators so titles are filesystem-safe. */
export function normalizeForFilename(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[/\\:]/g, '-')
    .trim()
}

/** "NN - Title - Artist - part.pdf" (artist segment dropped when empty). */
export function destFilename(num: number, title: string, artist: string | null, partLabel: string): string {
  const nn = String(num).padStart(2, '0')
  const t = normalizeForFilename(title)
  const a = artist ? ` - ${normalizeForFilename(artist)}` : ''
  return `${nn} - ${t}${a} - ${partLabel}.pdf`
}

// --- picking the file for a part (compiler._process_song) -----------------------

export interface PartFileRow {
  part: string
  substitute: boolean
  played_on: string | null
  storage_path: string | null
  original_filename: string
}

export interface PickedFile {
  row: PartFileRow
  /** What the filename calls the part: "vln1", or "vln2 as vla" for covers. */
  fileLabel: string
  /** Human warning when a substitute/fallback was used; null for exact hits. */
  warning: string | null
}

/**
 * Choose the file that covers `part` for one work:
 *   1. the exact non-substitute part
 *   2. a recorded substitute file covering this line (played_on)
 *   3. Mac fallback: a missing viola is covered by the vln2 file ("vln2 as vla")
 */
export function pickFileForPart(rows: PartFileRow[], part: string, workTitle: string): PickedFile | null {
  const usable = rows.filter((r) => r.storage_path)
  const exact = usable.find((r) => r.part === part && !r.substitute)
  if (exact) return { row: exact, fileLabel: part, warning: null }

  const sub = usable.find((r) => r.substitute && r.played_on === part)
  if (sub) {
    return {
      row: sub,
      fileLabel: `${sub.part} as ${part}`,
      warning: `"${workTitle}": using the ${sub.part} substitute for ${part}`,
    }
  }

  if (part === 'vla') {
    const vln2 = usable.find((r) => r.part === 'vln2' && !r.substitute)
    if (vln2) {
      return {
        row: vln2,
        fileLabel: 'vln2 as vla',
        warning: `"${workTitle}": missing viola part — using vln2 as substitute`,
      }
    }
  }
  return null
}

// --- playlist PDF (Mac playlists.PlaylistPDF, via pdf-lib) -----------------------

export interface PlaylistSong {
  num: number
  section: string
  title: string
  artist: string | null
  role: string | null
  notes: string | null
  specialRequest?: boolean
}

export interface PlaylistHeader {
  client: string
  dateDisplay: string
  venue: string
  ensembleLabel: string
  groupName: string
  contact: string
  spotifyUrl: string | null
  recessionalCue: string | null
  processionalOrder: string[]
  notes: string | null
}

const GREEN = rgb(29 / 255, 185 / 255, 84 / 255)
const GRAY = rgb(0.5, 0.5, 0.5)
const DARK = rgb(33 / 255, 33 / 255, 33 / 255)
const SECTION_BG = rgb(240 / 255, 240 / 255, 240 / 255)
const RULE = rgb(220 / 255, 220 / 255, 220 / 255)
const NOTE_BG = rgb(255 / 255, 245 / 255, 157 / 255)

/** Replace characters Helvetica/WinAnsi can't encode (same map as the Mac app). */
export function sanitizePdfText(text: string): string {
  const replaced = text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    // NFC recomposes Mac-filename NFD ("Scho" + combining ̈ + "n") back to "ö",
    // which WinAnsi CAN encode — accents survive instead of being stripped.
    .normalize('NFC')
  let out = ''
  for (const ch of replaced) {
    const code = ch.codePointAt(0)!
    if (code >= 0x300 && code <= 0x36f) continue // stray marks that didn't compose
    out += code <= 0xff ? ch : '?'
  }
  return out
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w
    if (font.widthOfTextAtSize(probe, size) <= maxWidth || !line) {
      line = probe
    } else {
      lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  return lines
}

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let t = text
  while (t.length > 1 && font.widthOfTextAtSize(t + '...', size) > maxWidth) t = t.slice(0, -1)
  return t.trimEnd() + '...'
}

// --- combined-book merge --------------------------------------------------------

export interface MergeSource {
  /** Human name for error messages ("03 - My Girl - vln1.pdf"). */
  name: string
  bytes: Uint8Array
}

/**
 * Merge PDFs into one document, in order — the Acrobat "combine by number"
 * step, automated. STRUCTURAL merge only: pages are copied as objects with
 * their fonts, vector content, and image streams verbatim; nothing is
 * re-rendered, rasterized, or recompressed, so the music renders identically
 * to the source files (the artifacting the owner hit before came from tools
 * that re-render pages — this never decodes them).
 *
 * Throws with the offending file's name if a source can't be parsed, so a
 * musician can never silently receive a book with a missing song.
 */
export async function mergePdfs(sources: MergeSource[]): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  for (const src of sources) {
    try {
      const doc = await PDFDocument.load(src.bytes, { ignoreEncryption: true })
      const pages = await out.copyPages(doc, doc.getPageIndices())
      for (const p of pages) out.addPage(p)
    } catch (e) {
      throw new Error(
        `Could not merge "${src.name}" — the file may be damaged. ` +
          `Download the zip instead, or replace this PDF in the library. (${e instanceof Error ? e.message : e})`
      )
    }
  }
  return out.save()
}

/**
 * Build the one-page playlist PDF. `partLabel` prints in green under the
 * header for a musician's book; null for the instrument-agnostic printable.
 */
export async function buildPlaylistPdf(
  header: PlaylistHeader,
  songs: PlaylistSong[],
  partLabel: string | null
): Promise<Uint8Array> {
  const s = sanitizePdfText
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792]) // Letter, portrait
  const helv = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique)
  const boldItalic = await doc.embedFont(StandardFonts.HelveticaBoldOblique)

  const left = 28
  const right = 584
  const width = right - left

  // Song density → font/row sizing (Mac's _calculate_sizing, simplified tiers).
  const total = songs.length
  const songSize = total <= 30 ? 9 : total <= 40 ? 8.5 : total <= 50 ? 8 : 7.5
  const rowH = total <= 30 ? 13 : total <= 40 ? 12 : total <= 50 ? 11 : 10

  let y = 792 - 30

  const drawCentered = (text: string, font: PDFFont, size: number, color = DARK) => {
    const w = font.widthOfTextAtSize(text, size)
    page.drawText(text, { x: (612 - w) / 2, y, size, font, color })
  }

  // --- header ---
  drawCentered(s(header.client), bold, 18)
  y -= 16
  drawCentered(
    s([header.dateDisplay, header.ensembleLabel.toUpperCase(), header.venue].filter(Boolean).join('  |  ')),
    helv, 10, GRAY
  )
  y -= 13
  if (partLabel) {
    drawCentered(s(partLabel), bold, 12, GREEN)
    y -= 13
  }
  const infoBits: string[] = []
  if (header.contact) infoBits.push(`Contact: ${header.contact}`)
  if (header.spotifyUrl) infoBits.push('Spotify playlist on the gig page')
  if (infoBits.length > 0) {
    drawCentered(s(infoBits.join('  |  ')), helv, 8.5, GRAY)
    y -= 10
  }
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.7, color: RULE })
  y -= 10

  // --- global gig notes ---
  if (header.notes) {
    for (const line of wrapText(s(header.notes), italic, 8, width - 10)) {
      page.drawText(line, { x: left + 5, y, size: 8, font: italic, color: GRAY })
      y -= 9.5
    }
    y -= 2
  }

  // --- sections + songs ---
  const drawSectionHeader = (label: string) => {
    page.drawRectangle({ x: left, y: y - 3, width, height: rowH, color: SECTION_BG })
    page.drawText(`  ${label}`, { x: left, y, size: songSize + 0.5, font: bold, color: DARK })
    y -= rowH + 2
  }

  const drawSongRow = (song: PlaylistSong) => {
    const numText = `${String(song.num).padStart(2, '0')}.`
    page.drawText(numText, { x: left + 6, y, size: songSize, font: bold, color: DARK })
    let x = left + 28
    const roleText = song.role ? `  (${s(song.role)})` : ''
    const roleW = roleText ? italic.widthOfTextAtSize(roleText, songSize - 0.5) : 0
    const specialText = song.specialRequest ? '  [SPECIAL REQUEST]' : ''
    const specialW = specialText ? boldItalic.widthOfTextAtSize(specialText, songSize - 0.5) : 0
    const avail = right - x - roleW - specialW

    const title = truncate(s(song.title), bold, songSize, avail * 0.7)
    page.drawText(title, { x, y, size: songSize, font: bold, color: DARK })
    x += bold.widthOfTextAtSize(title, songSize)

    if (song.artist) {
      const artist = truncate(` - ${s(song.artist)}`, helv, songSize, avail - bold.widthOfTextAtSize(title, songSize))
      page.drawText(artist, { x, y, size: songSize, font: helv, color: GRAY })
      x += helv.widthOfTextAtSize(artist, songSize)
    }
    if (roleText) {
      page.drawText(roleText, { x, y, size: songSize - 0.5, font: italic, color: GREEN })
      x += roleW
    }
    if (specialText) {
      page.drawText(specialText, { x, y, size: songSize - 0.5, font: boldItalic, color: DARK })
    }
    y -= rowH

    if (song.notes) {
      for (const line of wrapText(s(song.notes), boldItalic, songSize - 1, width - 40)) {
        const w = boldItalic.widthOfTextAtSize(line, songSize - 1)
        page.drawRectangle({ x: left + 26, y: y - 2, width: w + 6, height: 10, color: NOTE_BG })
        page.drawText(line, { x: left + 29, y, size: songSize - 1, font: boldItalic, color: DARK })
        y -= 10.5
      }
      y -= 1
    }
  }

  const drawProcessionalOrder = () => {
    if (header.processionalOrder.length === 0) return
    const text = header.processionalOrder.map((step, i) => `${i + 1}. ${s(step)}`).join('   ')
    for (const line of wrapText(text, helv, 7, width - 40)) {
      page.drawText(line, { x: left + 28, y, size: 7, font: helv, color: GRAY })
      y -= 8.5
    }
    y -= 1.5
  }

  const drawRecessionalCue = () => {
    if (!header.recessionalCue) return
    const cue = `Cue: "${s(header.recessionalCue)}"`
    for (const line of wrapText(cue, italic, 7.5, width - 40)) {
      page.drawText(line, { x: left + 28, y, size: 7.5, font: italic, color: GRAY })
      y -= 9
    }
    y -= 1.5
  }

  const ordered = [...songs].sort((a, b) => a.num - b.num)
  let cueDrawn = false
  let procDrawn = false
  for (const section of BOOK_SECTION_ORDER) {
    const inSection = ordered.filter((x) => x.section === section)
    if (inSection.length === 0) continue
    drawSectionHeader(SECTION_LABELS[section] ?? section.toUpperCase())
    for (const song of inSection) {
      drawSongRow(song)
      if (!procDrawn && song.role && song.role.toLowerCase().includes('processional')) {
        drawProcessionalOrder()
        procDrawn = true
      }
      if (section === 'recessional' && !cueDrawn) {
        drawRecessionalCue()
        cueDrawn = true
      }
    }
  }

  // --- footer ---
  const footer = s([header.groupName, header.client, header.dateDisplay].filter(Boolean).join('  |  '))
  page.drawLine({ start: { x: left, y: 30 }, end: { x: right, y: 30 }, thickness: 0.7, color: RULE })
  const fw = helv.widthOfTextAtSize(footer, 7)
  page.drawText(footer, { x: (612 - fw) / 2, y: 20, size: 7, font: helv, color: rgb(0.63, 0.63, 0.63) })

  return doc.save()
}
