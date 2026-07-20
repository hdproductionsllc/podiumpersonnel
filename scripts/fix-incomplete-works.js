/**
 * fix-incomplete-works.js — recover songs the sites advertise but Podium can't build.
 *
 * These looked like "missing parts". Almost none of them were: the music is on
 * disk, it was just filed wrong. Four distinct faults:
 *
 *   1. SPLIT     Lay Lady Lay / Say You Know each exist as TWO rows — one holding
 *                the cello, the other holding the rest — because one file was
 *                renamed to the "Title - Artist - part.pdf" convention and its
 *                siblings weren't. Same bug as Skyfall.
 *   2. MISLABEL  "Welcome To the Jungle" has the CELLO file stored as `vln2`, the
 *                viola as `other`, and the Violin I as a substitute. The engraver's
 *                "v2" filename suffix defeated the part detector, which read every
 *                file as "violin 2".
 *   3. WRONG TYPE "Erev Shel Shoshanim" is a full SCORE stored as `other`, so it
 *                counted as a fragment. As a score it is bookable — the players
 *                read scores off tablets (see isScoreOnly in the matcher).
 *   4. ARTIST    "Welcome To the Jungle" has the artist "Cello".
 *
 * EVIDENCE FOR THE MERGES (this is the part that matters):
 * Both groups were printed to PDF in a single sitting, seconds apart —
 *   Lay Lady Lay  2021-08-23 11:16:51 / 11:17:08 / 11:17:25 / 11:17:45
 *   Say You Know  2021-10-06 09:00:19 / 09:00:34 / 09:00:44 / 09:00:56
 * One arrangement, printed part by part. The lesson from the last merge pass was
 * never to move live parts on a title guess; PDF provenance is real evidence.
 *
 * NOT TOUCHED — deliberately:
 *   "Romeo and Juliet Theme" has files vc/vla/vln1 plus a bare "vln". That last is
 *   probably violin 2, but the PDFs are vector-drawn with no text and no embedded
 *   image, so there is no way to verify it here. Guessing would risk handing a
 *   violinist the wrong line. Open it and confirm, then it is a one-line change.
 *
 *   node scripts/fix-incomplete-works.js           # dry run
 *   node scripts/fix-incomplete-works.js --apply
 *   node scripts/fix-incomplete-works.js --undo
 */
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'scripts', 'repertoire-out', 'fix-incomplete-works-undo.json')
const ORG = '6edbf230-e43a-42c0-a60d-8cd67be87276'

function rest() {
  const text = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  return {
    base: text.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim().replace(/\/$/, ''),
    headers: {
      apikey: text.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim(),
      Authorization: 'Bearer ' + text.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim(),
      'Content-Type': 'application/json',
    },
  }
}
async function get(r, u) {
  const res = await fetch(`${r.base}/rest/v1/${u}`, { headers: r.headers })
  if (!res.ok) throw new Error(`GET ${u}: ${res.status} ${await res.text()}`)
  return res.json()
}
async function wr(r, m, u, b) {
  const res = await fetch(`${r.base}/rest/v1/${u}`, {
    method: m, headers: { ...r.headers, Prefer: 'return=representation' },
    body: b === undefined ? undefined : JSON.stringify(b),
  })
  if (!res.ok) throw new Error(`${m} ${u}: ${res.status} ${await res.text()}`)
  return res.json()
}

// --- part rows to re-point at a different work (the two split merges) ---------
const PART_MOVES = [
  // Lay Lady Lay: 3 parts -> the row that already holds the cello.
  { partId: '3ed36ec8-1953-46a7-8c12-a90e5f36cff4', to: '91d84e50-6693-48ca-8ba7-de704f1f38a1', part: 'vla' },
  { partId: '1f086542-41b1-40fe-bb0f-1c02c6368739', to: '91d84e50-6693-48ca-8ba7-de704f1f38a1', part: 'vln1' },
  { partId: '5605cb7d-b9c0-44d9-9753-f862a2a7f0e8', to: '91d84e50-6693-48ca-8ba7-de704f1f38a1', part: 'vln2' },
  // Say You Know: score+3 parts -> the row that already holds the cello.
  { partId: '6d2f9238-c7ef-49fc-8eab-6add57d0634b', to: '1025897b-58b0-43c6-a6f3-584a210fbab6', part: 'score' },
  { partId: '77aec884-5dd9-441e-aaba-c47e5ad2bf4b', to: '1025897b-58b0-43c6-a6f3-584a210fbab6', part: 'vla' },
  { partId: '06eb03b3-c4a9-4fa5-8d1c-f1ac846f4874', to: '1025897b-58b0-43c6-a6f3-584a210fbab6', part: 'vln1' },
  { partId: 'b14ac327-cef7-4666-89d6-7d6ca4839cc6', to: '1025897b-58b0-43c6-a6f3-584a210fbab6', part: 'vln2' },
]

// --- part rows whose LABEL is wrong (same work, no move) ----------------------
const RELABELS = [
  // Welcome To the Jungle — the filename says which instrument each one is.
  { partId: '5cc31930-ea6e-4ddf-b4ba-5c67dcf76b91', part: 'vc', substitute: false, played_on: null },   // Cello v2.pdf  (was vln2!)
  { partId: '87b27aad-2a99-4008-a0c0-da78cf45e0ff', part: 'vla', substitute: false, played_on: null },  // Viola v2.pdf
  { partId: 'd9fac1d1-31d9-4626-8750-dd21da4d4297', part: 'vln1', substitute: false, played_on: null }, // Violin I v2.pdf
  // Erev Shel Shoshanim — one PDF naming Violin I / Violin II / Viola = a score.
  { partId: 'f3cd481c-b64d-439d-82ea-81ec5210f8d8', part: 'score', substitute: false, played_on: null },
]

// --- work-level corrections ---------------------------------------------------
const WORKS = [
  { id: '91d84e50-6693-48ca-8ba7-de704f1f38a1', artist: 'Bob Dylan' },
  { id: '1025897b-58b0-43c6-a6f3-584a210fbab6', artist: 'Alina Baraz' },
  { id: 'c3684973-b53c-4fa4-bf1e-5128062eb012', artist: "Guns N' Roses" },
  { id: '12e8c9b4-6e7d-4ae2-84f2-6f6c24d11c37', title: 'Erev Shel Shoshanim', artist: 'Yosef Hadar' },
]

// Emptied by the merges — archived, never deleted; old names kept as aliases.
const ARCHIVE = [
  { id: 'aa4c7e61-3844-4b41-be8d-744e10d6b374', aliasTo: '91d84e50-6693-48ca-8ba7-de704f1f38a1' },
  { id: '13fdba62-08b5-454c-b27c-2038ec06c94b', aliasTo: '1025897b-58b0-43c6-a6f3-584a210fbab6' },
]
// So the corrected names match too.
const EXTRA_ALIASES = [
  { alias_norm: 'erev shel shoshanim', repertoire_id: '12e8c9b4-6e7d-4ae2-84f2-6f6c24d11c37' },
]

async function main() {
  const apply = process.argv.includes('--apply')
  if (process.argv.includes('--undo')) return rollback()
  const r = rest()

  const ids = [...new Set([...WORKS.map((w) => w.id), ...ARCHIVE.map((a) => a.id), ...PART_MOVES.map((m) => m.to)])]
  const works = await get(r, `repertoire?or=(${ids.map((i) => `id.eq.${i}`).join(',')})&select=id,title,artist,norm_title,is_active`)
  const byId = new Map(works.map((w) => [w.id, w]))
  const partIds = [...PART_MOVES.map((m) => m.partId), ...RELABELS.map((x) => x.partId)]
  const parts = await get(r, `repertoire_parts?or=(${partIds.map((i) => `id.eq.${i}`).join(',')})&select=id,repertoire_id,part,substitute,played_on,original_filename`)
  const partById = new Map(parts.map((p) => [p.id, p]))

  const undo = { partMoves: [], relabels: [], works: [], archives: [], aliases: [] }

  console.log('\n♪ Recovering incomplete works\n')
  console.log('MERGES (split arrangements — proven same source by PDF print timestamps):')
  for (const m of PART_MOVES) {
    const p = partById.get(m.partId)
    if (!p) throw new Error(`missing part ${m.partId}`)
    undo.partMoves.push({ partId: p.id, fromRepertoire: p.repertoire_id, fromPart: p.part, toRepertoire: m.to, toPart: m.part })
    console.log(`  ${p.original_filename}\n      -> "${byId.get(m.to).title}" as ${m.part}`)
  }
  console.log('\nRELABELS (right file, wrong label — no music moves between works):')
  for (const x of RELABELS) {
    const p = partById.get(x.partId)
    if (!p) throw new Error(`missing part ${x.partId}`)
    undo.relabels.push({ partId: p.id, from: { part: p.part, substitute: p.substitute, played_on: p.played_on }, to: { part: x.part, substitute: x.substitute, played_on: x.played_on } })
    const flag = p.part === 'vln2' && x.part === 'vc' ? '   <-- cello was labelled violin 2' : ''
    console.log(`  ${p.original_filename}\n      ${p.part}${p.substitute ? ' (sub)' : ''} -> ${x.part}${flag}`)
  }
  console.log('\nWORK CORRECTIONS:')
  for (const w of WORKS) {
    const cur = byId.get(w.id)
    undo.works.push({ id: w.id, from: { title: cur.title, artist: cur.artist } })
    console.log(`  "${cur.title}" / ${cur.artist || 'NULL'}  ->  "${w.title ?? cur.title}" / ${w.artist ?? cur.artist}`)
  }
  console.log('\nARCHIVED (emptied by a merge; reversible, old name kept as an alias):')
  for (const a of ARCHIVE) {
    const cur = byId.get(a.id)
    undo.archives.push({ id: a.id, title: cur.title })
    if (cur.norm_title) undo.aliases.push({ alias_norm: cur.norm_title, repertoire_id: a.aliasTo })
    console.log(`  "${cur.title}"  (alias "${cur.norm_title}" -> "${byId.get(a.aliasTo).title}")`)
  }
  undo.aliases.push(...EXTRA_ALIASES)

  if (!apply) { console.log('\n(dry run — nothing written. Re-run with --apply.)\n'); return }

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(undo, null, 2))

  for (const m of PART_MOVES) await wr(r, 'PATCH', `repertoire_parts?id=eq.${m.partId}`, { repertoire_id: m.to, part: m.part, substitute: false, played_on: null })
  for (const x of RELABELS) await wr(r, 'PATCH', `repertoire_parts?id=eq.${x.partId}`, { part: x.part, substitute: x.substitute, played_on: x.played_on })
  for (const w of WORKS) {
    const body = { artist: w.artist }
    if (w.title) body.title = w.title
    await wr(r, 'PATCH', `repertoire?id=eq.${w.id}`, body)
  }
  const existing = new Set((await get(r, `title_aliases?organization_id=eq.${ORG}&select=alias_norm`)).map((a) => a.alias_norm))
  const fresh = undo.aliases.filter((a) => !existing.has(a.alias_norm))
  if (fresh.length) await wr(r, 'POST', 'title_aliases', fresh.map((a) => ({ organization_id: ORG, ...a })))
  for (const a of ARCHIVE) await wr(r, 'PATCH', `repertoire?id=eq.${a.id}`, { is_active: false })

  console.log(`\n✓ moved ${PART_MOVES.length} parts, relabelled ${RELABELS.length}, fixed ${WORKS.length} works, added ${fresh.length} aliases, archived ${ARCHIVE.length}.`)
  console.log('  Undo: node scripts/fix-incomplete-works.js --undo\n')
}

async function rollback() {
  const r = rest()
  if (!fs.existsSync(OUT)) { console.error('No undo map.'); process.exitCode = 1; return }
  const u = JSON.parse(fs.readFileSync(OUT, 'utf8'))
  for (const a of u.archives) await wr(r, 'PATCH', `repertoire?id=eq.${a.id}`, { is_active: true })
  for (const m of u.partMoves) await wr(r, 'PATCH', `repertoire_parts?id=eq.${m.partId}`, { repertoire_id: m.fromRepertoire, part: m.fromPart })
  for (const x of u.relabels) await wr(r, 'PATCH', `repertoire_parts?id=eq.${x.partId}`, x.from)
  for (const w of u.works) await wr(r, 'PATCH', `repertoire?id=eq.${w.id}`, w.from)
  for (const a of u.aliases) await wr(r, 'DELETE', `title_aliases?organization_id=eq.${ORG}&alias_norm=eq.${encodeURIComponent(a.alias_norm)}`)
  fs.renameSync(OUT, OUT.replace('.json', '.rolled-back.json'))
  console.log('✓ rolled back.')
}

main().catch((e) => { console.error('\nFailed:', e.message); process.exitCode = 1 })
