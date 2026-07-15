/**
 * NORMALIZATION PARITY — our normTitle() (src/lib/intake/normalize.ts) vs the
 * proven Mac system's `normalize_for_search` (gig_compiler/utils.py).
 *
 * WHY THIS EXISTS
 * ---------------
 * Phase A's indexer (scripts/repertoire-index.js) computed every repertoire
 * `norm_title` with OUR normTitle, and the Phase B matcher normalizes incoming
 * questionnaire titles with the SAME normTitle. So for a title spelled the
 * identical way on both sides, folding is symmetric and matching is exact —
 * the reference-vs-ours differences below CANNOT break that internal case.
 *
 * The real exposure is asymmetric: a CLIENT types a title whose spelling
 * differs from the library's stored spelling along an axis the Python reference
 * folds but ours does NOT. This test ports `normalize_for_search` faithfully as
 * the reference, runs a 220-title corpus of REAL library titles (plus realistic
 * client-typed variants) through both, and proves that EVERY divergence is
 * explained by one of a small, documented set of fold-differences. The four
 * "Python folds, we don't" axes are asserted as KNOWN GAPS (see the Improve
 * list in scripts/repertoire-out/parity-report.md), so if normalize.ts is later
 * hardened, the corresponding assertion flips and forces this doc to update.
 *
 * The corpus was extracted from scripts/repertoire-out/index.json (the Phase A
 * index) — curly-quote/ampersand/slash candidates, periods, `#`/`No.`/`Nr.`,
 * `Mvt`, accents, and "Can't"-style apostrophes — then de-duplicated.
 */
import { describe, it, expect } from 'vitest'
import { normTitle } from '../normalize'

// ---------------------------------------------------------------------------
// Faithful inline replica of gig_compiler/utils.py :: normalize_for_search.
// Ported step-for-step (same order, same regexes) so it is the REFERENCE the
// old system actually used. Do not "improve" it — it must mirror the Python.
// ---------------------------------------------------------------------------
export function normalizeForSearch(text: string): string {
  // curly single/double quotes -> straight
  text = text.replace(/‘/g, "'").replace(/’/g, "'")
  text = text.replace(/“/g, '"').replace(/”/g, '"')
  // fold accents to ASCII base letters via NFKD + drop combining marks
  text = text.normalize('NFKD')
  text = [...text].filter((c) => !/\p{M}/u.test(c)).join('')
  text = text.toLowerCase()
  // & -> "and"
  text = text.replace(/&/g, ' and ')
  // unify numbering: #5, no. 5, no.5, nr 5, number 5 -> "no 5"
  text = text.replace(/(?:#|\bno\.?|\bnr\.?|\bnumber)\s*(\d)/g, 'no $1')
  // unify movement abbreviations: mvt / movt -> movement
  text = text.replace(/\bm(?:o)?vt\b/g, 'movement')
  // treat / as a word separator
  text = text.replace(/\//g, ' ')
  // drop sentence punctuation, then stray periods (apostrophes/dashes/parens kept)
  text = text.replace(/[,?!;:"]/g, ' ')
  text = text.replace(/\./g, ' ')
  // collapse whitespace
  text = text.trim().split(/\s+/).join(' ')
  return text
}

// ---------------------------------------------------------------------------
// Corpus: 220 real titles (from index.json) + realistic client-typed variants.
// ---------------------------------------------------------------------------
const CORPUS: string[] = [
  "00 Jumpin' Jumpin'",
  "Ain't No Mountain High Enough",
  'Andante from Piano Concerto No. 21',
  'Are Ye Able, Said the Master - Earl Marlatt',
  'Are Ye Able, Said the Master - Earl Marlatt - Harry Mason',
  "Baby, It's Cold Outside",
  'Bach.Gounod',
  'Bills, Bills, Bills',
  'Birthday Var.',
  'Brandenburg #2',
  'Brandenburg 3 Mvt 1',
  'Brandenburg Concerto No. 2',
  'Brandenburg Concerto No. 3',
  'Brandenburg Concerto No. 3 Mvt 1',
  'Brandenburg Concerto No. 3 Mvt 3',
  'Brandenburg No. 3',
  'Bring a Torch, Jeanette, Isabella',
  "Can't Buy Me Love",
  "Can't Help Falling in Love",
  "Can't Stop",
  'Cantata No. 140 (Wachet auf)',
  "Can't Take My Eyes Off You",
  'Carmen Aragonaise',
  'Concerto in Eb Mvt 3',
  "Don't Start Now",
  "Don't Stop Believin'",
  "Don't Worry Be Happy",
  "Don't Stop Me Now",
  'DvoraÌ€k Waltz',
  'Eine Kleine Nachtmusik Mvt 2',
  'Eine Kleine Nachtmusik Mvt 4',
  'Eine kleine Nachtmusik, Mvt. 3',
  "Entr'acte III",
  "Ev'ry Time We Say Goodbye",
  "Everybody (Backstreet's Back)",
  'FaureÌ Pavane',
  'Forever and Ever, Amen',
  "Gabriel's Oboe",
  "Golliwog's Cakewalk",
  "Haven't Met You Yet",
  'Hungarian #1',
  'Hungarian #10',
  'Hungarian #11',
  'Hungarian #2',
  'Hungarian #21',
  'Hungarian #3',
  'Hungarian #4',
  'Hungarian #5',
  'Hungarian #6',
  'Hungarian #7',
  'Hungarian Dance No. 1',
  'Hungarian Dance No. 10',
  'Hungarian Dance No. 11',
  'Hungarian Dance No. 2',
  'Hungarian Dance No. 21',
  'Hungarian Dance No. 3',
  'Hungarian Dance No. 4',
  'Hungarian Dance No. 5',
  'Hungarian Dance No. 6',
  'Hungarian Dance No. 7',
  "I Don't Want To Miss A Thing",
  "I've Got You Under My Skin",
  "If I Ain't Got You",
  "Isn't She Lovely",
  "It's Time",
  "I'll Make Love To You",
  "I'm Yours",
  "I've Got a Woman",
  "Jesu, Joy of Man's Desiring",
  "Jumpin' Jumpin'",
  'kupdf.net_the-swan-for-string- -score-and-parts',
  "L'Hymne a l'Amour",
  "L'Hymne A L'Amour",
  "La Femme d'Argent",
  "La Femme D'Argent",
  "Let's Dance",
  "Let's Stay Together",
  "Livin' On A Prayer",
  "Lo, How a Rose E'er Blooming",
  'Lo, How a Rose',
  "Lover's Carvings",
  "Maybe I'm Amazed",
  'Mendelssohn_-_String_Quartet_No._2',
  "Mia and Sebastian's Theme",
  'Mozart_-_String_Quartet_No.17',
  'Mozart_-_String_Quartet_No.17_Viola',
  'Mozart_-_String_Quartet_No.17_ViolinI -Hunt',
  'Mozart_-_String_Quartet_No.17_ViolinII -Hunt',
  'Mrs. Robinson',
  "Musetta's Waltz (La Boheme)",
  'New York, New York',
  'Non, Je Ne Regrette Rien',
  "Nothing's Gonna Stop Us Now",
  'O, Little Town of Bethlehem',
  'One Hand, One Heart',
  'Prelude No. 2',
  "Schindler's List Theme",
  'SchoÌˆn Rosmarin',
  "She's a Rainbow",
  "Signed, Sealed, Delivered, I'm Yours",
  "Siman Tov u'Mazel Tov",
  'St. Louis Blues',
  'Sunrise, Sunset',
  "Sweet Child O' Mine",
  'Tales from the Vienna Woods Op. 325',
  "Today I Met The Boy I'm Gonna Marry",
  "What's Going On",
  "What's New",
  "Wouldn't It Be Nice",
  "You'd Be so Nice to Come Home To",
  "You're A Mean One, Mr. Grinch",
  "You're All I Need To Get By",
  "You're So Cool",
  "You're Still The One",
  "You've Got The Love",
  "You'll Never Leave Harlan Alive",
  'Prelude No. 1 in C Major',
  'Eine Kleine Nachtmusik Mvt 1',
  "You've Got The Love Florence + The Machine",
  "As Long As I've Got You",
  'Aubade Mvt 1',
  "Can't Help Falling In Love",
  "Can't Take My Eyes Off You Violin Cello",
  'Gymnopedie No 1',
  "If I Ain't Got You Violin Cello",
  "Jesu Joy of Man's Desiring Viola",
  '7 by Beatles',
  'All I Ask of You from Phantom',
  'Allegretto in the Style of Boccherini',
  'Anna_s Minuet',
  'Ashokan',
  'Bad Habits',
  'Bell Carol',
  'Billie Jean',
  'Bohemian Rhapsody',
  'Calliope Rag',
  'Carry You Home',
  'Che Gelida',
  'Cinema Paradiso Love Theme',
  'Concerto Grosso',
  'Dance The Night',
  'Dearly Beloved from Kingdom Hearts',
  'Down',
  'El Choclo',
  'Evergreen',
  'Feelings',
  'For Just a Moment',
  'Fur Elise',
  'Go The Distance',
  'Golden Hours Rag',
  'Gypsy Life',
  'Hava Nagila',
  'Hey Jude',
  'Human',
  'I Gotta Feeling',
  'I Wish',
  'Jalousie (Tango Tzigane)',
  'Just a Moment',
  'La Vie en Rose',
  'Lay Lady Lay Bob Dylan',
  'Life on Mars',
  'Love Story',
  'Married Life from UP',
  'Michelle',
  'Morning Mood',
  'My Hero',
  'Nothing Else Matters',
  'One Hand',
  'Panis Angelicus',
  'Por Una Cabeza',
  'Rainbow',
  'Ring of Fire',
  'Romanza',
  'Saturday Night',
  'Shake It Off',
  'Simple Gifts',
  'Slipping Through My Fingers',
  'Something',
  'Spring (The Four Seasons)',
  'Sugar',
  'Tales from the Vienna Woods',
  'Taylor Swift - Black Space',
  'The Beatitudes',
  'The Ludlows',
  'The Star-Spangled Banner',
  'The Winner Is - Devotchka',
  'Til There Was You',
  'Touch The Sky',
  'Two Hearts in 3-4 Time',
  'Vocalise',
  'We Wish You a Merry Christmas',
  'What Are You Doing the Rest of Your Life',
  'Winter (The Four Seasons)',
  'You Are The Reason',
  'Arioso_in_C_for_Cello_Solo',
  'Joy of My Life',
  'Radio Lana Del Rey',
  'Ave Verum',
  'duo_cello_cover',
  'Just Like Heaven Violin Cello',
  // ---- realistic client-typed variants (NOT library rows) ----
  'Love & Marriage',
  'Beauty & the Beast',
  'Bach & Gounod',
  'Canon in D / Here Comes the Sun',
  'Fauré Pavane',
  'Dvořák Waltz',
  'Le Cygne (Fauré)',
  'Clair de Lune, Debussy',
  'Symphony #5',
  'Symphony No. 5',
  'Symphony No 5',
  'Symphony Nr. 5',
  'Symphony Number 5',
  'Hungarian Dance #5',
  'Brandenburg Concerto No.3, Movt 1',
  'Eine Kleine Nachtmusik, Mvt. 3',
  'El Cant dels Ocells',
  'Für Elise',
  'Café 1930',
  'Träumerei',
]

// ---------------------------------------------------------------------------
// Classifier: for a title where normTitle !== normalizeForSearch, name every
// fold-difference that could explain it. Two families:
//   PY_ONLY  — the reference folds MORE than us (client-vs-library MATCH RISK)
//   OURS_OR_SAFE — we fold more (intentional extra folds) OR we consolidate
//                  punctuation the reference defers to its downstream matching
//                  (_clean_for_match/_split_words). Same NET matching behavior.
// ---------------------------------------------------------------------------
const PY_ONLY_REASONS = ['accent', 'ampersand', 'numbering', 'mvt'] as const
type Reason = (typeof PY_ONLY_REASONS)[number] | 'apostrophe' | 'ensemble' | 'year' | 'version-noise' | 'naughtin-num' | 'punctuation'

const ENSEMBLE_RE = /\b(string\s+)?(quartet|quintet|trio|duo|duet|sextet)\b|\bvc\s+duo\b|\bstring\s+duo\b/i
const VERSION_RE = /\b(v\d+|updated?|version|revised|slower|faster|easier|harder|old|new\s+version|print(?:out)?|copy|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i

function classify(title: string): Reason[] {
  const r: Reason[] = []
  // PY-only folds (reference more lenient than us)
  if (/[^\x00-\x7F]/.test(title)) r.push('accent')
  if (/&/.test(title)) r.push('ampersand')
  if (/#\s*\d/.test(title) || /\bnr\.?\s*\d/i.test(title) || /\bnumber\s*\d/i.test(title)) r.push('numbering')
  if (/\bm(?:o)?vt\b/i.test(title)) r.push('mvt')
  // our extra folds / punctuation consolidation (safe)
  if (/'/.test(title)) r.push('apostrophe')
  if (ENSEMBLE_RE.test(title)) r.push('ensemble')
  if (/\b(19|20)\d{2}\b/.test(title)) r.push('year')
  if (VERSION_RE.test(title)) r.push('version-noise')
  if (/-\s*0?\d+\b/.test(title)) r.push('naughtin-num')
  if (/[,.\-_/()[\]{}"?!;:]/.test(title)) r.push('punctuation')
  return r
}

describe('normalization parity: normTitle vs the Mac normalize_for_search reference', () => {
  it('every divergence in the real-title corpus is explained by a documented fold-difference', () => {
    const unexplained: Array<{ title: string; ours: string; ref: string }> = []
    let divergences = 0
    for (const title of CORPUS) {
      const ours = normTitle(title)
      const ref = normalizeForSearch(title)
      if (ours === ref) continue
      divergences++
      if (classify(title).length === 0) unexplained.push({ title, ours, ref })
    }
    // The whole point of the parity audit: no unexplained normalization drift.
    expect(unexplained).toEqual([])
    // Sanity that the corpus actually exercises divergences (guards against a
    // future no-op corpus silently passing).
    expect(divergences).toBeGreaterThan(50)
  })

  it('ABSENT the four "Python folds, we don\'t" axes AND our own extra folds, the two normalizers AGREE', () => {
    // Isolate the pure-agreement core: titles with none of the PY-only axes and
    // none of our intentional extra-folds / consolidated punctuation. For these
    // there is NO reason to differ — and they must be byte-identical. This is
    // the concrete proof that the divergences are exactly the classified folds,
    // not incidental drift.
    const mismatches: string[] = []
    let checked = 0
    for (const title of CORPUS) {
      if (classify(title).length > 0) continue // skip anything with a known fold trigger
      checked++
      if (normTitle(title) !== normalizeForSearch(title)) mismatches.push(title)
    }
    expect(mismatches).toEqual([])
    expect(checked).toBeGreaterThan(20)
  })

  // -------------------------------------------------------------------------
  // The four KNOWN GAPS (Python folds more than us). Each asserts BOTH the
  // current ours behavior AND the concrete client-vs-library MISS it causes.
  // When normalize.ts is hardened to fold one of these, its assertion flips.
  // -------------------------------------------------------------------------

  describe('KNOWN GAP 1 — accents: reference NFKD-folds to ASCII, we shatter the letter into a word break', () => {
    it('folds diacritics to spaces (and can drop trailing letters), unlike the reference', () => {
      expect(normalizeForSearch('Fauré Pavane')).toBe('faure pavane')
      expect(normTitle('Fauré Pavane')).toBe('faur pavane') // é -> space, trailing e absorbed
      expect(normalizeForSearch('Für Elise')).toBe('fur elise')
      expect(normTitle('Für Elise')).toBe('f r elise') // ü -> space: "f r"
      expect(normalizeForSearch('Träumerei')).toBe('traumerei')
      expect(normTitle('Träumerei')).toBe('tr umerei')
    })
    it('CONSEQUENCE: a client who omits the accent cannot exact-match a library title stored WITH it', () => {
      // Same piece, accent vs no-accent — the reference collapses both to
      // "faure pavane"; ours produces two different strings, so the exact tier
      // (and even keyword tier) misses across the accent boundary.
      expect(normTitle('Faure Pavane')).toBe('faure pavane')
      expect(normTitle('Fauré Pavane')).toBe('faur pavane')
      expect(normTitle('Faure Pavane')).not.toBe(normTitle('Fauré Pavane'))
      // The reference would have matched them.
      expect(normalizeForSearch('Faure Pavane')).toBe(normalizeForSearch('Fauré Pavane'))
    })
  })

  describe('KNOWN GAP 2 — ampersand: reference maps "&" -> "and", we drop it', () => {
    it('drops & entirely where the reference bridges it to the word "and"', () => {
      expect(normalizeForSearch('Love & Marriage')).toBe('love and marriage')
      expect(normTitle('Love & Marriage')).toBe('love marriage')
    })
    it('CONSEQUENCE: client "X and Y" cannot match a library "X & Y" (and vice versa)', () => {
      expect(normTitle('Love and Marriage')).toBe('love and marriage')
      expect(normTitle('Love & Marriage')).toBe('love marriage')
      expect(normTitle('Love and Marriage')).not.toBe(normTitle('Love & Marriage'))
      // "and" is NOT a matcher stopword, so the keyword tier misses too.
      expect(normalizeForSearch('Love and Marriage')).toBe(normalizeForSearch('Love & Marriage'))
    })
  })

  describe('KNOWN GAP 3 — numbering: reference unifies #/No./Nr./Number -> "no N", we only handle "No."', () => {
    it('leaves "#5"/"Nr. 5"/"Number 5" unnormalized where the reference makes them "no 5"', () => {
      expect(normalizeForSearch('Symphony #5')).toBe('symphony no 5')
      expect(normTitle('Symphony #5')).toBe('symphony 5') // # dropped, no "no"
      expect(normalizeForSearch('Symphony Nr. 5')).toBe('symphony no 5')
      expect(normTitle('Symphony Nr. 5')).toBe('symphony nr 5')
      expect(normalizeForSearch('Symphony Number 5')).toBe('symphony no 5')
      expect(normTitle('Symphony Number 5')).toBe('symphony number 5')
      // "No." DOES agree (both -> "no 5"), so this axis is only the #/Nr/Number forms.
      expect(normTitle('Symphony No. 5')).toBe('symphony no 5')
      expect(normalizeForSearch('Symphony No. 5')).toBe('symphony no 5')
    })
    it('CONSEQUENCE (live data): "Hungarian #1" is stored as norm_title "hungarian 1"; typing "Hungarian No. 1" cannot reach it', () => {
      // These reflect the ACTUAL stored norm_titles in the live repertoire
      // (built by our indexer with normTitle) — see parity-report.md.
      expect(normTitle('Hungarian #1')).toBe('hungarian 1')
      expect(normTitle('Hungarian No. 1')).toBe('hungarian no 1')
      expect(normTitle('Hungarian #1')).not.toBe(normTitle('Hungarian No. 1'))
      // The reference bridges #1 and No. 1.
      expect(normalizeForSearch('Hungarian #1')).toBe(normalizeForSearch('Hungarian No. 1'))
    })
  })

  describe('KNOWN GAP 4 — movement abbreviation: reference maps mvt/movt -> "movement", we keep it literal', () => {
    it('keeps "Mvt"/"Movt" where the reference expands to "movement"', () => {
      expect(normalizeForSearch('Aubade Mvt 1')).toBe('aubade movement 1')
      expect(normTitle('Aubade Mvt 1')).toBe('aubade mvt 1')
      expect(normalizeForSearch('Brandenburg Concerto No.3, Movt 1')).toBe('brandenburg concerto no 3 movement 1')
      expect(normTitle('Brandenburg Concerto No.3, Movt 1')).toBe('brandenburg concerto no 3 movt 1')
    })
    it('CONSEQUENCE: library stores "Mvt"; a client typing "Movement" misses, and vice versa', () => {
      expect(normTitle('Eine Kleine Nachtmusik Mvt 3')).toBe('eine kleine nachtmusik mvt 3')
      expect(normTitle('Eine Kleine Nachtmusik Movement 3')).toBe('eine kleine nachtmusik movement 3')
      expect(normTitle('Eine Kleine Nachtmusik Mvt 3')).not.toBe(normTitle('Eine Kleine Nachtmusik Movement 3'))
      expect(normalizeForSearch('Eine Kleine Nachtmusik Mvt 3')).toBe(normalizeForSearch('Eine Kleine Nachtmusik Movement 3'))
    })
  })

  // -------------------------------------------------------------------------
  // A DISCOVERED BUG (not present in the reference): our VERSION/NAUGHTIN folds
  // over-strip. "3-4 Time" is a time signature, but `-\s*0?\d+\b` eats "-4".
  // Documented here so the Improve stage can tighten the regex.
  // -------------------------------------------------------------------------
  it('KNOWN BUG — naughtin-number strip eats musical "3-4"/"6-8" time signatures', () => {
    expect(normalizeForSearch('Two Hearts in 3-4 Time')).toBe('two hearts in 3-4 time')
    expect(normTitle('Two Hearts in 3-4 Time')).toBe('two hearts in 3 time') // the "4" is lost
  })

  it('KNOWN BUG — "Old" is stripped as version-noise (folds "Grow Old With You" -> "grow with you")', () => {
    // Symmetric on both sides of OUR pipeline (library + client), so it does not
    // break Nichols, but it collides distinct works and is worth tightening.
    expect(normTitle('Grow Old With You')).toBe('grow with you')
    expect(normalizeForSearch('Grow Old With You')).toBe('grow old with you')
  })

  // -------------------------------------------------------------------------
  // Stored-parity sanity: normTitle reproduces the LIVE repertoire norm_title
  // for representative rows (indexer and matcher share normalize.ts). Pairs are
  // real (title -> norm_title) rows pulled from the org's repertoire table.
  // -------------------------------------------------------------------------
  it('reproduces live repertoire norm_title values exactly (indexer/matcher share the fold)', () => {
    const liveRows: Array<[string, string]> = [
      ['Ave Maria', 'ave maria'],
      ['Ave Maria Bb', 'ave maria bb'],
      ['Clair de Lune', 'clair de lune'],
      ['God Only Knows', 'god only knows'],
      ["Golliwog's Cakewalk", 'golliwogs cakewalk'],
      ['Golliwog', 'golliwog'],
      ['Hungarian #1', 'hungarian 1'],
      ['Hungarian #21', 'hungarian 21'],
    ]
    for (const [title, storedNorm] of liveRows) {
      expect(normTitle(title), `norm_title drift for "${title}"`).toBe(storedNorm)
    }
  })
})
