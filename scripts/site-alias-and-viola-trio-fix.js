/**
 * site-alias-and-viola-trio-fix.js — two data fixes, one pass.
 *
 *   1. Add title_aliases for the spellings the brand websites advertise, so a
 *      client who types the site's title stops landing as a red row at intake.
 *   2. Re-file the seven true viola trios (vln1/vla/vc) from ensemble 'other'
 *      to 'viola-trio' so the matcher prefers them at a viola-trio gig.
 *
 *   node scripts/site-alias-and-viola-trio-fix.js            # dry run (default)
 *   node scripts/site-alias-and-viola-trio-fix.js --apply    # write
 *
 * Every read and write is scoped by organization_id. Nothing is ever deleted or
 * deactivated, and repertoire_parts is never touched. A backup of the rows about
 * to change is written under scripts/backups/ before any write.
 */
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const ORG = '6edbf230-e43a-42c0-a60d-8cd67be87276'
const BACKUP_DIR = path.join(ROOT, 'scripts', 'backups')

// --- normTitle: byte-for-byte port of src/lib/intake/normalize.ts -------------
function unifyQuotes(s) {
  return s.replace(/[‘’‛ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[]/g, '(')
}
const ENSEMBLE_WORDS = /\b(string\s+)?(quartet|quintet|trio|duo|duet|sextet)\b|\bvc\s+duo\b|\bstring\s+duo\b/gi
const VERSION_NOISE = /\b(v\d+|updated?|update\s+\w+\s*\d{0,4}|version|revised|slower|faster|easier|harder|old|too\s+hard|new\s+version|print(?:out)?|copy|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b/g
function normTitle(title) {
  let t = unifyQuotes(String(title || '')).toLowerCase()
  t = t.replace(/\(\s*\d+\s*\)/g, ' ')
  t = t.replace(ENSEMBLE_WORDS, ' ')
  t = t.replace(/-\s*0?\d+\b/g, ' ')
  t = t.replace(/\b(19|20)\d{2}\b/g, ' ')
  t = t.replace(VERSION_NOISE, ' ')
  t = t.replace(/['’`]/g, '')
  t = t.replace(/[^a-z0-9]+/g, ' ')
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

// --- REST helpers (from scripts/site-library-gap.js) --------------------------
function rest() {
  const text = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  const k = text.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
  return { base: text.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim().replace(/\/$/, ''), headers: { apikey: k, Authorization: 'Bearer ' + k } }
}
async function all(r, table, cols, extra = '') {
  const out = []
  for (let f = 0; ; f += 1000) {
    const res = await fetch(`${r.base}/rest/v1/${table}?organization_id=eq.${ORG}&select=${cols}${extra}`, { headers: { ...r.headers, Range: `${f}-${f + 999}`, 'Range-Unit': 'items' } })
    if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`)
    const p = await res.json(); out.push(...p); if (p.length < 1000) break
  }
  return out
}

// --- the two work lists -------------------------------------------------------
// website spelling -> exact library title
const ALIASES = [
  ['Christmastime Is Here', 'Christmas Time Is Here'],
  ["Golliwog's Cake-walk", "Golliwog's Cakewalk"],
  ["One Summer's Day", 'One Summers Day'],
  ['Rains of Castamere', 'Rain of Castamere (GoT)'],
  ['Traumerei', 'Traumeri'],
  ['Largo from Concerto for Two Violins', 'Largo from Double Violin Concerto'],
  ["Entr'acte to Act 3 of Carmen", "Entr'acte III"],
  ["Entr'acte to Act 4 of Carmen", "Entr'acte IV"],
  ['Married Life', 'Married Life from UP'],
  ['This Will Be (Everlasting Love)', 'This Will Be (An Everlasting Love)'],
]

const VIOLA_TRIOS = [
  'Air in F Viola',
  'Bourree in F Viola',
  'Hornpipe in D Viola',
  "Jesu Joy of Man's Desiring Viola",
  'Largo from Winter Viola',
  'Menuet in D Viola',
  'Panis Angelicus Viola',
]

const QUARTET = ['vln1', 'vln2', 'vla', 'vc']
const VIOLA_TRIO_PARTS = ['vln1', 'vla', 'vc']
const setEq = (a, b) => a.size === b.length && b.every((x) => a.has(x))

async function main() {
  const apply = process.argv.includes('--apply')
  const r = rest()

  const rep = await all(r, 'repertoire', 'id,title,artist,ensemble,norm_title,is_active,organization_id')
  const parts = await all(r, 'repertoire_parts', 'repertoire_id,part')
  const aliasRows = await all(r, 'title_aliases', 'id,organization_id,alias_norm,repertoire_id,created_at,updated_at')

  const partsOf = new Map()
  parts.forEach((p) => { if (!partsOf.has(p.repertoire_id)) partsOf.set(p.repertoire_id, new Set()); partsOf.get(p.repertoire_id).add(p.part) })
  const hasFullQuartet = (id) => QUARTET.every((p) => (partsOf.get(id) || new Set()).has(p))

  const ensembleCount = (rows) => rows.reduce((m, x) => { m[x.ensemble] = (m[x.ensemble] || 0) + 1; return m }, {})
  const beforeCounts = ensembleCount(rep)
  console.log(`\nrepertoire rows for org: ${rep.length}`)
  console.log(`ensemble counts BEFORE: ${JSON.stringify(beforeCounts)}`)
  console.log(`title_aliases rows for org: ${aliasRows.length}\n`)

  // ---------- TASK 1 plan ----------
  const existingAliasNorms = new Set(aliasRows.map((a) => a.alias_norm))
  const activeNorms = new Map()
  rep.filter((w) => w.is_active !== false).forEach((w) => { if (!activeNorms.has(w.norm_title)) activeNorms.set(w.norm_title, []); activeNorms.get(w.norm_title).push(w) })

  const aliasPlan = [], aliasSkips = []
  const seen = new Set()
  for (const [site, libTitle] of ALIASES) {
    const aliasNorm = normTitle(site)
    let cands = rep.filter((w) => w.title === libTitle)
    if (!cands.length) cands = rep.filter((w) => w.title.trim().toLowerCase() === libTitle.trim().toLowerCase())
    if (!cands.length) { aliasSkips.push({ site, target: libTitle, reason: 'no library row with that exact title' }); continue }

    const active = cands.filter((w) => w.is_active !== false)
    if (!active.length) { aliasSkips.push({ site, target: libTitle, reason: `${cands.length} row(s) found but none is_active` }); continue }

    let pick
    if (active.length === 1) {
      pick = active[0]
    } else {
      const full = active.filter((w) => hasFullQuartet(w.id))
      if (full.length === 1) pick = full[0]
      else {
        aliasSkips.push({
          site, target: libTitle,
          reason: `ambiguous: ${active.length} active rows, ${full.length} with a full quartet part set`,
          candidates: active.map((w) => ({ id: w.id, ensemble: w.ensemble, artist: w.artist, parts: [...(partsOf.get(w.id) || [])].sort() })),
        })
        continue
      }
    }

    if (!aliasNorm) { aliasSkips.push({ site, target: libTitle, reason: 'alias is empty after normalization' }); continue }
    if (aliasNorm === pick.norm_title) { aliasSkips.push({ site, target: libTitle, reason: `alias norm "${aliasNorm}" equals the target's norm_title — already exact-matches` }); continue }
    if (existingAliasNorms.has(aliasNorm) || seen.has(aliasNorm)) { aliasSkips.push({ site, target: libTitle, reason: `alias_norm "${aliasNorm}" already exists for this org` }); continue }
    const clash = activeNorms.get(aliasNorm)
    if (clash) { aliasSkips.push({ site, target: libTitle, reason: `alias_norm "${aliasNorm}" is another active work's norm_title (${clash.map((c) => c.title).join(', ')}) — exact tier would win`, }); continue }

    seen.add(aliasNorm)
    aliasPlan.push({ site, target: pick.title, aliasNorm, repertoire_id: pick.id, ensemble: pick.ensemble, parts: [...(partsOf.get(pick.id) || [])].sort() })
  }

  console.log('TASK 1 — aliases to insert:')
  aliasPlan.forEach((a) => console.log(`  "${a.site}"  →  norm "${a.aliasNorm}"  →  ${a.target} [${a.ensemble}] parts=${a.parts.join('/')}  (${a.repertoire_id})`))
  if (aliasSkips.length) { console.log('\n  skipped:'); aliasSkips.forEach((s) => console.log(`   - "${s.site}" → "${s.target}": ${s.reason}${s.candidates ? '\n       ' + s.candidates.map((c) => `${c.id} [${c.ensemble}] ${c.parts.join('/')}`).join('\n       ') : ''}`)) }

  // ---------- TASK 2 plan ----------
  const trioPlan = [], trioSkips = []
  for (const t of VIOLA_TRIOS) {
    const cands = rep.filter((w) => w.title === t)
    if (cands.length !== 1) { trioSkips.push({ title: t, reason: `${cands.length} rows with that exact title` }); continue }
    const w = cands[0]
    const have = partsOf.get(w.id) || new Set()
    if (w.ensemble !== 'other') { trioSkips.push({ title: t, reason: `ensemble is "${w.ensemble}", not "other"` }); continue }
    if (!setEq(have, VIOLA_TRIO_PARTS)) { trioSkips.push({ title: t, reason: `parts are {${[...have].sort().join(',')}}, not exactly {vln1,vla,vc}` }); continue }
    if (w.is_active === false) { trioSkips.push({ title: t, reason: 'row is not active' }); continue }
    trioPlan.push({ id: w.id, title: w.title, artist: w.artist, ensemble: w.ensemble, parts: [...have].sort() })
  }
  console.log('\nTASK 2 — rows to re-file as viola-trio:')
  trioPlan.forEach((w) => console.log(`  ${w.title}  [${w.ensemble} → viola-trio]  parts=${w.parts.join('/')}  (${w.id})`))
  if (trioSkips.length) { console.log('\n  skipped:'); trioSkips.forEach((s) => console.log(`   - ${s.title}: ${s.reason}`)) }

  // also list any OTHER rows already at viola-trio, for the before/after check
  const alreadyVT = rep.filter((w) => w.ensemble === 'viola-trio')
  console.log(`\n  rows already ensemble='viola-trio': ${alreadyVT.length}`)

  if (!apply) { console.log('\n(dry run — nothing written. Re-run with --apply.)\n'); return }

  // ---------- backup ----------
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(BACKUP_DIR, `alias-violatrio-${stamp}.json`)
  const targetIds = new Set(trioPlan.map((w) => w.id))
  fs.writeFileSync(backupPath, JSON.stringify({
    takenAt: new Date().toISOString(),
    organization_id: ORG,
    note: 'Pre-write snapshot for site-alias-and-viola-trio-fix.js',
    repertoire_row_count: rep.length,
    ensemble_counts_before: beforeCounts,
    title_aliases_before: aliasRows,
    repertoire_rows_before: rep.filter((w) => targetIds.has(w.id)),
    planned_alias_inserts: aliasPlan,
    planned_ensemble_updates: trioPlan,
  }, null, 2))
  console.log(`\n✓ backup written: ${backupPath}`)

  // ---------- write ----------
  if (aliasPlan.length) {
    const payload = aliasPlan.map((a) => ({ organization_id: ORG, alias_norm: a.aliasNorm, repertoire_id: a.repertoire_id }))
    const res = await fetch(`${r.base}/rest/v1/title_aliases`, { method: 'POST', headers: { ...r.headers, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(payload) })
    if (!res.ok) { console.error(`✗ alias insert failed: ${res.status} ${await res.text()}`); process.exitCode = 1; return }
    console.log(`✓ inserted ${(await res.json()).length} aliases`)
  }

  for (const w of trioPlan) {
    const res = await fetch(`${r.base}/rest/v1/repertoire?id=eq.${w.id}&organization_id=eq.${ORG}&ensemble=eq.other`, {
      method: 'PATCH', headers: { ...r.headers, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ ensemble: 'viola-trio' }),
    })
    if (!res.ok) { console.error(`✗ update failed for ${w.title}: ${res.status} ${await res.text()}`); process.exitCode = 1; return }
    const got = await res.json()
    console.log(`  ✓ ${w.title} → ${got[0] ? got[0].ensemble : '(no row returned!)'}`)
  }

  // ---------- verify ----------
  const rep2 = await all(r, 'repertoire', 'id,title,ensemble,norm_title,is_active')
  const alias2 = await all(r, 'title_aliases', 'alias_norm,repertoire_id')
  const afterCounts = ensembleCount(rep2)
  const byId = new Map(rep2.map((w) => [w.id, w]))
  const aliasByNorm = new Map(alias2.map((a) => [a.alias_norm, a.repertoire_id]))

  console.log('\n--- VERIFY ---')
  console.log(`repertoire rows: before ${rep.length} → after ${rep2.length}  ${rep.length === rep2.length ? 'UNCHANGED ✓' : 'CHANGED ✗'}`)
  console.log(`ensemble counts AFTER: ${JSON.stringify(afterCounts)}`)
  for (const [site, libTitle] of ALIASES) {
    const n = normTitle(site)
    const id = aliasByNorm.get(n)
    const row = id ? byId.get(id) : null
    const full = id ? hasFullQuartet(id) : false
    console.log(`  ${row ? '✓' : '✗'} "${site}" (norm "${n}") → ${row ? `${row.title} [${row.ensemble}] active=${row.is_active} fullQuartet=${full}` : `NOT PRESENT (intended target "${libTitle}")`}`)
  }
  const vt = rep2.filter((w) => w.ensemble === 'viola-trio')
  console.log(`\n  ensemble='viola-trio' rows now: ${vt.length}`)
  vt.forEach((w) => console.log(`    - ${w.title}`))

  // no other row's ensemble changed
  const beforeById = new Map(rep.map((w) => [w.id, w.ensemble]))
  const drift = rep2.filter((w) => beforeById.get(w.id) !== w.ensemble && !targetIds.has(w.id))
  console.log(`  unexpected ensemble changes outside the 7 targets: ${drift.length}${drift.length ? ' ✗ ' + drift.map((d) => d.title).join(', ') : ' ✓'}`)
  console.log(`\nbackup: ${backupPath}\n`)
}

main().catch((e) => { console.error('\nFailed:', e); process.exitCode = 1 })
