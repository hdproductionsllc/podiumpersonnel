/**
 * library-audit.js — find duplicate arrangements + unusable fragments in the
 * music library, and (with --apply) ARCHIVE the ones you don't want.
 *
 * "Archive" = set repertoire.is_active = false. The row and its PDFs stay in
 * place; the work simply stops appearing in the book-builder search + matcher
 * (both already filter is_active=true). Fully reversible: --restore flips it back.
 *
 * This is READ-ONLY by default: it writes a review report and changes NOTHING.
 * You review the report, then run with --apply to archive the recommended set.
 *
 *   node scripts/library-audit.js                 # report only (default)
 *   node scripts/library-audit.js --apply         # archive the recommended works (asks first)
 *   node scripts/library-audit.js --apply --yes   # archive without the prompt
 *   node scripts/library-audit.js --restore <id>  # un-archive one work by id
 *
 * Recommendation policy (conservative — only the safe, obvious ones are auto-picked):
 *   ARCHIVE  a FRAGMENT (only bass/score, no playable vln1/vln2/vla/vc) — can't
 *            build a quartet from it. Doubly safe when a COMPLETE work of the same
 *            title exists.
 *   KEEP     the most-complete arrangement in each same-title group.
 *   REVIEW   anything ambiguous (two complete arrangements; mixed "other" parts) —
 *            never auto-archived; left for a human decision.
 */
'use strict'

const fs = require('fs')
const path = require('path')
const readline = require('readline')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'scripts', 'repertoire-out', 'library-audit.md')
const LIBRARY_ORG = '6edbf230-e43a-42c0-a60d-8cd67be87276' // Project String Quartet (shared library)
const CORE = ['vln1', 'vln2', 'vla', 'vc']

function loadEnv() {
  const file = path.join(ROOT, '.env.local')
  const text = fs.readFileSync(file, 'utf8')
  const url = text.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
  const key = text.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
  return { base: url.replace(/\/$/, ''), headers: { apikey: key, Authorization: 'Bearer ' + key } }
}

async function selectAll(rest, table, cols, org) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${rest.base}/rest/v1/${table}?organization_id=eq.${org}&select=${cols}`, {
      headers: { ...rest.headers, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' },
    })
    if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`)
    const page = await res.json()
    rows.push(...page)
    if (page.length < 1000) break
  }
  return rows
}

// A loose "same song" key: title normalized hard (drop a leading composer surname
// prefix like "Handel " and a trailing "in D"/"Viola" qualifier) + artist. This is
// only used to GROUP likely-duplicates for a human to review — never to auto-merge.
function songKey(title, artist) {
  let t = String(title || '').toLowerCase()
  t = t.replace(/\b(in|en)\s+[a-g](\s+(major|minor|sharp|flat))?\b/g, ' ') // "in D", "in F major"
  t = t.replace(/\b(viola|violin|cello|score|bass|quartet|quintet|trio|duo)\b/g, ' ')
  t = t.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  const a = String(artist || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  // artist surname (last token) helps bridge "Handel" vs "George Frideric Handel"
  const surname = a.split(' ').filter(Boolean).pop() || ''
  return `${t}|${surname}`
}

function classify(parts) {
  const set = parts.slice().sort()
  const core = CORE.filter((c) => parts.includes(c))
  const playable = parts.filter((p) => !['score', 'bass'].includes(p))
  const counts = {}
  parts.forEach((p) => (counts[p] = (counts[p] || 0) + 1))
  const hasDup = Object.values(counts).some((c) => c > 1)
  const hasOther = parts.includes('other')
  let status
  if (playable.length === 0) status = 'fragment' // only bass/score → unusable
  else if (core.length === 4 && !hasOther && !hasDup) status = 'complete'
  else if (hasOther || hasDup) status = 'mixed'
  else status = 'partial'
  return { status, set, coreCount: core.length }
}

function parseArgs(argv) {
  const o = { apply: false, yes: false, restore: null }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--apply') o.apply = true
    else if (a === '--yes' || a === '-y') o.yes = true
    else if (a === '--restore') o.restore = argv[++i]
  }
  return o
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((r) => rl.question(q, (a) => { rl.close(); r(a) }))
}

async function main() {
  const opts = parseArgs(process.argv)
  const rest = loadEnv()

  if (opts.restore) {
    const res = await fetch(`${rest.base}/rest/v1/repertoire?id=eq.${opts.restore}`, {
      method: 'PATCH',
      headers: { ...rest.headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ is_active: true }),
    })
    const row = await res.json()
    console.log(res.ok ? `✓ restored: ${JSON.stringify(row[0]?.title)}` : `✗ ${JSON.stringify(row)}`)
    return
  }

  const reps = await selectAll(rest, 'repertoire', 'id,title,artist,ensemble,is_active', LIBRARY_ORG)
  const parts = await selectAll(rest, 'repertoire_parts', 'repertoire_id,part', LIBRARY_ORG)
  const byRep = new Map()
  for (const p of parts) {
    if (!byRep.has(p.repertoire_id)) byRep.set(p.repertoire_id, [])
    byRep.get(p.repertoire_id).push(p.part)
  }

  // Annotate every ACTIVE work.
  const works = reps
    .filter((w) => w.is_active !== false)
    .map((w) => {
      const ps = byRep.get(w.id) || []
      const c = classify(ps)
      return { ...w, parts: ps, ...c, key: songKey(w.title, w.artist) }
    })

  // Group by loose song key to find duplicate arrangements.
  const groups = new Map()
  for (const w of works) {
    if (!groups.has(w.key)) groups.set(w.key, [])
    groups.get(w.key).push(w)
  }

  const recommendArchive = [] // {work, reason}
  const reviewGroups = [] // groups needing a human call
  for (const [, members] of groups) {
    const complete = members.filter((m) => m.status === 'complete')
    const fragments = members.filter((m) => m.status === 'fragment')
    if (members.length > 1 && complete.length >= 1 && fragments.length >= 1) {
      // Clear win: keep the complete one(s), archive the fragment(s).
      for (const f of fragments) recommendArchive.push({ work: f, reason: `duplicate of complete "${complete[0].title}"` })
    }
    if (complete.length >= 2 || (members.length > 1 && complete.length === 0)) {
      reviewGroups.push(members) // 2+ complete arrangements, or a cluster with none complete
    }
  }
  // Fragments with NO complete sibling anywhere: unusable as a quartet on their own.
  const fragmentIds = new Set(recommendArchive.map((r) => r.work.id))
  const lonelyFragments = works.filter((w) => w.status === 'fragment' && !fragmentIds.has(w.id))

  // ---- write report ----
  let md = `# Library cleanup audit\n\nActive works: ${works.length}\n`
  md += `- complete quartets: ${works.filter((w) => w.status === 'complete').length}\n`
  md += `- fragments (bass/score only): ${works.filter((w) => w.status === 'fragment').length}\n`
  md += `- mixed (duplicate/"other" parts): ${works.filter((w) => w.status === 'mixed').length}\n`
  md += `- partial: ${works.filter((w) => w.status === 'partial').length}\n\n`

  md += `## Recommended to ARCHIVE — ${recommendArchive.length} fragments that duplicate a complete arrangement\n\n`
  for (const r of recommendArchive) md += `- \`${r.work.id}\` "${r.work.title}" [${r.work.ensemble}] {${r.work.set.join(',')}} — ${r.reason}\n`

  md += `\n## Also unusable — ${lonelyFragments.length} fragments with NO complete sibling (bass/score only)\n`
  md += `_(archiving these hides an unusable entry; the score PDF stays. Not auto-archived — your call.)_\n\n`
  for (const w of lonelyFragments) md += `- \`${w.id}\` "${w.title}" [${w.ensemble}] {${w.set.join(',')}}\n`

  md += `\n## REVIEW — ${reviewGroups.length} groups with two+ arrangements (pick which to keep)\n\n`
  for (const g of reviewGroups) {
    md += `- **${g[0].title}** / ${g[0].artist}:\n`
    for (const m of g) md += `    - \`${m.id}\` [${m.ensemble}] ${m.status} {${m.set.join(',')}}\n`
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, md)

  console.log(`\nLibrary cleanup audit — ${works.length} active works`)
  console.log(`  complete: ${works.filter((w) => w.status === 'complete').length}   fragments: ${works.filter((w) => w.status === 'fragment').length}   mixed: ${works.filter((w) => w.status === 'mixed').length}`)
  console.log(`\n  ✓ ${recommendArchive.length} fragments recommended to archive (a complete version already exists)`)
  console.log(`  • ${lonelyFragments.length} more fragments are unusable but have no complete sibling (your call)`)
  console.log(`  • ${reviewGroups.length} groups have 2+ real arrangements — need your pick`)
  console.log(`\n  full report → ${OUT}`)

  if (!opts.apply) {
    console.log(`\n(report only — nothing changed. Re-run with --apply to archive the ${recommendArchive.length} recommended fragments.)`)
    return
  }

  if (recommendArchive.length === 0) {
    console.log('\nNothing in the auto-recommended set. Review the report for the judgment-call groups.')
    return
  }
  if (!opts.yes) {
    const a = (await ask(`\nArchive the ${recommendArchive.length} recommended fragments (reversible)? [y/N] `)).trim().toLowerCase()
    if (a !== 'y' && a !== 'yes') { console.log('No changes made.'); return }
  }
  const ids = recommendArchive.map((r) => r.work.id)
  let done = 0
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const inList = chunk.map((id) => `"${id}"`).join(',')
    const res = await fetch(`${rest.base}/rest/v1/repertoire?id=in.(${inList})`, {
      method: 'PATCH',
      headers: { ...rest.headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ is_active: false }),
    })
    if (!res.ok) { console.error(`✗ archive chunk failed: ${res.status} ${await res.text()}`); process.exitCode = 1; return }
    done += (await res.json()).length
  }
  console.log(`\n✓ archived ${done} fragments (is_active=false). Reversible: node scripts/library-audit.js --restore <id>`)
}

main().catch((e) => { console.error('Error:', e); process.exitCode = 1 })
