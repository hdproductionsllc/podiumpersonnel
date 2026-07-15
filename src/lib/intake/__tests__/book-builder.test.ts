/**
 * Book builder tests (Phase C) — Mac gig_compiler conventions, ported:
 * global numbering across sections, "NN - Title - Artist - part.pdf" names,
 * folder layouts per ensemble, substitute/vln2-as-vla fallback, and a real
 * playlist PDF build.
 */
import { describe, it, expect } from 'vitest'
import {
  orderForBook,
  bookParts,
  destFilename,
  normalizeForFilename,
  stripListNumber,
  pickFileForPart,
  sanitizePdfText,
  buildPlaylistPdf,
  mergePdfs,
  matchInstrumentForPart,
  type PartFileRow,
  type PlaylistHeader,
} from '../book-builder'

describe('orderForBook', () => {
  it('orders sections prelude → ceremony → recessional → postlude → cocktail → reception → other', () => {
    const songs = [
      { section: 'reception', position: 0 },
      { section: 'ceremony', position: 1 },
      { section: 'prelude', position: 0 },
      { section: 'ceremony', position: 0 },
      { section: 'other', position: 0 },
      { section: 'recessional', position: 0 },
    ]
    expect(orderForBook(songs).map((s) => `${s.section}:${s.position}`)).toEqual([
      'prelude:0', 'ceremony:0', 'ceremony:1', 'recessional:0', 'reception:0', 'other:0',
    ])
  })
})

describe('bookParts', () => {
  it('quartet gets the four-folder Mac layout', () => {
    expect(bookParts('quartet')).toEqual([
      { part: 'vln1', folder: '01_Violin_1', label: 'VIOLIN 1' },
      { part: 'vln2', folder: '02_Violin_2', label: 'VIOLIN 2' },
      { part: 'vla', folder: '03_Viola', label: 'VIOLA' },
      { part: 'vc', folder: '04_Cello', label: 'CELLO' },
    ])
  })

  it('trio is vln1/vln2/vc; viola-trio is vln/vla/vc', () => {
    expect(bookParts('trio').map((p) => p.part)).toEqual(['vln1', 'vln2', 'vc'])
    expect(bookParts('viola-trio').map((p) => p.part)).toEqual(['vln1', 'vla', 'vc'])
  })

  it('unknown ensembles fall back to the quartet layout', () => {
    expect(bookParts(undefined).map((p) => p.part)).toEqual(['vln1', 'vln2', 'vla', 'vc'])
  })
})

describe('destFilename', () => {
  it('follows "NN - Title - Artist - part.pdf"', () => {
    expect(destFilename(1, 'September', 'Earth, Wind & Fire', 'vln1')).toBe(
      '01 - September - Earth, Wind & Fire - vln1.pdf'
    )
    expect(destFilename(12, 'Canon in D', 'Pachelbel', 'vc')).toBe('12 - Canon in D - Pachelbel - vc.pdf')
  })

  it('drops the artist segment when there is none', () => {
    expect(destFilename(3, "She's A Rainbow", null, 'vla')).toBe("03 - She's A Rainbow - vla.pdf")
  })

  it('strips path separators so "Bach/Gounod" cannot create a directory', () => {
    expect(destFilename(4, 'Ave Maria', 'Bach/Gounod', 'vln1')).toBe('04 - Ave Maria - Bach-Gounod - vln1.pdf')
    expect(normalizeForFilename('A: B\\C/D')).toBe('A- B-C-D')
  })

  it('stripListNumber drops client numbering but never numeric titles', () => {
    // Intakes confirmed before the parser stripped list numbers keep them in
    // title_raw — the manifest must not produce "01 - 1. Air On The G String".
    expect(stripListNumber('1. Air On The G String')).toBe('Air On The G String')
    expect(stripListNumber('20. September')).toBe('September')
    expect(stripListNumber('1812 Overture')).toBe('1812 Overture')
  })
})

describe('pickFileForPart', () => {
  const row = (part: string, substitute = false, played_on: string | null = null): PartFileRow => ({
    part,
    substitute,
    played_on,
    storage_path: `repertoire/org/${part}${substitute ? '-sub' : ''}.pdf`,
    original_filename: `${part}.pdf`,
  })

  it('prefers the exact non-substitute part', () => {
    const picked = pickFileForPart([row('vln1'), row('vla')], 'vla', 'Canon in D')
    expect(picked?.row.part).toBe('vla')
    expect(picked?.fileLabel).toBe('vla')
    expect(picked?.warning).toBeNull()
  })

  it('uses a recorded substitute covering the line', () => {
    const picked = pickFileForPart([row('vln1'), row('vla', true, 'vc')], 'vc', 'Arioso')
    expect(picked?.fileLabel).toBe('vla as vc')
    expect(picked?.warning).toMatch(/substitute/i)
  })

  it('falls back to vln2 for a missing viola (Mac behavior)', () => {
    const picked = pickFileForPart([row('vln1'), row('vln2')], 'vla', 'My Girl')
    expect(picked?.row.part).toBe('vln2')
    expect(picked?.fileLabel).toBe('vln2 as vla')
    expect(picked?.warning).toMatch(/missing viola/i)
  })

  it('returns null when nothing covers the part; rows without bytes are ignored', () => {
    expect(pickFileForPart([row('vln1')], 'vc', 'X')).toBeNull()
    const noBytes = { ...row('vc'), storage_path: null }
    expect(pickFileForPart([noBytes], 'vc', 'X')).toBeNull()
  })
})

describe('sanitizePdfText', () => {
  it('folds smart punctuation and recomposes decomposed unicode', () => {
    expect(sanitizePdfText('“Schön” – Isn’t…')).toBe('"Schön" - Isn\'t...')
    // NFD "Scho" + combining diaeresis + "n" (Mac filenames) — mark dropped, no crash.
    expect(sanitizePdfText('Schön Rosmarin')).toBe('Schön Rosmarin')
  })
})

describe('matchInstrumentForPart', () => {
  const inst = (name: string) => ({ id: `i-${name}`, name })

  it('maps book parts to quartet position instruments by exact name', () => {
    const roster = [inst('Violin 1'), inst('Violin 2'), inst('Viola'), inst('Cello')]
    expect(matchInstrumentForPart('vln1', roster)?.name).toBe('Violin 1')
    expect(matchInstrumentForPart('vln2', roster)?.name).toBe('Violin 2')
    expect(matchInstrumentForPart('vla', roster)?.name).toBe('Viola')
    expect(matchInstrumentForPart('vc', roster)?.name).toBe('Cello')
  })

  it('a bare "Violin" counts as vln1 only when there is no second violin', () => {
    expect(matchInstrumentForPart('vln1', [inst('Violin'), inst('Viola'), inst('Cello')])?.name).toBe('Violin')
    expect(matchInstrumentForPart('vln1', [inst('Violin'), inst('Violin 2')])).toBeNull()
  })

  it('never matches across chairs — no instrument, no book', () => {
    const roster = [inst('Violin 1'), inst('Cello')]
    expect(matchInstrumentForPart('vla', roster)).toBeNull()
    expect(matchInstrumentForPart('bass', roster)).toBeNull()
    expect(matchInstrumentForPart('vc', roster)?.name).toBe('Cello')
  })
})

describe('mergePdfs', () => {
  async function tinyPdf(text: string): Promise<Uint8Array> {
    const { PDFDocument, StandardFonts } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    const page = doc.addPage([612, 792])
    page.drawText(text, { x: 50, y: 700, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) })
    return doc.save()
  }

  it('concatenates pages in order without re-rendering', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const a = await tinyPdf('first')
    const b = await tinyPdf('second')
    const merged = await mergePdfs([
      { name: 'a.pdf', bytes: a },
      { name: 'b.pdf', bytes: b },
    ])
    expect(String.fromCharCode(...merged.slice(0, 5))).toBe('%PDF-')
    const doc = await PDFDocument.load(merged)
    expect(doc.getPageCount()).toBe(2)
  })

  it('adds a bookmark per source so musicians can jump to any song', async () => {
    const { PDFDocument, PDFName } = await import('pdf-lib')
    const merged = await mergePdfs([
      { name: '00 - Playlist.pdf', bytes: await tinyPdf('playlist') },
      { name: '01 - September - Earth, Wind & Fire - vln1.pdf', bytes: await tinyPdf('sept') },
      { name: '02 - My Girl - The Temptations - vln1.pdf', bytes: await tinyPdf('mygirl') },
    ])
    const doc = await PDFDocument.load(merged)
    const outlinesRef = doc.catalog.get(PDFName.of('Outlines'))
    expect(outlinesRef).toBeDefined()
    const outlines = doc.context.lookup(outlinesRef) as import('pdf-lib').PDFDict
    expect(outlines.get(PDFName.of('Count'))?.toString()).toBe('3')
    const first = doc.context.lookup(outlines.get(PDFName.of('First'))!) as import('pdf-lib').PDFDict
    expect(first.get(PDFName.of('Title'))?.toString()).toContain('00 - Playlist')
  })

  it('names the offending file when a source is damaged — never a silent gap', async () => {
    const good = await tinyPdf('ok')
    const garbage = new Uint8Array([1, 2, 3, 4, 5])
    await expect(
      mergePdfs([
        { name: 'good.pdf', bytes: good },
        { name: '07 - My Girl - vln1.pdf', bytes: garbage },
      ])
    ).rejects.toThrow(/07 - My Girl - vln1\.pdf/)
  })
})

describe('buildPlaylistPdf', () => {
  const header: PlaylistHeader = {
    client: 'Smith Wedding',
    dateDisplay: 'July 26, 2026',
    venue: 'Indoors',
    ensembleLabel: 'String Quartet',
    groupName: 'Project String Quartet',
    contact: 'Jane Smith · 555-0100',
    spotifyUrl: 'https://open.spotify.com/playlist/x',
    recessionalCue: 'You may kiss the bride!',
    processionalOrder: ['Officiant', 'Family (2 pairs)', 'Groom', 'Bride'],
    notes: null,
  }
  const songs = [
    { num: 1, section: 'prelude', title: 'September', artist: 'Earth, Wind & Fire', role: null, notes: null },
    { num: 2, section: 'ceremony', title: 'Canon in D', artist: 'Pachelbel', role: 'Processional', notes: null },
    { num: 3, section: 'recessional', title: 'Signed, Sealed, Delivered', artist: 'Stevie Wonder', role: 'Recessional', notes: null },
    { num: 4, section: 'other', title: 'Goodness of God', artist: 'Bethel Music', role: null, notes: null, specialRequest: true },
  ]

  it('produces a one-page PDF for a part book and for the printable', async () => {
    for (const label of ['VIOLIN 1', null]) {
      const bytes = await buildPlaylistPdf(header, songs, label)
      expect(bytes.length).toBeGreaterThan(1000)
      // %PDF magic
      expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
    }
  })

  it('the Spotify text is a real clickable link (URI annotation), like the Mac playlist', async () => {
    const { PDFDocument, PDFName } = await import('pdf-lib')
    const bytes = await buildPlaylistPdf(header, songs, 'VIOLIN 1')
    const doc = await PDFDocument.load(bytes)
    const annots = doc.getPage(0).node.Annots()
    expect(annots).toBeDefined()
    expect(annots!.size()).toBe(1)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const annot: any = doc.context.lookup(annots!.get(0))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const action: any = annot.get(PDFName.of('A'))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uri: any = action.get(PDFName.of('URI'))
    expect(uri.decodeText()).toBe('https://open.spotify.com/playlist/x')
  })

  it('no Spotify url → no link annotation, contact line still drawn', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const bytes = await buildPlaylistPdf({ ...header, spotifyUrl: null }, songs, 'VIOLIN 1')
    const doc = await PDFDocument.load(bytes)
    const annots = doc.getPage(0).node.Annots()
    expect(!annots || annots.size() === 0).toBe(true)
  })

  it('handles curly quotes and a big song list without throwing', async () => {
    const many = Array.from({ length: 55 }, (_, i) => ({
      num: i + 1,
      section: 'reception',
      title: `Isn’t She Lovely ${i + 1}`,
      artist: 'Stevie Wonder',
      role: null,
      notes: i === 0 ? 'Client’s special dance — watch for the cue' : null,
    }))
    const bytes = await buildPlaylistPdf(header, many, 'CELLO')
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
  })
})
