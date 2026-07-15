/**
 * Repertoire DB import — Phase A2 of the repertoire import.
 *
 * Phase A1 (scripts/repertoire-upload.js) pushed every confident PDF to
 * Cloudflare R2 under a content-addressed key: repertoire/<org>/<sha256>.pdf.
 * This script writes the DATABASE rows that describe that library into the three
 * org-scoped tables created by migration 068:
 *
 *   repertoire        — one row per musical work  (title, artist, ensemble, norm_title, tags)
 *   repertoire_parts  — one row per part PDF      (part, storage_path, sha256, ...)
 *   title_aliases     — "messy title -> work"     seeded from the manual artist dict
 *
 * SOURCE OF TRUTH: scripts/repertoire-out/index.json (the indexer output). Every
 * decision here is derived deterministically from that file, so the import is
 * reproducible and IDEMPOTENT: re-running queries the existing rows and only
 * inserts what is missing. A clean second run reports 0 inserted.
 *
 * The bytes already live in R2 keyed by sha256, so NOTHING here re-uploads or can
 * lose a file's content: even files that cannot be given their own part row
 * (see the collision handling below) have their relPath + sha256 recorded in a
 * sibling part's notes and are recoverable from R2.
 *
 * KEY MODELLING DECISIONS (data-shape surprises handled — see the final report):
 *  - Grouping unit is the file's arrangementKey, NOT the arrangements[] array.
 *    The array omits works whose title normalized to "" (e.g. "September"), which
 *    would silently drop 6 confident files; grouping by arrangementKey rescues them.
 *  - Ensemble comes from the member files (unanimous within a group), NOT from
 *    arrangements[].ensemble, which disagrees with its own key/files 199x and
 *    would manufacture identity collisions. arrangements[] is used only for the
 *    display title and missingParts (incomplete tag) when present.
 *  - artist is the most-frequent non-empty file artist (alpha tie-break), NULL if none.
 *  - norm_title is the arrangementKey's 3rd component, falling back to a folded
 *    normalization of the title when that component is empty.
 *  - Part-role collisions (two DIFFERENT files claiming the same part role in one
 *    work, e.g. a "Bach" and a "J.S. Bach" vln1): the first (by relPath) keeps the
 *    role; the next is bumped to part='other' with played_on carrying the origin
 *    part so it stays unique and queryable; any further overflow (the pathological
 *    "Taylor Swift" mega-merge) is folded into the canonical part's notes. All such
 *    works are flagged 'needs-review'.
 *
 * Usage:
 *   PODIUM_ORG_ID=<uuid> node scripts/repertoire-db-import.js [options]
 *
 * Options:
 *   --index <path>   Index JSON (default scripts/repertoire-out/index.json, or env REPERTOIRE_INDEX).
 *   --org <uuid>     Org id (default env PODIUM_ORG_ID).
 *   --aliases <path> artist_lookup_manual.py (default the Music Compiler copy in-repo).
 *   --dry-run        Print the full plan (counts + samples), write nothing.
 *   --help, -h       Show this help.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 * (service role bypasses RLS, same as scripts/backup-database.js). If migration
 * 068 has not been applied the script exits with a friendly "run migration 068
 * first" message — except under --dry-run, which prints the plan regardless.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const DEFAULT_INDEX = path.join(ROOT, 'scripts', 'repertoire-out', 'index.json')
const DEFAULT_ALIASES = path.join(
  ROOT,
  'Music Compiler Local System',
  'Music Compiler',
  'artist_lookup_manual.py',
)
const REPORT_PATH = path.join(ROOT, 'scripts', 'repertoire-out', 'db-import-report.json')

const BUCKET_PREFIX = 'repertoire' // R2 key namespace: repertoire/<org>/<sha256>.pdf
const INSERT_CHUNK = 500
const PAGE = 1000

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

class UserError extends Error {}
class ExitSignal extends Error {
  constructor(code) {
    super('exit')
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// env + args
// ---------------------------------------------------------------------------

/** Load .env.local into process.env without clobbering already-set vars. */
function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local')
  if (!fs.existsSync(file)) return
  const text = fs.readFileSync(file, 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

function parseArgs(argv) {
  const opts = {
    index: process.env.REPERTOIRE_INDEX || DEFAULT_INDEX,
    org: process.env.PODIUM_ORG_ID || '',
    aliases: process.env.REPERTOIRE_ALIASES || DEFAULT_ALIASES,
    dryRun: false,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '--index': opts.index = argv[++i]; break
      case '--org': opts.org = argv[++i]; break
      case '--aliases': opts.aliases = argv[++i]; break
      case '--dry-run': opts.dryRun = true; break
      case '--help': case '-h': printHelpAndExit(); break
      default:
        console.error(`Unknown option: ${a}`)
        printHelpAndExit(1)
    }
  }
  return opts
}

function printHelpAndExit(code = 0) {
  console.log(
    'Usage: PODIUM_ORG_ID=<uuid> node scripts/repertoire-db-import.js\n' +
      '  [--index <path>] [--org <uuid>] [--aliases <path>] [--dry-run]',
  )
  throw new ExitSignal(code)
}

// ---------------------------------------------------------------------------
// normalization
// ---------------------------------------------------------------------------

// The importer must normalize titles EXACTLY as scripts/repertoire-index.js did,
// because repertoire.norm_title comes straight from the index (the arrangementKey's
// 3rd component) and title_aliases.alias_norm has to match that same scheme. The
// three helpers below are a verbatim copy of the indexer's normalization (its
// character classes reproduced codepoint-for-codepoint). The indexer runs main()
// on require (no exports), so it cannot simply be imported.
function unifyQuotes(s) {
  return s
    .replace(/[‘’‛ʼ]/g, "'") // curly / modifier apostrophes
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-') // en/em dash -> hyphen
    .replace(/[]/g, '(') // private-use glyph seen in a folder name
}

const ENSEMBLE_WORDS =
  /\b(string\s+)?(quartet|quintet|trio|duo|duet|sextet)\b|\bvc\s+duo\b|\bstring\s+duo\b/gi

const VERSION_NOISE =
  /\b(v\d+|updated?|update\s+\w+\s*\d{0,4}|version|revised|slower|faster|easier|harder|old|too\s+hard|new\s+version|print(?:out)?|copy|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b/g

/** EXACT replica of repertoire-index.js normTitle — same output as repertoire.norm_title. */
function normTitleIndex(title) {
  let t = unifyQuotes(title || '').toLowerCase()
  t = t.replace(/\(\s*\d+\s*\)/g, ' ') // "(1)" copy suffix
  t = t.replace(ENSEMBLE_WORDS, ' ')
  t = t.replace(/-\s*0?\d+\b/g, ' ') // leftover Naughtin "-01" numbering
  t = t.replace(/\b(19|20)\d{2}\b/g, ' ') // years (2021, 2022, ...)
  t = t.replace(VERSION_NOISE, ' ')
  t = t.replace(/['`]/g, '') // drop apostrophes/backtick (Cant == Can't)
  t = t.replace(/[^a-z0-9]+/g, ' ') // collapse punctuation
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

/**
 * Minimal normalization used ONLY when normTitleIndex() yields "" — the indexer
 * itself drops such works (repertoire-index.js line 511: `if (!r.normTitle) continue`),
 * which is why e.g. "September" (a month word stripped by VERSION_NOISE) has no
 * arrangement row. This keeps punctuation/quote folding but NOT the noise stripping,
 * so "September" -> "september" instead of "".
 */
function normTitleBasic(title) {
  let t = unifyQuotes(title || '').toLowerCase()
  t = t.replace(/['`]/g, '')
  t = t.replace(/[^a-z0-9]+/g, ' ')
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

// ---------------------------------------------------------------------------
// index loading + plan building
// ---------------------------------------------------------------------------

function loadIndex(indexPath) {
  if (!fs.existsSync(indexPath)) {
    throw new UserError(
      `Index not found: ${indexPath}\n` +
        `Run the repertoire indexer first, or pass --index <path>.`,
    )
  }
  let data
  try {
    data = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
  } catch (e) {
    throw new UserError(`Index is not valid JSON (${indexPath}): ${e.message}`)
  }
  if (!Array.isArray(data.files)) {
    throw new UserError(`Index has no "files" array (${indexPath}).`)
  }
  return data
}

/** Pick a work's artist: most-frequent non-empty file artist, alpha tie-break; NULL if none. */
function deriveArtist(files) {
  const counts = new Map()
  for (const f of files) {
    const a = (f.artist || '').trim()
    if (a) counts.set(a, (counts.get(a) || 0) + 1)
  }
  if (counts.size === 0) return null
  return [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0][0]
}

/** Deterministic, non-empty normalized title for a group (matches the index scheme). */
function deriveNormTitle(arrangementKey, files) {
  const comp = (arrangementKey.split('::')[2] || '').trim()
  if (comp) return comp
  // arrangementKey component empty => the indexer's normTitle folded to "" (e.g.
  // "September"). Recover a sensible, non-empty norm without the noise stripping.
  const basic = normTitleBasic(files[0].title)
  if (basic) return basic
  const fromFile = normTitleBasic((files[0].originalFilename || '').replace(/\.pdf$/i, ''))
  return fromFile || 'untitled'
}

/**
 * Build the in-memory plan from the index. Returns:
 *   works:   [{ identityKey, title, artist, ensemble, normTitle, tags, files[] }]
 *   aliases: parsed MANUAL_ARTISTS entries [{ alias, proper, artist }]
 * plus planning stats.
 */
function buildPlan(index, org, aliasEntries) {
  const files = index.files
  const arrByKey = new Map((index.arrangements || []).map((a) => [a.arrangementKey, a]))

  // 1. Group the importable files (non-excluded, non-duplicate) by arrangementKey.
  //    Duplicates (duplicateOf set) are byte-identical to their canonical and are
  //    already collapsed in R2; they are folded into the canonical part's notes.
  const groups = new Map()
  let excluded = 0
  let duplicates = 0
  for (const f of files) {
    if (f.classification === 'excluded') { excluded++; continue }
    if (f.duplicateOf) { duplicates++; continue }
    if (!groups.has(f.arrangementKey)) groups.set(f.arrangementKey, [])
    groups.get(f.arrangementKey).push(f)
  }

  // 2. Turn each group into a work, then dedupe works by the DB identity key
  //    (norm_title, coalesce(artist,''), ensemble) — merging any collisions.
  const works = new Map() // identityKey -> work
  for (const [key, groupFiles] of groups) {
    const arr = arrByKey.get(key)
    const ensemble = groupFiles[0].ensemble || 'other'
    const normTitle = deriveNormTitle(key, groupFiles)
    const artist = deriveArtist(groupFiles)
    const title = (arr && arr.title) || groupFiles[0].title || normTitle
    const identityKey = [normTitle, artist || '', ensemble].join(' ')

    const missingParts = arr ? arr.missingParts : groupFiles[0].arrangementMissingParts
    const incomplete = Array.isArray(missingParts) && missingParts.length > 0
    const hasNeedsReview = groupFiles.some((f) => f.classification === 'needs-review')

    let work = works.get(identityKey)
    if (!work) {
      work = {
        identityKey,
        title,
        artist,
        ensemble,
        normTitle,
        tags: new Set(),
        files: [],
      }
      works.set(identityKey, work)
    }
    for (const f of groupFiles) work.files.push(f)
    if (incomplete) work.tags.add('incomplete')
    if (hasNeedsReview) work.tags.add('needs-review')
  }

  // 3. Assign a part-role to every file in each work, resolving collisions.
  const flagged = { works: 0, unresolvedParts: 0, bumpedParts: 0, foldedFiles: 0 }
  const workList = [...works.values()]
  for (const work of workList) {
    assignParts(work, org, flagged)
    work.tagsArr = [...work.tags].sort()
    if (work.tags.has('needs-review')) flagged.works++
  }

  return {
    works: workList,
    aliases: aliasEntries,
    stats: { excluded, duplicates, groups: groups.size, works: workList.length, flagged },
  }
}

/**
 * Assign each of a work's files a repertoire_parts row, honoring the unique role
 * key (part, substitute, coalesce(played_on,'')). Deterministic (sorted by
 * relPath) so re-runs reproduce identical roles — the basis of idempotency.
 *
 * Role ladder for a file (first free slot wins):
 *   1. natural role           (part, substitute, played_on)
 *   2. bumped to 'other'      ('other', substitute, played_on||part)   [+alternate note]
 *   3. bumped + sub toggled   ('other', !substitute, played_on||part)  [+alternate note]
 *   4. no slot -> fold into the note of the row holding the natural role (no row lost:
 *      bytes are in R2 by sha256, relPath+sha recorded). Work flagged needs-review.
 */
function assignParts(work, org, flagged) {
  const sorted = work.files.slice().sort((a, b) => a.relPath.localeCompare(b.relPath))
  const taken = new Map() // roleKey -> partRow
  const parts = []

  for (const f of sorted) {
    const origPart = f.part || 'other'
    const unresolved = f.part == null || f.part === undefined
    const sub = !!f.substitute
    const playedOn = f.playedOn || null

    const candidates = [
      { part: origPart, substitute: sub, playedOn },
      { part: 'other', substitute: sub, playedOn: playedOn || origPart },
      { part: 'other', substitute: !sub, playedOn: playedOn || origPart },
    ]

    let chosen = null
    for (const c of candidates) {
      const rk = roleKey(c.part, c.substitute, c.playedOn)
      if (!taken.has(rk)) { chosen = c; break }
    }

    if (!chosen) {
      // Overflow: fold into the row occupying this file's natural role.
      const holder = taken.get(roleKey(origPart, sub, playedOn)) || parts[0]
      flagged.foldedFiles++
      work.tags.add('needs-review')
      if (holder) {
        holder.foldedAliases.push(
          `unplaced ${origPart}: ${f.relPath} sha256=${(f.sha256 || '').toLowerCase()}`,
        )
      }
      continue
    }

    const bumped = chosen.part !== origPart || (chosen.playedOn || null) !== playedOn
    if (unresolved) flagged.unresolvedParts++
    if (bumped) { flagged.bumpedParts++; work.tags.add('needs-review') }
    if (unresolved) work.tags.add('needs-review')

    const notePrefix = []
    if (unresolved) notePrefix.push('UNRESOLVED PART')
    if (bumped) notePrefix.push(`alternate ${origPart} version`)

    const row = {
      // repertoire_id filled in after the parent work is inserted / matched.
      organization_id: org,
      part: chosen.part,
      substitute: chosen.substitute,
      played_on: chosen.playedOn || null,
      storage_path: `${BUCKET_PREFIX}/${org}/${(f.sha256 || '').toLowerCase()}.pdf`,
      original_filename: f.originalFilename,
      bytes: typeof f.bytes === 'number' ? f.bytes : null,
      sha256: (f.sha256 || '').toLowerCase() || null,
      _notePrefix: notePrefix,
      _baseNote: (f.notes || '').trim(),
      _aliasPaths: Array.isArray(f.aliasPaths) ? f.aliasPaths.slice() : [],
      foldedAliases: [],
    }
    taken.set(roleKey(chosen.part, chosen.substitute, chosen.playedOn), row)
    parts.push(row)
  }

  // Compose final notes now that folded aliases are attached.
  for (const row of parts) {
    const segs = []
    for (const p of row._notePrefix) segs.push(p)
    if (row._baseNote) segs.push(row._baseNote)
    for (const a of row._aliasPaths) segs.push(`alias: ${a}`)
    for (const a of row.foldedAliases) segs.push(a)
    row.notes = segs.length ? segs.join('; ') : null
    delete row._notePrefix
    delete row._baseNote
    delete row._aliasPaths
    delete row.foldedAliases
  }
  work.parts = parts
}

function roleKey(part, substitute, playedOn) {
  return `${part} ${substitute ? 1 : 0} ${playedOn || ''}`
}

// ---------------------------------------------------------------------------
// MANUAL_ARTISTS dict parsing
// ---------------------------------------------------------------------------

/** Unescape a Python/JS double-quoted string body (\" \\ \n \t etc). */
function unescapePy(s) {
  return s.replace(/\\(["'\\nrt])/g, (_, c) => {
    switch (c) {
      case 'n': return '\n'
      case 'r': return '\r'
      case 't': return '\t'
      default: return c
    }
  })
}

/**
 * Parse MANUAL_ARTISTS = { "norm title": ("Proper Title", "Artist"), ... }.
 * One entry per line. Later duplicate keys win (Python dict semantics).
 */
function parseAliasDict(aliasPath) {
  if (!fs.existsSync(aliasPath)) {
    throw new UserError(
      `Alias dictionary not found: ${aliasPath}\nPass --aliases <path> to artist_lookup_manual.py.`,
    )
  }
  const text = fs.readFileSync(aliasPath, 'utf8')
  const lineRe =
    /^\s*"((?:[^"\\]|\\.)*)"\s*:\s*\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)\s*,?\s*$/
  const byAlias = new Map()
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(lineRe)
    if (!m) continue
    const alias = unescapePy(m[1])
    const proper = unescapePy(m[2])
    const artist = unescapePy(m[3])
    byAlias.set(alias, { alias, proper, artist }) // last wins
  }
  return [...byAlias.values()]
}

// ---------------------------------------------------------------------------
// Supabase REST
// ---------------------------------------------------------------------------

function makeRest() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new UserError(
      'Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and ' +
        'SUPABASE_SERVICE_ROLE_KEY in .env.local (service role bypasses RLS).',
    )
  }
  const base = url.replace(/\/$/, '')
  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  return { base, headers }
}

class MissingTableError extends Error {}

/** Detect PostgREST's "table not in schema cache" / undefined_table response. */
function isMissingTable(status, body) {
  if (status === 404 || status === 400) {
    const code = body && body.code
    const msg = ((body && (body.message || body.hint)) || '').toLowerCase()
    if (code === 'PGRST205' || code === 'PGRST202' || code === '42P01') return true
    if (msg.includes('does not exist') || msg.includes('schema cache')) return true
    if (status === 404 && !code) return true
  }
  return false
}

/** GET every row of a table (paginated), returning an array. Throws MissingTableError. */
async function restSelectAll(rest, table, query) {
  const rows = []
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetch(`${rest.base}/rest/v1/${table}?${query}`, {
      headers: { ...rest.headers, Range: `${offset}-${offset + PAGE - 1}`, 'Range-Unit': 'items' },
    })
    if (!res.ok) {
      let body = null
      try { body = await res.json() } catch { /* non-JSON */ }
      if (isMissingTable(res.status, body)) throw new MissingTableError(table)
      throw new Error(`GET ${table}: HTTP ${res.status} ${JSON.stringify(body)}`)
    }
    const page = await res.json()
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows
}

/**
 * Bulk INSERT rows (chunked). Collects per-chunk failures and continues so one
 * bad chunk never aborts the whole import (the run is idempotent, so a re-run
 * retries only what is still missing). Returns { inserted, errors }. A missing
 * table is a hard stop (throws MissingTableError) — that is a config problem,
 * not a row problem.
 */
async function restInsert(rest, table, rows) {
  const inserted = []
  const errors = []
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK)
    let res
    try {
      res = await fetch(`${rest.base}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
          ...rest.headers,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(chunk),
      })
    } catch (e) {
      errors.push(`INSERT ${table} [${i}..${i + chunk.length}): network error ${e.message}`)
      continue
    }
    if (!res.ok) {
      let body = null
      try { body = await res.json() } catch { /* non-JSON */ }
      if (isMissingTable(res.status, body)) throw new MissingTableError(table)
      errors.push(`INSERT ${table} [${i}..${i + chunk.length}): HTTP ${res.status} ${JSON.stringify(body)}`)
      continue
    }
    const rep = await res.json()
    inserted.push(...rep)
  }
  return { inserted, errors }
}

// ---------------------------------------------------------------------------
// import execution (shared by dry-run and real run)
// ---------------------------------------------------------------------------

function repertoireIdentity(row) {
  return [row.norm_title, row.artist || '', row.ensemble].join(' ')
}

async function runImport(plan, opts, rest) {
  const report = {
    generatedAt: new Date().toISOString(),
    index: opts.index,
    org: opts.org,
    dryRun: opts.dryRun,
    tablesMissing: false,
    inserted: { repertoire: 0, parts: 0, aliases: 0 },
    skipped: { repertoire: 0, parts: 0, aliases: 0 },
    flagged: plan.stats.flagged,
    aliasesSeeded: 0,
    aliasesUnmatched: 0,
    aliasesIdentitySkipped: 0,
    counts: {
      excluded: plan.stats.excluded,
      duplicatesFolded: plan.stats.duplicates,
      groups: plan.stats.groups,
      works: plan.stats.works,
      partsPlanned: plan.works.reduce((n, w) => n + w.parts.length, 0),
    },
    errors: [],
  }

  // --- existing rows (idempotency probe) ---
  let existingWorks = new Map() // identity -> id
  let existingParts = new Set() // `${repertoire_id}\0role`
  let existingAliases = new Set() // alias_norm
  let tablesMissing = false

  try {
    const rows = await restSelectAll(
      rest,
      'repertoire',
      `organization_id=eq.${opts.org}&select=id,norm_title,artist,ensemble`,
    )
    for (const r of rows) existingWorks.set(repertoireIdentity(r), r.id)
    const partRows = await restSelectAll(
      rest,
      'repertoire_parts',
      `organization_id=eq.${opts.org}&select=repertoire_id,part,substitute,played_on`,
    )
    for (const p of partRows) {
      existingParts.add(`${p.repertoire_id} ${roleKey(p.part, p.substitute, p.played_on)}`)
    }
    const aliasRows = await restSelectAll(
      rest,
      'title_aliases',
      `organization_id=eq.${opts.org}&select=alias_norm`,
    )
    for (const a of aliasRows) existingAliases.add(a.alias_norm)
  } catch (e) {
    if (e instanceof MissingTableError) {
      tablesMissing = true
      report.tablesMissing = true
      if (!opts.dryRun) {
        throw new UserError(
          `Table "${e.message}" does not exist — migration 068 has not been applied.\n` +
            `Apply supabase/migrations/068_repertoire.sql first, then re-run this import.\n` +
            `(You can preview the full plan without the DB using --dry-run.)`,
        )
      }
      console.log(
        `\nNOTE: repertoire tables are missing (migration 068 not applied yet).\n` +
          `Showing the plan as if the database were empty.\n`,
      )
    } else {
      throw e
    }
  }

  // --- repertoire ---
  const worksToInsert = []
  for (const w of plan.works) {
    if (existingWorks.has(w.identityKey)) {
      report.skipped.repertoire++
    } else {
      worksToInsert.push(w)
    }
  }
  report.inserted.repertoire = worksToInsert.length

  if (!opts.dryRun && worksToInsert.length) {
    const payload = worksToInsert.map((w) => ({
      organization_id: opts.org,
      title: w.title,
      artist: w.artist,
      ensemble: w.ensemble,
      norm_title: w.normTitle,
      tags: w.tagsArr,
    }))
    const { inserted: rep, errors } = await restInsert(rest, 'repertoire', payload)
    for (const r of rep) existingWorks.set(repertoireIdentity(r), r.id)
    report.errors.push(...errors)
    report.inserted.repertoire = rep.length // actual
  }

  // Resolve every work to its repertoire id (real run) or a placeholder (dry-run).
  for (const w of plan.works) {
    w.repertoireId = existingWorks.get(w.identityKey) || null
  }

  // --- repertoire_parts ---
  const partsToInsert = []
  for (const w of plan.works) {
    // Real run: a work whose repertoire insert failed has no id — its parts can't
    // be written. Record one error and skip them (a re-run fixes it once the
    // parent inserts).
    if (!opts.dryRun && !w.repertoireId) {
      report.errors.push(
        `SKIP parts for work "${w.title}" [${w.ensemble}] — parent repertoire row not inserted`,
      )
      continue
    }
    for (const p of w.parts) {
      const repId = w.repertoireId
      const roleId = repId
        ? `${repId} ${roleKey(p.part, p.substitute, p.played_on)}`
        : null
      if (roleId && existingParts.has(roleId)) {
        report.skipped.parts++
        continue
      }
      partsToInsert.push({ work: w, part: p })
    }
  }
  report.inserted.parts = partsToInsert.length

  if (!opts.dryRun && partsToInsert.length) {
    const payload = partsToInsert.map(({ work, part }) => ({
      repertoire_id: work.repertoireId,
      organization_id: opts.org,
      part: part.part,
      substitute: part.substitute,
      played_on: part.played_on,
      storage_path: part.storage_path,
      original_filename: part.original_filename,
      bytes: part.bytes,
      sha256: part.sha256,
      notes: part.notes,
    }))
    const { inserted, errors } = await restInsert(rest, 'repertoire_parts', payload)
    report.errors.push(...errors)
    report.inserted.parts = inserted.length // actual
  }

  // --- title_aliases ---
  // Look up canonical works by lowercased title and by norm_title (deterministic
  // first-wins over sorted works so a title shared by >1 work maps stably).
  const byTitleLc = new Map()
  const byNorm = new Map()
  const sortedWorks = plan.works.slice().sort((a, b) => a.identityKey.localeCompare(b.identityKey))
  for (const w of sortedWorks) {
    const tl = (w.title || '').toLowerCase()
    if (tl && !byTitleLc.has(tl)) byTitleLc.set(tl, w)
    if (!byNorm.has(w.normTitle)) byNorm.set(w.normTitle, w)
  }

  const aliasesToInsert = []
  const plannedAliasNorms = new Set()
  for (const e of plan.aliases) {
    const aliasNorm = normTitleIndex(e.alias)
    if (!aliasNorm) continue
    const properNorm = normTitleIndex(e.proper)
    const target =
      byTitleLc.get((e.proper || '').toLowerCase()) ||
      byNorm.get(properNorm) ||
      byNorm.get(aliasNorm) ||
      null
    if (!target) { report.aliasesUnmatched++; continue }
    if (aliasNorm === target.normTitle) { report.aliasesIdentitySkipped++; continue }
    if (plannedAliasNorms.has(aliasNorm)) continue // one row per alias_norm (unique key)
    plannedAliasNorms.add(aliasNorm)
    if (existingAliases.has(aliasNorm)) { report.skipped.aliases++; continue }
    aliasesToInsert.push({ aliasNorm, target })
  }
  report.aliasesSeeded = aliasesToInsert.length
  report.inserted.aliases = aliasesToInsert.length

  if (!opts.dryRun && aliasesToInsert.length) {
    // Drop aliases whose target work failed to insert (no id); a re-run seeds them.
    const insertable = aliasesToInsert.filter(({ target }) => target.repertoireId)
    for (const { aliasNorm } of aliasesToInsert) {
      if (!insertable.find((x) => x.aliasNorm === aliasNorm)) {
        report.errors.push(`SKIP alias "${aliasNorm}" — target repertoire row not inserted`)
      }
    }
    const payload = insertable.map(({ aliasNorm, target }) => ({
      organization_id: opts.org,
      alias_norm: aliasNorm,
      repertoire_id: target.repertoireId,
    }))
    const { inserted, errors } = await restInsert(rest, 'title_aliases', payload)
    report.errors.push(...errors)
    report.inserted.aliases = inserted.length // actual
  }

  return report
}

// ---------------------------------------------------------------------------
// output
// ---------------------------------------------------------------------------

function printSamples(plan) {
  console.log('\n--- sample repertoire rows (up to 10) ---')
  for (const w of plan.works.slice(0, 10)) {
    console.log(
      `  [${w.ensemble}] "${w.title}" artist=${w.artist ? `"${w.artist}"` : 'NULL'} ` +
        `norm="${w.normTitle}" tags=[${w.tagsArr.join(',')}] parts=${w.parts.length}`,
    )
  }
  console.log('\n--- sample repertoire_parts rows (up to 10) ---')
  const sampleParts = []
  for (const w of plan.works) {
    for (const p of w.parts) {
      sampleParts.push({ w, p })
      if (sampleParts.length >= 10) break
    }
    if (sampleParts.length >= 10) break
  }
  for (const { w, p } of sampleParts) {
    console.log(
      `  ${p.part}${p.substitute ? '(sub)' : ''}${p.played_on ? `->${p.played_on}` : ''} ` +
        `"${p.original_filename}" [${w.ensemble} "${w.title}"]` +
        `${p.notes ? ` notes="${p.notes.slice(0, 70)}${p.notes.length > 70 ? '…' : ''}"` : ''}`,
    )
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  loadEnvLocal()
  const opts = parseArgs(process.argv)

  if (!opts.org) {
    if (opts.dryRun) {
      opts.org = '<PODIUM_ORG_ID>'
      opts.orgIsPlaceholder = true
      console.log('NOTE: no org id set — using placeholder for the dry-run plan.\n')
    } else {
      throw new UserError('No org id. Set PODIUM_ORG_ID=<uuid> in .env.local or pass --org <uuid>.')
    }
  }

  const index = loadIndex(opts.index)
  const aliasEntries = parseAliasDict(opts.aliases)
  console.log(
    `Index: ${opts.index}\n` +
      `  files=${index.files.length} arrangements=${(index.arrangements || []).length} ` +
      `aliasDictEntries=${aliasEntries.length}`,
  )

  const plan = buildPlan(index, opts.org, aliasEntries)
  console.log(
    `\nPlan: works=${plan.stats.works} (from ${plan.stats.groups} arrangement groups), ` +
      `partsPlanned=${plan.works.reduce((n, w) => n + w.parts.length, 0)}`,
  )
  console.log(
    `  excluded=${plan.stats.excluded} duplicatesFolded=${plan.stats.duplicates} ` +
      `flagged: works=${plan.stats.flagged.works} unresolvedParts=${plan.stats.flagged.unresolvedParts} ` +
      `bumpedParts=${plan.stats.flagged.bumpedParts} foldedFiles=${plan.stats.flagged.foldedFiles}`,
  )

  // REST is optional in dry-run (plan renders without it); required for a real run.
  // A placeholder org (no PODIUM_ORG_ID) can't be probed, so stay DB-free.
  let rest = null
  if (!opts.orgIsPlaceholder) {
    try {
      rest = makeRest()
    } catch (e) {
      if (opts.dryRun) {
        console.log(`\nNOTE: ${e.message}\nDry-run continues with an empty database assumption.`)
      } else {
        throw e
      }
    }
  } else {
    console.log('\nNOTE: no org id — skipping DB probe; showing plan against an empty database.')
  }

  let report
  if (rest) {
    report = await runImport(plan, opts, rest)
  } else {
    // No credentials in dry-run: synthesize the "empty DB" plan report.
    report = buildEmptyDbReport(plan, opts)
  }

  if (opts.dryRun) printSamples(plan)

  console.log('\n=== Repertoire DB import report ===')
  console.log(`  mode                : ${opts.dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`)
  if (report.tablesMissing) console.log('  tables              : MISSING (migration 068 not applied)')
  console.log(`  repertoire          : insert ${report.inserted.repertoire}, skip ${report.skipped.repertoire}`)
  console.log(`  repertoire_parts    : insert ${report.inserted.parts}, skip ${report.skipped.parts}`)
  console.log(`  title_aliases       : insert ${report.inserted.aliases}, skip ${report.skipped.aliases}`)
  console.log(`  aliases seeded      : ${report.aliasesSeeded}`)
  console.log(`  aliases unmatched   : ${report.aliasesUnmatched}`)
  console.log(`  aliases identity-skip: ${report.aliasesIdentitySkipped}`)
  console.log(
    `  flagged             : works=${report.flagged.works} unresolvedParts=${report.flagged.unresolvedParts} ` +
      `bumpedParts=${report.flagged.bumpedParts} foldedFiles=${report.flagged.foldedFiles}`,
  )
  console.log(`  errors              : ${report.errors.length}`)

  if (!opts.dryRun) {
    try {
      fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
      fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2))
      console.log(`  report written      : ${REPORT_PATH}`)
    } catch (e) {
      console.warn(`  (could not write report: ${e.message})`)
    }
  }

  return report.errors.length > 0 ? 1 : 0
}

/** Report shape for a dry-run with no DB access at all. */
function buildEmptyDbReport(plan, opts) {
  const report = {
    generatedAt: new Date().toISOString(),
    index: opts.index,
    org: opts.org,
    dryRun: true,
    tablesMissing: true,
    inserted: { repertoire: plan.works.length, parts: 0, aliases: 0 },
    skipped: { repertoire: 0, parts: 0, aliases: 0 },
    flagged: plan.stats.flagged,
    aliasesSeeded: 0,
    aliasesUnmatched: 0,
    aliasesIdentitySkipped: 0,
    counts: {
      excluded: plan.stats.excluded,
      duplicatesFolded: plan.stats.duplicates,
      groups: plan.stats.groups,
      works: plan.stats.works,
      partsPlanned: plan.works.reduce((n, w) => n + w.parts.length, 0),
    },
    errors: [],
  }
  report.inserted.parts = report.counts.partsPlanned

  // Alias matching does not need the DB — compute the real seed/unmatched counts.
  const byTitleLc = new Map()
  const byNorm = new Map()
  const sortedWorks = plan.works.slice().sort((a, b) => a.identityKey.localeCompare(b.identityKey))
  for (const w of sortedWorks) {
    const tl = (w.title || '').toLowerCase()
    if (tl && !byTitleLc.has(tl)) byTitleLc.set(tl, w)
    if (!byNorm.has(w.normTitle)) byNorm.set(w.normTitle, w)
  }
  const seen = new Set()
  for (const e of plan.aliases) {
    const aliasNorm = normTitleIndex(e.alias)
    if (!aliasNorm) continue
    const properNorm = normTitleIndex(e.proper)
    const target =
      byTitleLc.get((e.proper || '').toLowerCase()) || byNorm.get(properNorm) || byNorm.get(aliasNorm) || null
    if (!target) { report.aliasesUnmatched++; continue }
    if (aliasNorm === target.normTitle) { report.aliasesIdentitySkipped++; continue }
    if (seen.has(aliasNorm)) continue
    seen.add(aliasNorm)
    report.aliasesSeeded++
  }
  report.inserted.aliases = report.aliasesSeeded
  return report
}

// Drain naturally rather than process.exit() so undici keep-alive sockets close
// cleanly on Windows (same reasoning as scripts/repertoire-upload.js).
main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((e) => {
    if (e instanceof ExitSignal) {
      process.exitCode = e.code
      return
    }
    if (e instanceof UserError) {
      console.error(`\n${e.message}`)
    } else {
      console.error('\nUnexpected error:', e)
    }
    process.exitCode = 1
  })
