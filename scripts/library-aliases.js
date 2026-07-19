/**
 * library-aliases.js — teach the matcher the short names of merged songs.
 *
 * After library-merge.js stitched split arrangements together, the winning entry
 * keeps the LONGER title ("Autumn (The Four Seasons)") and the short-name stub
 * ("Autumn") is archived. A client who types just "Autumn" would then only get a
 * fuzzy amber suggestion. This seeds a title_alias  short-name-norm → complete work
 * so the book-builder matches it GREEN (matcher alias tier, score 85).
 *
 *   node scripts/library-aliases.js           # dry-run (default): show what would be added
 *   node scripts/library-aliases.js --apply    # insert the aliases
 *   node scripts/library-aliases.js --undo <scripts/repertoire-out/alias-undo.json>
 *
 * Skips anything unsafe: an alias equal to the target's own norm, one that already
 * exists, or one that collides with a DIFFERENT active work's norm_title (the exact
 * tier would win there anyway, so the alias would be dead / ambiguous).
 */
'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const ORG = '6edbf230-e43a-42c0-a60d-8cd67be87276'
const PAIRS = path.join(ROOT, 'scripts', 'repertoire-out', 'fragment-review-data.json')
const UNDO = path.join(ROOT, 'scripts', 'repertoire-out', 'alias-undo.json')

// --- normTitle: byte-for-byte port of src/lib/intake/normalize.ts (the matcher folds queries this way) ---
function unifyQuotes(s) {
  return s.replace(/[‘’‛ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[]/g, '(')
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

function R() {
  const t = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  const k = t.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
  return { base: t.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim().replace(/\/$/, ''), headers: { apikey: k, Authorization: 'Bearer ' + k } }
}
const rest = R()
const api = (p, o) => fetch(rest.base + '/rest/v1/' + p, { ...o, headers: { ...rest.headers, ...(o && o.headers) } })
const get = (p) => api(p).then((r) => r.json())
async function all(table, cols) {
  const rows = []
  for (let f = 0; ; f += 1000) { const r = await get(`${table}?organization_id=eq.${ORG}&select=${cols}&limit=1000&offset=${f}`); rows.push(...r); if (r.length < 1000) break }
  return rows
}

async function main() {
  const args = process.argv.slice(2)
  const undoIdx = args.indexOf('--undo')
  if (undoIdx !== -1) {
    const map = JSON.parse(fs.readFileSync(args[undoIdx + 1], 'utf8'))
    for (const a of map.aliasNorms) await api(`title_aliases?organization_id=eq.${ORG}&alias_norm=eq.${encodeURIComponent(a)}`, { method: 'DELETE' })
    console.log(`✓ removed ${map.aliasNorms.length} aliases.`)
    return
  }
  const apply = args.includes('--apply')

  const works = (await all('repertoire', 'id,title,norm_title,is_active')).filter((w) => w.is_active !== false)
  const byTitle = new Map(works.map((w) => [w.title, w]))
  const activeNorms = new Set(works.map((w) => w.norm_title))
  const existingAliases = new Set((await all('title_aliases', 'alias_norm')).map((a) => a.alias_norm))

  const highs = JSON.parse(fs.readFileSync(PAIRS, 'utf8')).filter((d) => d.tier === 'high')
  const toAdd = [], skips = []
  const seen = new Set()
  for (const d of highs) {
    const comp = byTitle.get(d.match)
    const aliasNorm = normTitle(d.title)
    if (!comp) { skips.push(`${d.title}: complete "${d.match}" not active`); continue }
    if (!aliasNorm) { skips.push(`${d.title}: empty norm`); continue }
    if (aliasNorm === comp.norm_title) { skips.push(`${d.title}: alias == target norm (already exact-matches)`); continue }
    if (activeNorms.has(aliasNorm)) { skips.push(`${d.title}: "${aliasNorm}" is another active work's title — exact tier wins, alias skipped`); continue }
    if (existingAliases.has(aliasNorm) || seen.has(aliasNorm)) { skips.push(`${d.title}: alias "${aliasNorm}" already exists`); continue }
    seen.add(aliasNorm)
    toAdd.push({ alias_norm: aliasNorm, repertoire_id: comp.id, _from: d.title, _to: d.match })
  }

  console.log(`\nAlias plan — ${toAdd.length} short-name aliases to add, ${skips.length} skipped\n`)
  for (const a of toAdd) console.log(`  "${a._from}"  (norm "${a.alias_norm}")  →  ${a._to}`)
  if (skips.length) { console.log(`\n  skipped:`); for (const s of skips.slice(0, 40)) console.log(`   - ${s}`) }

  if (!apply) { console.log(`\n(dry-run — nothing added. Re-run with --apply.)`); return }
  if (!toAdd.length) { console.log('\nNothing to add.'); return }

  const payload = toAdd.map((a) => ({ organization_id: ORG, alias_norm: a.alias_norm, repertoire_id: a.repertoire_id }))
  const res = await api('title_aliases', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(payload) })
  if (!res.ok) { console.error(`✗ insert failed: ${res.status} ${await res.text()}`); process.exitCode = 1; return }
  const inserted = await res.json()
  fs.writeFileSync(UNDO, JSON.stringify({ aliasNorms: inserted.map((x) => x.alias_norm) }, null, 2))
  console.log(`\n✓ added ${inserted.length} aliases. Undo: node scripts/library-aliases.js --undo ${UNDO}`)
}

main().catch((e) => { console.error('Error:', e); process.exitCode = 1 })
