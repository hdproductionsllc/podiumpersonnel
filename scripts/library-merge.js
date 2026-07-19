/**
 * library-merge.js — stitch split Naughtin arrangements back into one entry.
 *
 * Many quintet arrangements (string quartet + double bass) were imported as TWO
 * repertoire rows because the titles didn't match: one row got the 4 string parts
 * ("Autumn (The Four Seasons)"), the other got just the bass + score ("Autumn").
 * This merges the bass/score INTO the complete row, so each song is one entry with
 * all its parts. A quartet plays vln1/vln2/vla/vc; a quintet adds the bass. Nothing
 * is discarded — this COMPLETES arrangements, it doesn't remove music.
 *
 * Pairs come from scripts/repertoire-out/fragment-review-data.json (tier "high":
 * the fragment's title is fully contained in the complete work's title).
 *
 *   node scripts/library-merge.js              # dry-run: show every before/after (default)
 *   node scripts/library-merge.js --apply      # move parts, archive the emptied stub (asks first)
 *   node scripts/library-merge.js --apply --yes
 *   node scripts/library-merge.js --undo <scripts/repertoire-out/merge-undo-*.json>
 *
 * Safety: dry-run first. On --apply it writes an undo map (every moved part + the
 * stub it came from) so a merge is fully reversible. A stub is only archived after
 * we confirm it isn't referenced by any confirmed book.
 */
'use strict'
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const ROOT = path.join(__dirname, '..')
const ORG = '6edbf230-e43a-42c0-a60d-8cd67be87276' // Project String Quartet (shared library)
const PAIRS = path.join(ROOT, 'scripts', 'repertoire-out', 'fragment-review-data.json')
const QUARTET = ['vln1', 'vln2', 'vla', 'vc']

function rest() {
  const t = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  return {
    base: t.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim().replace(/\/$/, ''),
    headers: { apikey: t.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim(), Authorization: 'Bearer ' + t.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim() },
  }
}
const R = rest()
const api = (p, opt) => fetch(R.base + '/rest/v1/' + p, { ...opt, headers: { ...R.headers, ...(opt && opt.headers) } })
const get = (p) => api(p).then((r) => r.json())

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((r) => rl.question(q, (a) => { rl.close(); r(a) }))
}

async function loadParts() {
  const rows = []
  for (let f = 0; ; f += 1000) {
    const r = await get(`repertoire_parts?organization_id=eq.${ORG}&select=id,repertoire_id,part,substitute,played_on&limit=1000&offset=${f}`)
    rows.push(...r); if (r.length < 1000) break
  }
  const by = new Map()
  for (const p of rows) { if (!by.has(p.repertoire_id)) by.set(p.repertoire_id, []); by.get(p.repertoire_id).push(p) }
  return by
}

async function resolveComplete(title, byRep) {
  const ws = await get(`repertoire?organization_id=eq.${ORG}&title=eq.${encodeURIComponent(title)}&is_active=is.true&select=id,title,ensemble`)
  const complete = ws.filter((w) => QUARTET.every((r) => (byRep.get(w.id) || []).map((p) => p.part).includes(r)))
  return complete.length === 1 ? complete[0] : null // ambiguous / none → skip (needs a human)
}

async function usedInBook(repId) {
  const r = await get(`intake_songs?matched_repertoire_id=eq.${repId}&select=id&limit=1`)
  return Array.isArray(r) && r.length > 0
}

async function buildPlan(byRep) {
  const highs = JSON.parse(fs.readFileSync(PAIRS, 'utf8')).filter((d) => d.tier === 'high')
  const plan = [], skipped = []
  for (const d of highs) {
    const comp = await resolveComplete(d.match, byRep)
    if (!comp) { skipped.push({ d, why: 'complete title ambiguous or not fully complete — needs a look' }); continue }
    const fragParts = byRep.get(d.id) || []
    const compRoles = new Set((byRep.get(comp.id) || []).map((p) => p.part))
    const move = fragParts.filter((p) => !compRoles.has(p.part)) // don't duplicate a role the complete already has
    const dropDup = fragParts.filter((p) => compRoles.has(p.part)) // e.g. a second score
    plan.push({ frag: { id: d.id, title: d.title }, comp, move, dropDup,
      before: [...compRoles], after: [...new Set([...compRoles, ...move.map((p) => p.part)])] })
  }
  return { plan, skipped }
}

function fmtRoles(roles) {
  return roles.slice().sort().map((r) => (r === 'bass' ? 'bass(quintet)' : r)).join(', ')
}

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const yes = args.includes('--yes')
  const undoIdx = args.indexOf('--undo')

  if (undoIdx !== -1) {
    const map = JSON.parse(fs.readFileSync(args[undoIdx + 1], 'utf8'))
    for (const m of map.moves) {
      await api(`repertoire_parts?id=eq.${m.partId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repertoire_id: m.fromRep }) })
    }
    for (const id of map.archived) {
      await api(`repertoire?id=eq.${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: true }) })
    }
    for (const a of map.aliasRepoints || []) {
      await api(`title_aliases?organization_id=eq.${ORG}&alias_norm=eq.${encodeURIComponent(a.alias_norm)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repertoire_id: a.fromRep }) })
    }
    console.log(`✓ undone: ${map.moves.length} parts moved back, ${map.archived.length} stubs reactivated, ${(map.aliasRepoints || []).length} aliases restored.`)
    return
  }

  const byRep = await loadParts()
  const { plan, skipped } = await buildPlan(byRep)

  console.log(`\nMerge plan — ${plan.length} split arrangements to stitch back together`)
  const withBass = plan.filter((p) => p.move.some((m) => m.part === 'bass')).length
  console.log(`  ${withBass} restore a double-bass part (quintet-capable); ${skipped.length} skipped for review\n`)
  for (const p of plan) {
    console.log(`• ${p.comp.title}`)
    console.log(`    before: {${fmtRoles(p.before)}}`)
    console.log(`    + from stub "${p.frag.title}": {${fmtRoles(p.move.map((m) => m.part))}}` + (p.dropDup.length ? `  (dropping duplicate ${p.dropDup.map((m) => m.part).join(',')})` : ''))
    console.log(`    after:  {${fmtRoles(p.after)}}  ← quartet uses vln1/vln2/vla/vc, quintet adds bass`)
  }
  if (skipped.length) {
    console.log(`\nSkipped (need a human — not auto-merged):`)
    for (const s of skipped) console.log(`  - "${s.d.title}" → ${s.d.match}: ${s.why}`)
  }

  if (!apply) {
    console.log(`\n(dry-run — nothing moved. Re-run with --apply to merge the ${plan.length} above.)`)
    return
  }
  if (!plan.length) { console.log('\nNothing to merge.'); return }
  if (!yes) {
    const a = (await ask(`\nMerge these ${plan.length} arrangements (reversible)? [y/N] `)).trim().toLowerCase()
    if (a !== 'y' && a !== 'yes') { console.log('No changes made.'); return }
  }

  const undo = { moves: [], archived: [], aliasRepoints: [], at: 'run' }
  let merged = 0, guarded = 0
  for (const p of plan) {
    // safety: never archive a stub that a confirmed book points at
    if (await usedInBook(p.frag.id)) { guarded++; console.log(`  ⚠ skipped "${p.frag.title}" — it's referenced by a book; left as-is`); continue }
    for (const m of p.move) {
      const res = await api(`repertoire_parts?id=eq.${m.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repertoire_id: p.comp.id }) })
      if (!res.ok) { console.error(`  ✗ move failed for ${p.frag.title} ${m.part}: ${res.status}`); continue }
      undo.moves.push({ partId: m.id, fromRep: p.frag.id, part: m.part })
    }
    await api(`repertoire?id=eq.${p.frag.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: false }) })
    undo.archived.push(p.frag.id)
    // Repoint any aliases from the archived stub to the merged target, so no alias
    // is ever orphaned onto an archived work (the class of bug that broke book
    // building). Recorded for undo.
    const stubAliases = await get(`title_aliases?organization_id=eq.${ORG}&repertoire_id=eq.${p.frag.id}&select=alias_norm`)
    if (Array.isArray(stubAliases) && stubAliases.length) {
      await api(`title_aliases?organization_id=eq.${ORG}&repertoire_id=eq.${p.frag.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repertoire_id: p.comp.id }) })
      for (const a of stubAliases) undo.aliasRepoints.push({ alias_norm: a.alias_norm, fromRep: p.frag.id })
      console.log(`    ↦ repointed ${stubAliases.length} alias(es) → ${p.comp.title}`)
    }
    merged++
  }
  const undoPath = path.join(ROOT, 'scripts', 'repertoire-out', 'merge-undo.json')
  fs.writeFileSync(undoPath, JSON.stringify(undo, null, 2))
  console.log(`\n✓ merged ${merged} arrangements (${undo.moves.length} parts moved${guarded ? `, ${guarded} guarded` : ''}). Undo: node scripts/library-merge.js --undo ${undoPath}`)
}

main().catch((e) => { console.error('Error:', e); process.exitCode = 1 })
