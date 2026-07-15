/**
 * Absorb the old Mac system's remaining knowledge into the live DB (idempotent):
 *  1. Seed the 9 client-list title bridges from gig_compiler/title_aliases.py
 *     into title_aliases (targets found by norm_title, org-scoped).
 *  2. Backfill repertoire.artist (NULL only — never overwrites) from the
 *     MANUAL_ARTISTS dictionary in artist_lookup_manual.py.
 *  3. Triage report for aliases whose targets can't be found (library gaps).
 *
 * Run: PODIUM_ORG_ID=<uuid> node scripts/repertoire-absorb-knowledge.js [--dry-run]
 * Writes: scripts/repertoire-out/absorb-report.md
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const MC = path.join(ROOT, 'Music Compiler Local System', 'Music Compiler')

// Reuse the shipping normalizer so alias_norm matches exactly what the matcher uses.
const { normTitle } = require(path.join(ROOT, 'src', 'lib', 'intake', 'normalize.ts'))

function env(k) {
  const text = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  const m = text.match(new RegExp(k + '=(.+)'))
  if (!m) throw new Error(`${k} not in .env.local`)
  return m[1].trim()
}

const URL = env('NEXT_PUBLIC_SUPABASE_URL')
const KEY = env('SUPABASE_SERVICE_ROLE_KEY')
const ORG = process.env.PODIUM_ORG_ID
const DRY = process.argv.includes('--dry-run')
if (!ORG) { console.error('Set PODIUM_ORG_ID'); process.exit(1) }

const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function rest(pathq, init) {
  const res = await fetch(`${URL}/rest/v1/${pathq}`, { headers: HEADERS, ...init })
  const text = await res.text()
  if (!res.ok) throw new Error(`${pathq}: HTTP ${res.status} ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}

async function selectAll(table, cols, filter = '') {
  const out = []
  for (let from = 0; ; from += 1000) {
    const page = await rest(`${table}?select=${cols}&organization_id=eq.${ORG}${filter}&order=id&limit=1000&offset=${from}`)
    out.push(...page)
    if (page.length < 1000) break
  }
  return out
}

/** Parse the python dict `_RAW_ALIASES = { "k": "v", ... }` from title_aliases.py */
function parseClientAliases() {
  const src = fs.readFileSync(path.join(MC, 'gig_compiler', 'title_aliases.py'), 'utf8')
  const body = src.match(/_RAW_ALIASES\s*=\s*\{([\s\S]*?)\}/)[1]
  const out = []
  for (const m of body.matchAll(/"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
    out.push({ alias: m[1].replace(/\\"/g, '"'), target: m[2].replace(/\\"/g, '"') })
  }
  return out
}

/** Parse MANUAL_ARTISTS = { "norm key": ("Proper Title", "Artist"), ... } */
function parseManualArtists() {
  const src = fs.readFileSync(path.join(MC, 'artist_lookup_manual.py'), 'utf8')
  const out = []
  for (const m of src.matchAll(/"((?:[^"\\]|\\.)*)"\s*:\s*\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)/g)) {
    out.push({ key: m[1], properTitle: m[2], artist: m[3].replace(/\\"/g, '"') })
  }
  return out
}

;(async () => {
  const report = ['# Absorb report — ' + new Date().toISOString(), '']
  const works = await selectAll('repertoire', 'id,title,artist,ensemble,norm_title')
  const aliases = await selectAll('title_aliases', 'alias_norm,repertoire_id')
  const aliasSet = new Set(aliases.map((a) => a.alias_norm))
  const byNorm = new Map()
  for (const w of works) {
    if (!byNorm.has(w.norm_title)) byNorm.set(w.norm_title, [])
    byNorm.get(w.norm_title).push(w)
  }
  console.log(`org works: ${works.length}, existing aliases: ${aliases.length}${DRY ? ' [DRY RUN]' : ''}`)

  // ---- 1. client-list bridges --------------------------------------------
  report.push('## Client-list aliases (gig_compiler/title_aliases.py)')
  let seeded = 0, skipped = 0
  const orphanBridges = []
  for (const { alias, target } of parseClientAliases()) {
    const aliasNorm = normTitle(alias)
    const targets = byNorm.get(normTitle(target)) || []
    if (targets.length === 0) {
      orphanBridges.push({ alias, target })
      report.push(`- ✗ "${alias}" → "${target}" — NO TARGET in library (gap)`)
      continue
    }
    if (aliasSet.has(aliasNorm) || aliasNorm === targets[0].norm_title) {
      skipped++
      report.push(`- ○ "${alias}" — already covered`)
      continue
    }
    if (!DRY) {
      await rest('title_aliases', {
        method: 'POST',
        body: JSON.stringify([{ organization_id: ORG, alias_norm: aliasNorm, repertoire_id: targets[0].id }]),
      })
    }
    seeded++
    report.push(`- ✓ "${alias}" → "${targets[0].title}" (${targets[0].ensemble})`)
  }
  console.log(`client bridges: seeded ${seeded}, skipped ${skipped}, orphaned ${orphanBridges.length}`)

  // ---- 2. artist backfill --------------------------------------------------
  report.push('', '## Artist backfill (MANUAL_ARTISTS → repertoire.artist, NULL only)')
  const manual = parseManualArtists()
  const manualByNorm = new Map()
  for (const e of manual) {
    manualByNorm.set(normTitle(e.properTitle), e)
    manualByNorm.set(normTitle(e.key), e)
  }
  let filled = 0, unmatched = 0
  for (const w of works) {
    if (w.artist) continue
    const hit = manualByNorm.get(w.norm_title)
    if (!hit || !hit.artist) { unmatched++; continue }
    if (!DRY) {
      await rest(`repertoire?id=eq.${w.id}&organization_id=eq.${ORG}&artist=is.null`, {
        method: 'PATCH',
        body: JSON.stringify({ artist: hit.artist }),
      })
    }
    filled++
    report.push(`- ✓ "${w.title}" (${w.ensemble}) → artist "${hit.artist}"`)
  }
  const stillBlank = works.filter((w) => !w.artist).length - filled
  console.log(`artist backfill: filled ${filled}, still blank ${stillBlank}`)
  report.push(`', 'filled: ${filled}; still blank after backfill: ${stillBlank}`)

  // ---- 3. orphan alias triage (manual dict entries with no target) ---------
  report.push('', '## Orphan manual-dictionary aliases (no matching work — likely library gaps)')
  let orphans = 0
  for (const e of manual) {
    const keyNorm = normTitle(e.key)
    const titleNorm = normTitle(e.properTitle)
    if (keyNorm !== titleNorm && !byNorm.has(titleNorm) && !aliasSet.has(keyNorm)) {
      orphans++
      report.push(`- "${e.key}" → "${e.properTitle}" (${e.artist || 'no artist'})`)
    }
  }
  console.log(`orphan dictionary aliases (for David's review): ${orphans}`)

  fs.writeFileSync(path.join(ROOT, 'scripts', 'repertoire-out', 'absorb-report.md'), report.join('\n'))
  console.log('report -> scripts/repertoire-out/absorb-report.md')
})().catch((e) => { console.error(e.message); process.exit(1) })
