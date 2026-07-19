/**
 * update-library.js — the easy button for adding new sheet music to Podium.
 *
 * David drops new PDFs into the local library folder, runs this once, eyeballs the
 * list of songs it found, and confirms. It then makes them live in the shared
 * library (Project String Quartet, which every brand reads from).
 *
 * It is a thin, SAFE orchestrator over three existing, idempotent scripts:
 *   1. repertoire-index.js      — scan + classify every PDF (title/artist/part from filename)
 *   2. repertoire-db-import.js  — (dry-run) compute exactly which songs are NEW  ← the review gate
 *   3. repertoire-upload.js     — push new PDF bytes to R2 (content-addressed, dedup)
 *      repertoire-db-import.js  — (live) write the catalog rows
 *
 * "New" is decided by the PDF's sha256 fingerprint, not its guessed artist, so
 * re-running with nothing added reports 0 new and never creates duplicates.
 *
 * Usage:
 *   node scripts/update-library.js            # scan → review → confirm → go live
 *   node scripts/update-library.js --dry-run  # scan + review only, never writes
 *   node scripts/update-library.js --yes      # skip the confirmation prompt
 *   node scripts/update-library.js --org <uuid>
 *
 * Filenames are everything. Name each part:  Title - Artist - part.pdf
 *   parts: vln1  vln2  vla  vc   (trios = vln1/vln2/vc, no viola)
 *   e.g.   A Thousand Years - Christina Perri - vln1.pdf
 */
'use strict'

const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'scripts', 'repertoire-out')
const PLAN_PATH = path.join(OUT_DIR, 'update-library-plan.json')

// The one library every brand shares (organizations.library_org_id → this org).
const DEFAULT_LIBRARY_ORG = '6edbf230-e43a-42c0-a60d-8cd67be87276' // Project String Quartet

// ---------------------------------------------------------------------------
// args
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = { org: process.env.PODIUM_ORG_ID || DEFAULT_LIBRARY_ORG, yes: false, dryRun: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--yes' || a === '-y') opts.yes = true
    else if (a === '--dry-run' || a === '-n') opts.dryRun = true
    else if (a === '--org') opts.org = argv[++i]
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0) }
    else { console.error(`Unknown option: ${a}`); printHelp(); process.exit(1) }
  }
  return opts
}

function printHelp() {
  console.log(
    'Update Podium\'s music library from local PDFs.\n\n' +
      'Usage: node scripts/update-library.js [--dry-run] [--yes] [--org <uuid>]\n\n' +
      '  --dry-run   Scan and show what WOULD be added; never writes.\n' +
      '  --yes       Skip the confirmation prompt (go straight to live).\n' +
      '  --org       Library org id (default: Project String Quartet, the shared library).\n\n' +
      'Name each PDF:  Title - Artist - part.pdf   (parts: vln1 vln2 vla vc)',
  )
}

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------
const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
}

function runNode(scriptRel, args, { capture }) {
  const res = spawnSync(process.execPath, [path.join(ROOT, scriptRel), ...args], {
    cwd: ROOT,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    env: process.env,
  })
  if (capture) {
    return { code: res.status ?? 1, out: (res.stdout || '') + (res.stderr || '') }
  }
  return { code: res.status ?? 1, out: '' }
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a) }))
}

function fmtParts(parts) {
  const order = { vln1: 1, vln2: 2, vla: 3, vc: 4, bass: 5, score: 6, other: 7 }
  return [...new Set(parts)].sort((a, b) => (order[a] || 9) - (order[b] || 9)).join(', ')
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv)

  console.log(C.bold('\n♪ Podium — Update Music Library'))
  console.log(C.dim('  Shared library org: ' + opts.org))
  console.log(C.dim('  Source folder: Music Compiler Local System/Reorganized Music Library/'))

  // --- 1. scan ---
  process.stdout.write('\n1/3  Scanning your library for PDFs… ')
  const scan = runNode('scripts/repertoire-index.js', [], { capture: true })
  if (scan.code !== 0) {
    console.log(C.red('failed.'))
    console.error(scan.out.trim())
    process.exitCode = 1
    return
  }
  const fileCount = (scan.out.match(/files?\D+(\d[\d,]*)/i) || [])[1]
  console.log(C.green('done') + (fileCount ? C.dim(` (${fileCount} files)`) : ''))

  // --- 2. plan (the review gate) ---
  process.stdout.write('2/3  Working out what\'s new… ')
  const plan = runNode(
    'scripts/repertoire-db-import.js',
    ['--dry-run', '--org', opts.org, '--report', PLAN_PATH],
    { capture: true },
  )
  if (plan.code !== 0 || !fs.existsSync(PLAN_PATH)) {
    console.log(C.red('failed.'))
    console.error(plan.out.trim())
    process.exitCode = 1
    return
  }
  const report = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'))
  console.log(C.green('done'))

  if (report.tablesMissing) {
    console.log(
      C.red('\n  ✗ Could not reach the music database') +
        ' (missing Supabase credentials in .env.local, or migration 068 not applied).\n' +
        '    Nothing was changed. Fix the connection and try again.',
    )
    process.exitCode = 1
    return
  }

  const newWorks = report.newWorks || []
  const existing = report.skipped.repertoire || 0

  if (newWorks.length === 0) {
    console.log(
      C.green('\n✓ Your library is already up to date.') +
        C.dim(` No new songs found (${existing} already in the library).`),
    )
    console.log(
      C.dim(
        '\n  Nothing to add. If you expected new songs, check that the PDFs are inside\n' +
          '  the Reorganized Music Library folder and named "Title - Artist - part.pdf".',
      ),
    )
    return
  }

  // --- review table ---
  console.log(
    C.bold(`\nFound ${newWorks.length} new song${newWorks.length === 1 ? '' : 's'} to add`) +
      C.dim(`  (${existing} already in the library, left untouched)\n`),
  )
  const warnings = []
  const pad = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n))
  console.log(C.dim('  ' + pad('ENSEMBLE', 10) + pad('TITLE', 34) + pad('ARTIST', 22) + 'PARTS'))
  for (const w of newWorks) {
    const artist = w.artist || C.yellow('(no artist)')
    const flags = []
    if (!w.artist) flags.push('artist')
    if ((w.tags || []).includes('incomplete')) flags.push('incomplete')
    if ((w.tags || []).includes('needs-review')) flags.push('name')
    const mark = flags.length ? C.yellow(' ⚠') : ''
    console.log(
      '  ' + pad(w.ensemble, 10) + pad(w.title, 34) +
        pad(w.artist ? w.artist : '(no artist)', 22) + fmtParts(w.parts) + mark,
    )
    if (flags.length) warnings.push({ w, flags })
  }

  // --- warnings: things that won't register cleanly ---
  if (warnings.length) {
    console.log(C.yellow(`\n  ⚠ ${warnings.length} need a look before they'll be searchable by title/artist:`))
    for (const { w, flags } of warnings.slice(0, 20)) {
      const why = []
      if (flags.includes('artist')) why.push('no artist detected')
      if (flags.includes('incomplete')) why.push('missing some parts')
      if (flags.includes('name')) why.push('filename couldn\'t be parsed')
      console.log(
        C.dim(`    • "${w.title}" [${w.ensemble}] — ${why.join(', ')}\n` +
          `      files: ${(w.filenames || []).join(', ')}`),
      )
    }
    console.log(
      C.dim(
        '\n    Fix by renaming the file(s) to  "Title - Artist - part.pdf"  and re-running.\n' +
          '    (You can still add them now — they just won\'t match on artist until renamed.)',
      ),
    )
  }

  if (opts.dryRun) {
    console.log(C.dim('\n(dry-run — nothing was written. Re-run without --dry-run to go live.)'))
    return
  }

  // --- 3. confirm + go live ---
  if (!opts.yes) {
    const a = (await ask(C.bold(`\nAdd ${newWorks.length} song(s) to the shared library now? [y/N] `))).trim().toLowerCase()
    if (a !== 'y' && a !== 'yes') {
      console.log(C.dim('No changes made.'))
      return
    }
  }

  console.log('\n3/3  Uploading PDFs and updating the catalog…\n')
  const up = runNode('scripts/repertoire-upload.js', ['--org', opts.org], { capture: false })
  if (up.code !== 0) {
    console.log(C.red('\n✗ Upload failed — no catalog rows were written. Nothing is half-done: re-run to resume.'))
    process.exitCode = 1
    return
  }
  const imp = runNode('scripts/repertoire-db-import.js', ['--org', opts.org], { capture: false })
  if (imp.code !== 0) {
    console.log(C.red('\n✗ Catalog update reported errors — see the output above.'))
    process.exitCode = 1
    return
  }

  // read the live report for the real numbers
  let added = newWorks.length
  const liveReport = path.join(OUT_DIR, 'db-import-report.json')
  try {
    const r = JSON.parse(fs.readFileSync(liveReport, 'utf8'))
    added = r.inserted.repertoire
    console.log(
      C.green(`\n✓ Done — added ${added} song${added === 1 ? '' : 's'} `) +
        `(${r.inserted.parts} PDF part${r.inserted.parts === 1 ? '' : 's'}) to the shared library.`,
    )
  } catch {
    console.log(C.green(`\n✓ Done — new songs added to the shared library.`))
  }
  console.log(C.dim('  They\'re live now: every brand that shares this library can use them immediately.'))
}

main().catch((e) => {
  console.error('\nUnexpected error:', e)
  process.exitCode = 1
})
