/**
 * Wedding questionnaire parser (Book Builder Phase B, intake import).
 *
 * Faithful TypeScript port of the proven Python parser at
 *   "Music Compiler Local System/Music Compiler/web/parser.py"
 * (state machine, SECTION_PATTERNS ordered most-specific-first, SKIP_MARKERS,
 * smart-quote handling, "role- song" ceremony lines, expect_single_song,
 * _smart_title_case, "Title by Artist"/"Title - Artist" splitting).
 *
 * FOOLPROOF CONTRACT — the parser only PROPOSES structure; nothing is trusted
 * until the review screen. So misparses must be VISIBLE, never silent. Every
 * non-empty input line is accounted for exactly one way: parsed into a song,
 * consumed as recognized structure/metadata, matched a known SKIP_MARKER
 * (template boilerplate), or pushed to `warnings` with its line number. A line
 * the machine cannot classify is warned — never dropped. `parseQuestionnaireTraced`
 * exposes the per-line disposition so this invariant is testable.
 *
 * The output shape lines up 1:1 with the DB (intake_songs: section/position/
 * title_raw/artist_raw/role; intakes: contact_name/phone, venue_note, spotify_url,
 * processional_order, recessional_cue) and with the matcher's SongInput
 * (titleRaw/artistRaw). Matching against the repertoire happens in matcher.ts;
 * persistence in the API routes. This module is questionnaire → structure ONLY.
 *
 * Ported behaviour notes (see LESSONS_LEARNED_AND_PLANNING.md):
 *  - Apostrophe title-casing: smartTitleCase, not a naive per-word upper
 *    (Python's .title() yields "Wouldn'T"; we want "Wouldn't").
 *  - Ceremony-other "role- song" split only on word-space-dash-space-word.
 *  - "Select one" vs list sections via expectSingleSong.
 *  - Section pattern ORDER matters — specific before generic.
 *  - The recessional cue is captured VERBATIM (exact characters).
 *
 * Pure functions only — no I/O, deterministic.
 */

export interface ParsedSong {
  /**
   * Parser section key, faithful to the reference SECTION_PATTERNS:
   * prelude | ceremony | recessional | postlude | cocktail_hour | dinner |
   * reception | special (plus set_N / set_list for the plain song-list mode).
   * The save step maps these onto the narrower IntakeSection enum
   * (dinner/special/set_* → 'other') — kept granular here so nothing is lost
   * before the human reviews it.
   */
  section: string
  /** 0-based order within this song's section, in document order. */
  position: number
  /** Title as read from the questionnaire (smart-title-cased), before repertoire matching. */
  titleRaw: string
  /** Artist as written (never title-cased), or null when the line gave none. */
  artistRaw: string | null
  /** Ceremony role (e.g. "Processional", "Bride Entrance", "Unity Soil Pour") or null. */
  role: string | null
  /**
   * True when the line carried an inline special-request marker — the client
   * wrote "(*special request*)" (or a close variant) next to the song, meaning
   * "we know it's not in your library". The review screen prompts the admin to
   * mark the row as a special request; the parser only FLAGS, never decides.
   */
  specialRequest: boolean
}

export interface ParsedQuestionnaire {
  songs: ParsedSong[]
  processionalOrder: string[]
  /** Captured VERBATIM — the officiant's exact words; never reworded. */
  recessionalCue: string | null
  contactName: string | null
  contactPhone: string | null
  venueNote: string | null
  spotifyUrl: string | null
  /** Human-facing notices: lines the parser could not classify, one per line. */
  warnings: string[]
}

/** Per-line accounting so the "every line accounted for" invariant is testable. */
export type LineDisposition =
  | 'empty' // blank line
  | 'section' // section header
  | 'meta' // contact / venue / processional order / recessional cue / spotify / officiant
  | 'song' // parsed into a song
  | 'skip' // matched a known SKIP_MARKER / instruction / descriptive skip
  | 'warning' // could not classify → surfaced in warnings

export interface ParsedQuestionnaireTraced extends ParsedQuestionnaire {
  /** Parallel to rawText.trim().split('\n') (each trimmed) — one disposition per line. */
  lineDispositions: LineDisposition[]
}

interface SectionPattern {
  re: RegExp // NOT global; used with .test/.exec against lowercased text
  section: string
  role: string | null
}

// Section header patterns — ORDER MATTERS (more specific first). Each `re` is a
// direct translation of the Python raw string, compiled case-insensitive.
const SECTION_PATTERNS: SectionPattern[] = [
  { re: /prelude\s+requests?/i, section: 'prelude', role: null },
  { re: /processional\s*[-–—]?\s*(?:wedding|bridal)\s+party/i, section: 'ceremony', role: 'Processional' },
  { re: /processional\s*[-–—]?\s*bride/i, section: 'ceremony', role: 'Bride Entrance' },
  { re: /ceremony\s*[-–—]?\s*other/i, section: 'ceremony', role: null },
  { re: /recessional\s+exit\s+music/i, section: 'recessional', role: 'Recessional' },
  { re: /\bexit\s+music\b/i, section: 'recessional', role: 'Recessional' },
  { re: /postlude\s+requests?/i, section: 'postlude', role: null },
  { re: /cocktail\s+hour/i, section: 'cocktail_hour', role: null },
  { re: /dinner\s+music/i, section: 'dinner', role: null },
  { re: /dinner\s+requests?/i, section: 'dinner', role: null },
  { re: /reception\s+music/i, section: 'reception', role: null },
  { re: /reception\s+requests?/i, section: 'reception', role: null },
  { re: /special\s+requests?/i, section: 'special', role: null },
  { re: /bride.?s?\s+entrance/i, section: 'ceremony', role: 'Bride Entrance' },
  { re: /ceremony\s*[-–—/]?\s*special/i, section: 'special', role: null },
  { re: /special\s+moment/i, section: 'special', role: null },
  { re: /recessional\s*\/\s*postlude/i, section: 'recessional', role: null },
  { re: /parent[s'’]*\s+processional/i, section: 'ceremony', role: 'Parents Processional' },
  { re: /wedding\s+party\s+processional/i, section: 'ceremony', role: 'Processional' },
  { re: /bride[s'’]*\s+processional/i, section: 'ceremony', role: 'Bride Entrance' },
  { re: /groom[s'’]*\s+processional/i, section: 'ceremony', role: 'Groom Entrance' },
  { re: /\bprelude\b/i, section: 'prelude', role: null },
  { re: /\bprocessional\b/i, section: 'ceremony', role: 'Processional' },
  { re: /\brecessional\b/i, section: 'recessional', role: null },
  { re: /\bpostlude\b/i, section: 'postlude', role: null },
  { re: /\bcocktail\b/i, section: 'cocktail_hour', role: null },
  { re: /\bdinner\b/i, section: 'dinner', role: null },
  { re: /\breception\b/i, section: 'reception', role: null },
]

// Lines to skip (instructions, not song data). Lowercase substrings.
const SKIP_MARKERS = [
  'music selections', 'music list', 'when making your selections',
  'please use the following', 'ceremony information',
  'if you have booked', 'per hour of performance', 'we typically play',
  'good to have a few extra', 'please indicate this next',
  'special request that we do not',
  'if you are making a special request',
  'song list',
]

// Run-sheet lines to skip (not song data).
const RUNSHEET_SKIP_PREFIXES = ['cue:', 'note:', 'lead musician:']

// Instruction words that mark a non-song line inside a section.
const INSTRUCTION_MARKERS = ['select', 'please', 'example', 'optional']

// Match a Spotify link anywhere in a line.
const SPOTIFY_RE = /https?:\/\/open\.spotify\.com\/\S+/i

// Inline special-request marker on a SONG line: "(*special request*)",
// "(special request)", "*special request*". The phrase must be wrapped in
// parens or asterisks — a bare section header like "Special Requests" never
// matches. MUST be stripped before section detection: SECTION_PATTERNS contains
// /special\s+requests?/, so an unstripped marker turns the whole song line into
// a phantom section header and the song is silently swallowed (found in real
// usage: "Goodness of God - Bethel Music (*special request*)").
const SPECIAL_REQUEST_MARKER_RE =
  /\(\s*\*{0,2}\s*special\s+requests?\s*\*{0,2}\s*\)|\*{1,2}\s*special\s+requests?\s*\*{1,2}/gi

/** Strip inline special-request markers; report whether any were present. */
function extractSpecialRequestMarker(line: string): { line: string; special: boolean } {
  SPECIAL_REQUEST_MARKER_RE.lastIndex = 0
  if (!SPECIAL_REQUEST_MARKER_RE.test(line)) return { line, special: false }
  const stripped = line.replace(SPECIAL_REQUEST_MARKER_RE, ' ').replace(/\s{2,}/g, ' ').trim()
  return { line: stripped, special: true }
}

const sectionMatches = (lower: string): boolean => SECTION_PATTERNS.some((p) => p.re.test(lower))
const hasSkipMarker = (lower: string): boolean => SKIP_MARKERS.some((m) => lower.includes(m))

// --- small string helpers (ported) ------------------------------------------

/**
 * Strip surrounding quote characters but preserve internal apostrophes.
 * "Canon in D" – Pachelbel → Canon in D – Pachelbel, while Don't / Wouldn't keep
 * their internal apostrophe.
 */
function stripQuotes(text: string): string {
  text = text.trim()
  text = text.replace(/^['"‘’“”]+|['"‘’“”]+$/g, '').trim()
  text = text.replace(/['"‘’“”](?=\s)/g, '')
  text = text.replace(/(?<=\s)['"‘’“”]/g, '')
  return text.trim()
}

/**
 * Title-case that handles apostrophes correctly. Capitalizes the first LETTER of
 * each whitespace-delimited word and lowercases the rest, so "wouldn't" →
 * "Wouldn't" (not Python str.title()'s "Wouldn'T").
 */
function smartTitleCase(text: string): string {
  const capitalizeWord = (word: string): string => {
    if (!word) return word
    for (let i = 0; i < word.length; i++) {
      const ch = word[i]
      if (/[a-zA-Z]/.test(ch)) {
        return word.slice(0, i) + ch.toUpperCase() + word.slice(i + 1).toLowerCase()
      }
    }
    return word
  }
  return text.split(/\s+/).filter((w) => w.length > 0).map(capitalizeWord).join(' ')
}

/** Clean a parsed song title: drop a leading bullet, then smart-title-case. */
function cleanSongTitle(title: string): string {
  title = title.trim().replace(/^[-•*]\s*/, '').trim()
  if (title) title = smartTitleCase(title)
  return title
}

/**
 * Parse "Unity soil pour- Unchained melody" -> ["Unity Soil Pour", "Unchained
 * Melody"]. Splits on the FIRST dash separating role from song (maxsplit=1).
 */
function parseCeremonyOther(line: string): [string, string] {
  const m = /\s*[-–—]\s*/.exec(line)
  if (m) {
    const role = line.slice(0, m.index).trim()
    const song = line.slice(m.index + m[0].length).trim()
    if (role && song) return [smartTitleCase(role), smartTitleCase(song)]
  }
  return ['', smartTitleCase(line.trim())]
}

/** Extract (title, artist) from "Title - Artist" / "Title by Artist" / "Title". */
function extractTitleAndArtist(line: string): [string, string] {
  line = line.trim()
  if (!line) return ['', '']
  line = stripQuotes(line)
  if (!line) return ['', '']

  // 1. dash separator with at least one space on one side. Checked BEFORE "by":
  //    when both are present the dash is the deliberate separator and the "by"
  //    is part of the title ("Stand by Me - Ben E. King" — real misparse: the
  //    by-split yielded title "Stand", artist "Me - Ben E. King").
  const dashMatch = /\s*[-–—]\s+|\s+[-–—]\s*/.exec(line)
  if (dashMatch) {
    const title = line.slice(0, dashMatch.index).trim()
    const artist = line.slice(dashMatch.index + dashMatch[0].length).trim()
    if (title && artist) return [title, artist]
  }

  // 2. "by" separator, using the LAST occurrence ("Stand by me by Ben E. King").
  const byIdx = line.toLowerCase().lastIndexOf(' by ')
  if (byIdx > 0) {
    const title = line.slice(0, byIdx).trim()
    const artist = line.slice(byIdx + 4).trim()
    // Only split if the artist looks like a real name, not a title word.
    if (title && artist && (artist.split(/\s+/).length >= 2 || artist.length >= 4)) {
      return [title, artist]
    }
  }

  // 2.5 colon separator (show/musical: song title) — only for a short prefix.
  const colonMatch = /:\s*/.exec(line)
  if (colonMatch) {
    const before = line.slice(0, colonMatch.index).trim()
    const after = line.slice(colonMatch.index + colonMatch[0].length).trim()
    if (before && after && before.split(/\s+/).length <= 3 && /[a-zA-Z]/.test(before)) {
      return [after, before]
    }
  }

  // 3. no-space dash as a last resort (exactly one in the line).
  const noSpace = [...line.matchAll(/(?<=\w)[-–—](?=\w)/g)]
  if (noSpace.length === 1) {
    const idx = noSpace[0].index as number
    const title = line.slice(0, idx).trim()
    const artist = line.slice(idx + 1).trim()
    if (title && artist && title.length > 2) return [title, artist]
  }

  // 4. strip "from <article> ..." movie/show suffix (not an artist).
  const fromMatch = /\s+from\s+(?:the|a|an)\s+\w+\s+\w+/.exec(line.toLowerCase())
  if (fromMatch && fromMatch.index > 2) {
    return [line.slice(0, fromMatch.index).trim(), '']
  }

  return [line, '']
}

function stripSongPrefix(line: string): string {
  const m = /^song\s*\d*\s*:\s*/i.exec(line)
  return m ? line.slice(m[0].length).trim() : line
}

/**
 * Split a run-together numbered list ("1. Officiant2. Family (2 pairs)3. Groom")
 * into its items. Splits only where a 1-2 digit number + "."/")" + space + letter
 * begins (lookbehind stops mid-number splits like the "0." inside "20."); returns
 * the input untouched when it isn't a multi-item run.
 */
function splitNumberedRun(text: string): string[] {
  const pieces = text
    .split(/(?<!\d)(?=\d{1,2}[.)]\s+[A-Za-z])/)
    .map((s) => s.trim())
    .filter(Boolean)
  return pieces.length >= 2 ? pieces : [text]
}

// Numbered-list prefix on a song line ("4. Stand by Me", "20. September").
// Requires the trailing space so numeric TITLES ("1812 Overture") are safe.
// Real misparse: "20. September" searched the library for "20 september".
const NUMBERED_PREFIX_RE = /^\d{1,2}[.)]\s+/

// A non-answer where the questionnaire asked for a song ("N/a", "none", "TBD").
// These are answers, not songs — skip them instead of manufacturing a song row.
const NON_ANSWER_RE = /^[\s\-–—]*(n\/?a|n\.a\.?|none|no|tbd|to be determined|no preference|not sure)[\s.!]*$/i

// --- main questionnaire parser ------------------------------------------------

export function parseQuestionnaireTraced(rawText: string): ParsedQuestionnaireTraced {
  const lines = rawText.trim().split('\n').map((l) => l.trim())
  const disp: (LineDisposition | undefined)[] = new Array(lines.length).fill(undefined)

  const songs: ParsedSong[] = []
  const sectionCounts = new Map<string, number>()
  const processionalOrder: string[] = []
  const warnings: string[] = []
  let recessionalCue: string | null = null
  let contactName: string | null = null
  let contactPhone: string | null = null
  let venueNote: string | null = null
  let spotifyUrl: string | null = null
  let officiant: string | null = null // consumed for line-accounting; not persisted / not in output

  // `special` = the current line carried an inline special-request marker.
  const addSong = (section: string, titleRaw: string, artistRaw: string, role: string | null, special = false) => {
    const pos = sectionCounts.get(section) ?? 0
    songs.push({ section, position: pos, titleRaw, artistRaw: artistRaw || null, role, specialRequest: special })
    sectionCounts.set(section, pos + 1)
  }

  let currentSection: string | null = null
  let currentRole: string | null = null
  // Tracked for parity with the reference parser (set on "select one" / ceremony-
  // other / special headers, reset after an inline header song). The reference
  // never gates later lines on it, so neither do we — faithful port.
  let expectSingleSong = false
  let inWalkingOrder = false
  let foundFirstSection = false
  let i = 0

  while (i < lines.length) {
    // Strip any inline special-request marker FIRST — before section detection —
    // so "(*special request*)" on a song line can't hijack the section machine
    // (SECTION_PATTERNS matches "special request" anywhere in a line). The flag
    // rides along to addSong for whatever song this line yields.
    const { line, special: lineSpecial } = extractSpecialRequestMarker(lines[i])
    const lower = line.toLowerCase().trim()

    if (!line) {
      // A line that was ONLY the marker (nothing else on it) is boilerplate.
      disp[i] = lineSpecial ? 'skip' : 'empty'
      i += 1
      continue
    }

    // --- Spotify playlist URL (anywhere) ---
    if (spotifyUrl === null) {
      const sp = SPOTIFY_RE.exec(line)
      if (sp) { spotifyUrl = sp[0]; disp[i] = 'meta'; i += 1; continue }
    }

    // --- officiant (questionnaire format) ---
    if (lower.includes('officiant') && (lower.includes('name') || lower === 'officiant' || lower.replace(/^[-•*]\s*/, '').trim() === 'officiant')) {
      const parenM = /\(name\)/.exec(lower)
      if (parenM && parenM.index + parenM[0].length < line.length) {
        const val = line.slice(parenM.index + parenM[0].length).trim()
        if (val) { officiant = val; disp[i] = 'meta'; i += 1; continue }
      }
      let j = i + 1
      while (j < lines.length && !lines[j].trim()) j += 1
      if (j < lines.length && lines[j].trim()) {
        const val = lines[j].trim().replace(/^[-•*]\s*/, '').trim()
        if (!hasSkipMarker(val.toLowerCase())) { officiant = val; disp[j] = 'meta' }
      }
      disp[i] = 'meta'; i = j + 1; continue
    }

    // --- contact name ---
    if (lower.includes('contact person') && lower.includes('name') && !lower.includes('phone')) {
      const parenM = /\(name\)/.exec(lower)
      if (parenM && parenM.index + parenM[0].length < line.length) {
        const val = line.slice(parenM.index + parenM[0].length).trim()
        if (val) { contactName = val; disp[i] = 'meta'; i += 1; continue }
      }
      let j = i + 1
      while (j < lines.length && !lines[j].trim()) j += 1
      if (j < lines.length && lines[j].trim()) {
        const val = lines[j].trim().replace(/^[-•*]\s*/, '').trim()
        if (!hasSkipMarker(val.toLowerCase())) { contactName = val; disp[j] = 'meta' }
      }
      disp[i] = 'meta'; i = j + 1; continue
    }

    // --- contact phone ---
    if (lower.includes('contact person') && lower.includes('phone')) {
      const parenM = /\(phone\s*number\)/.exec(lower)
      if (parenM && parenM.index + parenM[0].length < line.length) {
        const val = line.slice(parenM.index + parenM[0].length).trim()
        if (val) { contactPhone = val; disp[i] = 'meta'; i += 1; continue }
      }
      let j = i + 1
      while (j < lines.length && !lines[j].trim()) j += 1
      if (j < lines.length && lines[j].trim()) {
        contactPhone = lines[j].trim().replace(/^[-•*]\s*/, '').trim()
        disp[j] = 'meta'
      }
      disp[i] = 'meta'; i = j + 1; continue
    }

    // --- venue (indoors/outdoors) ---
    if (lower.includes('indoors or outdoors')) {
      const qIdx = line.lastIndexOf('?')
      if (qIdx >= 0 && qIdx < line.length - 1) {
        const val = line.slice(qIdx + 1).trim()
        if (['indoors', 'outdoors', 'indoor', 'outdoor'].includes(val.toLowerCase())) {
          venueNote = smartTitleCase(val); disp[i] = 'meta'; i += 1; continue
        }
      }
      let j = i + 1
      while (j < lines.length && !lines[j].trim()) j += 1
      if (j < lines.length) {
        const val = lines[j].trim().replace(/^[-•*]\s*/, '').trim()
        if (['indoors', 'outdoors', 'indoor', 'outdoor'].includes(val.toLowerCase())) {
          venueNote = smartTitleCase(val); disp[j] = 'meta'
        }
      }
      disp[i] = 'meta'; i = j + 1; continue
    }

    // --- processional walking order ---
    if (lower.includes('processional walking order')) {
      const exampleIdx = lower.indexOf('example')
      // 17hats variant (real questionnaire, 2026-07): the example rides INLINE on
      // the label line ("… - Example: 1. Officiant 2. Groom …"). The numbered
      // lines that follow are then the client's REAL answer — they must be
      // collected, not skipped as example items.
      const inlineExample = exampleIdx >= 0 && /\d{1,2}\s*[.)]/.test(lower.slice(exampleIdx))
      const hasExample = exampleIdx >= 0 && !inlineExample
      let j = i + 1
      const orderLines: string[] = []

      if (hasExample) {
        // Skip the numbered EXAMPLE items, then collect the client's real answer.
        // The example and the answer are often BOTH numbered lists back-to-back
        // (example 1..5, then the real order RESTARTS at 1). A number that does not
        // increase (a reset, e.g. 5 → 1) marks where the example ends and the
        // client's actual answer begins — stop skipping there. (An example whose
        // last item has the response run onto it is still handled via the concat.)
        let lastNumberedRemainder = ''
        let prevNum = 0
        while (j < lines.length) {
          const candidate = lines[j].trim().replace(/^[-•*]\s*/, '').trim()
          if (!candidate) { disp[j] = 'empty'; j += 1; continue }
          const numM = /^(\d+)\.\s*(.*)/.exec(candidate)
          if (numM) {
            const num = parseInt(numM[1], 10)
            if (prevNum > 0 && num <= prevNum) break // numbering reset → real answer starts here
            prevNum = num
            const exampleText = numM[2].trim()
            const concat = /[a-z]([A-Z])/.exec(exampleText)
            if (concat) lastNumberedRemainder = exampleText.slice(concat.index + 1)
            disp[j] = 'meta'; j += 1; continue
          }
          break
        }
        if (lastNumberedRemainder) orderLines.push(lastNumberedRemainder.trim())
        while (j < lines.length) {
          const candidate = lines[j].trim().replace(/^[-•*]\s*/, '').trim()
          if (!candidate) { disp[j] = 'empty'; j += 1; continue }
          const lowerC = candidate.toLowerCase()
          if (sectionMatches(lowerC)) break
          if (hasSkipMarker(lowerC)) break
          // Strip a leading "N." so items read "Officiant", not "1. Officiant".
          const numbered = /^\d+[.)]\s*(.*)/.exec(candidate)
          orderLines.push((numbered ? numbered[1] : candidate).trim())
          disp[j] = 'meta'; j += 1
        }
      } else {
        while (j < lines.length) {
          const candidate = lines[j].trim()
          if (!candidate) { disp[j] = 'empty'; j += 1; continue }
          const lowerC = candidate.toLowerCase()
          if (sectionMatches(lowerC)) break
          if (hasSkipMarker(lowerC)) break
          // A line may carry several run-together items ("1. Officiant2. Family").
          for (const piece of splitNumberedRun(candidate)) {
            const numbered = /^\d+[.)]\s*(.*)/.exec(piece)
            const item = (numbered ? numbered[1] : piece).trim()
            if (item) orderLines.push(item)
          }
          disp[j] = 'meta'; j += 1
        }
      }

      for (const o of orderLines) processionalOrder.push(o)
      disp[i] = 'meta'; i = j; continue
    }

    // --- recessional cue (VERBATIM) ---
    if (lower.includes('last words the officiant') || lower.includes('before we begin the recessional')) {
      const qIdx = line.lastIndexOf('?')
      if (qIdx >= 0 && qIdx < line.length - 1) {
        const val = line.slice(qIdx + 1).trim()
        if (val) { recessionalCue = val; disp[i] = 'meta'; i += 1; continue }
      }
      let j = i + 1
      while (j < lines.length && !lines[j].trim()) j += 1
      if (j < lines.length && lines[j].trim()) {
        recessionalCue = lines[j].trim().replace(/^[-•*]\s*/, '').trim()
        disp[j] = 'meta'
      }
      disp[i] = 'meta'; i = j + 1; continue
    }

    // --- "Walking order:" (run sheet) ---
    if (/^walking\s+order\s*:/.test(lower)) {
      inWalkingOrder = true; disp[i] = 'meta'; i += 1; continue
    }

    // --- collect walking order lines (run sheet) ---
    if (inWalkingOrder) {
      const isSection = sectionMatches(lower)
      const isSongPrefix = /^song\s*\d*\s*:/.test(lower)
      if (isSection || isSongPrefix) {
        inWalkingOrder = false
        // Do NOT advance — fall through to section/song detection below.
      } else {
        const entry = line.trim().replace(/^[\d-]+\.\s*/, '').trim()
        if (entry) processionalOrder.push(entry)
        disp[i] = 'meta'; i += 1; continue
      }
    }

    // --- officiant from "Officiant: Name" (run sheet inline) ---
    if (lower.startsWith('officiant:') && !officiant) {
      const offName = line.replace(/^officiant:\s*/i, '').trim()
      if (offName) officiant = offName
      disp[i] = 'meta'; i += 1; continue
    }

    // --- run-sheet instruction lines (CUE / NOTE / LEAD MUSICIAN). Must precede
    // section detection: these may mention "recessional" etc. in their text. ---
    if (foundFirstSection && RUNSHEET_SKIP_PREFIXES.some((p) => lower.startsWith(p))) {
      if (lower.startsWith('cue:') && currentSection === 'recessional') {
        const cueText = line.replace(/^cue:\s*/i, '').trim()
        if (cueText && !recessionalCue) recessionalCue = cueText
        disp[i] = 'meta'
      } else {
        disp[i] = 'skip'
      }
      i += 1; continue
    }

    // --- section headers ---
    const strippedForSection = lower.replace(/^\d+\.\s*/, '')
    let matchedSection = false
    for (const { re, section, role } of SECTION_PATTERNS) {
      if (re.test(strippedForSection) || re.test(lower)) {
        currentSection = section
        currentRole = role
        expectSingleSong = lower.includes('select one') || (section === 'ceremony' && role === null) || section === 'special'
        matchedSection = true
        foundFirstSection = true
        inWalkingOrder = false

        // "Song:" on the same line as the header.
        const songOnLine = /song\s*\d*\s*:\s*(.+)/i.exec(line)
        if (songOnLine) {
          const rawSong = songOnLine[1].trim().replace(/\s*\((?:CONFIRMED|confirmed)\)\s*$/, '')
          const [st0, sa] = extractTitleAndArtist(rawSong)
          if (st0) {
            addSong(currentSection, cleanSongTitle(st0), sa, currentRole, lineSpecial)
            if (expectSingleSong) expectSingleSong = false
          }
        } else {
          // Response text on the same line as the header (no line break).
          let rawSong: string | null = null

          const instrParen = /\((?:select|please|optional)[^)]*\)/i.exec(line)
          if (instrParen && instrParen.index + instrParen[0].length < line.length) {
            let after = line.slice(instrParen.index + instrParen[0].length).trim()
            if (after && after.toLowerCase() !== 'none') {
              const noteM = /\(([^)]+)\)\s*$/.exec(after)
              if (noteM) after = after.slice(0, noteM.index).trim()
              rawSong = after
            }
          }
          // Text after "section header + colon/dash separator".
          if (!rawSong) {
            const mHeader = re.exec(lower)
            if (mHeader) {
              const after = line.slice(mHeader.index + mHeader[0].length)
              const sepM = /^\s*[:\-–—]\s*(.+)/.exec(after)
              if (sepM) {
                const songText = stripQuotes(sepM[1].trim())
                if (songText && songText.length >= 2 && songText.length < 200 && !hasSkipMarker(songText.toLowerCase())) {
                  rawSong = songText
                }
              }
            }
          }
          // Text after the last "period+uppercase" (no space break).
          if (!rawSong) {
            const periodMatches = [...line.matchAll(/\.([A-Z])/g)]
            if (periodMatches.length) {
              const last = periodMatches[periodMatches.length - 1]
              const after = line.slice((last.index as number) + 1).trim()
              if (after && after.length >= 2 && after.length < 120) rawSong = after
            }
          }
          if (rawSong) {
            const [st0, sa] = extractTitleAndArtist(rawSong)
            if (st0) {
              addSong(currentSection, cleanSongTitle(st0), sa, currentRole, lineSpecial)
              if (expectSingleSong) expectSingleSong = false
            }
          }
        }
        break
      }
    }

    if (matchedSection) { disp[i] = 'section'; i += 1; continue }

    // --- lines before the first section: run-sheet header metadata ---
    if (!foundFirstSection) {
      if (hasSkipMarker(lower)) { disp[i] = 'skip'; i += 1; continue }
      // Inline run-sheet header extraction (contact / officiant / venue).
      const contactM = /contact.*?:\s*(.+)/i.exec(line)
      if (contactM && lower.includes('contact')) {
        const contactStr = contactM[1].trim()
        const phoneM = /[-–—]\s*([\d().\-\s+]+)$/.exec(contactStr)
        if (phoneM) {
          if (!contactName) contactName = contactStr.slice(0, phoneM.index).trim()
          if (!contactPhone) contactPhone = phoneM[1].trim()
        } else if (!contactName) {
          contactName = contactStr
        }
        disp[i] = 'meta'; i += 1; continue
      }
      const officiantM = /^officiant\s*:\s*(.+)/i.exec(line)
      if (officiantM) { if (!officiant) officiant = officiantM[1].trim(); disp[i] = 'meta'; i += 1; continue }
      if (line.includes('|') && !venueNote) {
        const parts = line.split('|')
        if (parts.length >= 2) {
          const candidate = parts[parts.length - 1].trim()
          if (!/\b(trio|quartet|duo|solo)\b/i.test(candidate)) {
            venueNote = candidate; disp[i] = 'meta'; i += 1; continue
          }
        }
      }
      // Unrecognized preamble — surface it rather than swallow it silently.
      warnings.push(`Line ${i + 1}: unrecognized text before the first section: "${line}"`)
      disp[i] = 'warning'; i += 1; continue
    }

    // --- known non-song instruction lines ---
    if (hasSkipMarker(lower)) {
      // A song may be appended after instruction text ("...on the list.I Gotta Feeling").
      if (currentSection) {
        const periodMatches = [...line.matchAll(/\.([A-Z])/g)]
        if (periodMatches.length) {
          const last = periodMatches[periodMatches.length - 1]
          const after = line.slice((last.index as number) + 1).trim()
          if (after && after.length >= 2 && after.length < 120) {
            const [st0, sa] = extractTitleAndArtist(after)
            if (st0) {
              addSong(currentSection, cleanSongTitle(st0), sa, currentRole, lineSpecial)
              disp[i] = 'song'; i += 1; continue
            }
          }
        }
      }
      disp[i] = 'skip'; i += 1; continue
    }

    // --- prompt/label lines ---
    if (lower.startsWith('please select') || lower.startsWith('if you')) { disp[i] = 'skip'; i += 1; continue }

    // --- descriptive lines ("Antonia escorted by ...") ---
    if (currentSection && /^\w+\s+escorted\s+by\b/i.test(line)) { disp[i] = 'skip'; i += 1; continue }

    // --- song lines ---
    if (currentSection) {
      let songTitle: string | null = null
      let songArtist = ''
      let songRole = currentRole

      let songLine = stripSongPrefix(line)
      songLine = songLine.replace(NUMBERED_PREFIX_RE, '')
      songLine = songLine.replace(/\s*\((?:CONFIRMED|confirmed)\)\s*$/, '')

      // "N/a" / "none" / "TBD" answers are boilerplate, never songs.
      if (NON_ANSWER_RE.test(songLine)) { disp[i] = 'skip'; i += 1; continue }

      const isInstruction = INSTRUCTION_MARKERS.some((m) => lower.includes(m))

      if (songLine.startsWith('-') || songLine.startsWith('•') || songLine.startsWith('*')) {
        const rawTitle = songLine.replace(/^[-•*]\s*/, '').trim()
        if (rawTitle) {
          const [t, a] = extractTitleAndArtist(rawTitle)
          songArtist = a
          songTitle = t ? cleanSongTitle(t) : null
        }
      } else if (!isInstruction) {
        if (currentSection === 'ceremony' && currentRole === null) {
          if (/\w\s*[-–—]\s*\w/.test(songLine) && !songLine.startsWith('-')) {
            const [rolePart, titlePart] = parseCeremonyOther(songLine)
            songRole = rolePart
            songTitle = titlePart
          } else {
            const [t, a] = extractTitleAndArtist(songLine)
            songArtist = a
            songTitle = t ? cleanSongTitle(t) : null
          }
        } else {
          const [t, a] = extractTitleAndArtist(songLine)
          songArtist = a
          songTitle = t ? cleanSongTitle(t) : null
        }
      }

      if (songTitle) {
        addSong(currentSection, songTitle, songArtist, songRole, lineSpecial)
        // Reset a custom ceremony role after use.
        if (currentSection === 'ceremony' && songRole && !['Processional', 'Bride Entrance', 'Recessional'].includes(songRole)) {
          currentRole = null
        }
        disp[i] = 'song'
      } else if (isInstruction) {
        // A recognized instruction line inside a section (e.g. "(select one)").
        disp[i] = 'skip'
      } else {
        warnings.push(`Line ${i + 1}: could not parse a song from: "${line}"`)
        disp[i] = 'warning'
      }
      i += 1
      continue
    }

    // --- Foolproof net: never drop a line silently (unreachable in practice,
    // since currentSection is set once a section header is found). ---
    warnings.push(`Line ${i + 1}: could not classify: "${line}"`)
    disp[i] = 'warning'
    i += 1
  }

  return {
    songs,
    processionalOrder,
    recessionalCue,
    contactName,
    contactPhone,
    venueNote,
    spotifyUrl,
    warnings,
    lineDispositions: disp.map((d) => d ?? 'empty'),
  }
}

/**
 * Parse raw wedding-questionnaire text into structured, review-ready gig data.
 * Public entry point — same result as parseQuestionnaireTraced without the trace.
 */
export function parseQuestionnaire(rawText: string): ParsedQuestionnaire {
  const { lineDispositions: _drop, ...result } = parseQuestionnaireTraced(rawText)
  void _drop
  return result
}

// --- plain song-list mode -----------------------------------------------------

// Strong signals that text is a wedding questionnaire, not a plain song list.
const QUESTIONNAIRE_SIGNALS = [
  /officiant/i,
  /cue\s+musicians/i,
  /indoors\s+or\s+outdoors/i,
  /walking\s+order/i,
  /prelude\s+requests?/i,
  /postlude\s+requests?/i,
  /recessional\s+exit\s+music/i,
  /bride.?s?\s+entrance/i,
  /last\s+words\s+the\s+officiant/i,
  /ceremony\s+information/i,
  /select\s+one\s+piece/i,
  /select\s+up\s+to\s+\d+\s+pieces/i,
]

/** Heuristic: does this text look like a wedding questionnaire vs a plain set list? */
export function looksLikeQuestionnaire(rawText: string): boolean {
  const hits = QUESTIONNAIRE_SIGNALS.reduce((n, sig) => (sig.test(rawText) ? n + 1 : n), 0)
  return hits >= 2
}

function emptyResult(): ParsedQuestionnaire {
  return {
    songs: [],
    processionalOrder: [],
    recessionalCue: null,
    contactName: null,
    contactPhone: null,
    venueNote: null,
    spotifyUrl: null,
    warnings: [],
  }
}

/**
 * Parse a plain song list (one song per line; blank / "---" / "Set N:" break
 * sets). Returns the same shape as the questionnaire parser; section is set_N,
 * or set_list when there is only one set. Foolproof: a line that yields no title
 * is warned, never dropped.
 */
export function parseSongList(rawText: string): ParsedQuestionnaire {
  const result = emptyResult()
  const sectionCounts = new Map<string, number>()
  const lines = rawText.trim().split('\n')
  let currentSet = 1
  let currentSetHasSongs = false

  const push = (section: string, titleRaw: string, artistRaw: string, special = false) => {
    const pos = sectionCounts.get(section) ?? 0
    result.songs.push({ section, position: pos, titleRaw, artistRaw: artistRaw || null, role: null, specialRequest: special })
    sectionCounts.set(section, pos + 1)
  }

  lines.forEach((raw, idx) => {
    const marker = extractSpecialRequestMarker(raw.trim())
    let line = marker.line
    if (!line) {
      if (marker.special) return // marker-only line: boilerplate, not a set break
      if (currentSetHasSongs) { currentSet += 1; currentSetHasSongs = false }
      return
    }
    if (/^-{3,}$/.test(line)) {
      if (currentSetHasSongs) { currentSet += 1; currentSetHasSongs = false }
      return
    }
    const setMatch = /^set\s*(\d+)\s*:?\s*(.*)$/i.exec(line)
    if (setMatch) {
      currentSet = parseInt(setMatch[1], 10)
      currentSetHasSongs = false
      const remainder = setMatch[2].trim()
      if (!remainder) return
      line = remainder
    }
    const [title, artist] = extractTitleAndArtist(line)
    if (title) {
      push(`set_${currentSet}`, cleanSongTitle(title), artist, marker.special)
      currentSetHasSongs = true
    } else {
      result.warnings.push(`Line ${idx + 1}: could not parse a song from: "${raw.trim()}"`)
    }
  })

  // Single set → cleaner "set_list" label.
  const usedSections = new Set(result.songs.map((s) => s.section))
  if (usedSections.size === 1) {
    for (const s of result.songs) s.section = 'set_list'
  }
  return result
}

/**
 * Entry point for the intake route: pick the right mode. An admin pastes a
 * 17hats questionnaire, but if a plain song list is pasted we still parse it
 * (rather than mangle it through the questionnaire machine).
 */
export function parseIntake(rawText: string): ParsedQuestionnaire {
  if (!rawText || !rawText.trim()) {
    return { ...emptyResult(), warnings: ['No text was provided to parse.'] }
  }
  const result = looksLikeQuestionnaire(rawText) ? parseQuestionnaire(rawText) : parseSongList(rawText)
  if (result.songs.length === 0) {
    result.warnings.push('No songs were detected. Check the pasted text and edit manually if needed.')
  }
  return result
}
