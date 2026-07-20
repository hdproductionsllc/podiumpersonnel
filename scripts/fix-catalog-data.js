/**
 * fix-catalog-data.js — repair customer-visible damage in the music library.
 *
 * Three kinds of damage, found by diffing our catalog against what's live on the
 * brand websites:
 *   1. MOJIBAKE   — "DvoraÌ€k Waltz", double-encoded UTF-8 baked into the title.
 *   2. APOSTROPHE — "Anna s Minuet", "The Lord s Prayer": the apostrophe was lost
 *                   when the work was imported from a filename.
 *   3. SWAPPED    — "Four Seasons" with the artist column holding "Spring Movement 1".
 *   4. SPLIT WORK — Skyfall exists as FOUR one-part works ("Skyfall Cello pdf", ...)
 *                   instead of one bookable quartet, so it can't be booked at all.
 *
 * THE SAFETY RULE — nothing that matched before may stop matching.
 *
 * Matching runs on `norm_title` and `title_aliases`, never on the display title.
 * So for renames this script changes ONLY the display `title`/`artist` and leaves
 * `norm_title` exactly as it is. Every old spelling keeps working untouched, and
 * we ADD an alias for each new spelling so the corrected name matches too. The
 * result is strictly more matchable than before — never less.
 *
 * The Skyfall merge is the one case that must move parts. It follows the existing
 * merge convention: parts are re-pointed at the keeper row, the emptied stubs are
 * ARCHIVED (is_active=false), never deleted, and every stub's old norm_title
 * becomes an alias so an old reference still resolves.
 *
 *   node scripts/fix-catalog-data.js            # dry run — shows every change
 *   node scripts/fix-catalog-data.js --apply    # write, with an undo map
 *   node scripts/fix-catalog-data.js --undo     # roll it all back
 *
 * Undo map: scripts/repertoire-out/fix-catalog-data-undo.json
 */
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'scripts', 'repertoire-out', 'fix-catalog-data-undo.json')
const ORG = '6edbf230-e43a-42c0-a60d-8cd67be87276'

function rest() {
  const text = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  const url = text.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim().replace(/\/$/, '')
  const key = text.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
  return {
    base: url,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
  }
}

/** The app's stored-title fold (src/lib/intake/normalize.ts normTitle), mirrored. */
function normTitle(title) {
  let t = String(title || '')
    .replace(/[‘’‛ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .toLowerCase()
  t = t.replace(/\(\s*\d+\s*\)/g, ' ')
  t = t.replace(/\b(string\s+)?(quartet|quintet|trio|duo|duet|sextet)\b/g, ' ')
  t = t.replace(/-\s*0?\d+\b/g, ' ')
  t = t.replace(/\b(19|20)\d{2}\b/g, ' ')
  t = t.replace(/['`]/g, '')
  t = t.replace(/[^a-z0-9]+/g, ' ')
  return t.replace(/\s+/g, ' ').trim()
}

/** Accent-stripped fold — what someone typing plain ASCII produces. */
function asciiFold(s) {
  return normTitle(String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''))
}

// --- renames: display text only. norm_title is deliberately NOT touched. ------
const RENAMES = [
  { id: 'bb2c098e-e5d0-44d5-9560-8e6094637034', title: 'Dvořák Waltz' },
  { id: '6b2ea4e3-e7cc-4b49-b1c6-f52481d14aee', title: 'Fauré Pavane' },
  { id: 'a91a3a34-83a5-4c00-aa31-c3aa05d46902', title: 'Schön Rosmarin' },
  { id: '0130442d-5eec-4775-beb4-d06d3452337d', title: "Anna's Minuet" },
  { id: '08d68eb4-96c1-4d72-bf8c-a5235d332580', title: "Entr'acte IV" },
  { id: '57fc14f1-8d29-424c-a256-37ef6136c0ea', title: "Rodger's Waltzes" },
  { id: '16efb8dd-081b-4170-aa74-38b6952db9d4', title: "The Lord's Prayer" },
  // Columns were swapped: the "artist" held the movement name.
  { id: '631dc909-13c1-460d-bcb6-a2519478f85b', title: 'Spring (The Four Seasons)', artist: 'Antonio Vivaldi' },
]

// --- Skyfall: four one-part works -> one bookable quartet ---------------------
const SKYFALL_KEEPER = 'bfaad860-c4fa-40ae-83e3-8d83e642b4d5' // "Skyfall Violin 1 pdf"
const SKYFALL_STUBS = [
  'f1d789cd-996c-4ef9-967c-0df79fc57e3f', // Cello
  '5511de96-b3bc-41bb-9c89-e3e4b223b045', // Viola
  'a9c00fa8-95d5-405c-b2a6-eff703e532b1', // Violin 2
]
/** Which instrument each source file actually is — from its explicit filename. */
const PART_FROM_FILENAME = [
  [/violin\s*1/i, 'vln1'],
  [/violin\s*2/i, 'vln2'],
  [/viola/i, 'vla'],
  [/cello|violoncello/i, 'vc'],
]

async function get(r, url) {
  const res = await fetch(`${r.base}/rest/v1/${url}`, { headers: r.headers })
  if (!res.ok) throw new Error(`GET ${url}: ${res.status} ${await res.text()}`)
  return res.json()
}
async function write(r, method, url, body) {
  const res = await fetch(`${r.base}/rest/v1/${url}`, {
    method,
    headers: { ...r.headers, Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${await res.text()}`)
  return res.json()
}

async function main() {
  const apply = process.argv.includes('--apply')
  const undo = process.argv.includes('--undo')
  const r = rest()

  if (undo) return rollback(r)

  const ids = [...RENAMES.map((x) => x.id), SKYFALL_KEEPER, ...SKYFALL_STUBS]
  const works = await get(r, `repertoire?or=(${ids.map((i) => `id.eq.${i}`).join(',')})&select=id,title,norm_title,artist,ensemble,is_active`)
  const byId = new Map(works.map((w) => [w.id, w]))
  const existingAliases = await get(r, `title_aliases?organization_id=eq.${ORG}&select=alias_norm,repertoire_id`)
  const aliasSet = new Set(existingAliases.map((a) => a.alias_norm))

  const plan = { renames: [], aliases: [], partMoves: [], archives: [] }

  // --- renames + the aliases that keep BOTH spellings matching ---
  for (const rn of RENAMES) {
    const w = byId.get(rn.id)
    if (!w) throw new Error(`missing work ${rn.id}`)
    plan.renames.push({
      id: w.id,
      from: { title: w.title, artist: w.artist },
      to: { title: rn.title, artist: rn.artist ?? w.artist },
      normTitleUnchanged: w.norm_title,
    })
    // Everything a human might type for the corrected name.
    for (const cand of [normTitle(rn.title), asciiFold(rn.title)]) {
      if (cand && cand !== w.norm_title && !aliasSet.has(cand)) {
        aliasSet.add(cand)
        plan.aliases.push({ alias_norm: cand, repertoire_id: w.id, why: `new spelling of "${rn.title}"` })
      }
    }
  }

  // --- Skyfall merge ---
  const keeper = byId.get(SKYFALL_KEEPER)
  const allSkyIds = [SKYFALL_KEEPER, ...SKYFALL_STUBS]
  const skyParts = await get(
    r,
    `repertoire_parts?or=(${allSkyIds.map((i) => `repertoire_id.eq.${i}`).join(',')})&select=id,repertoire_id,part,original_filename,sha256`
  )
  if (new Set(skyParts.map((p) => p.sha256)).size !== skyParts.length) {
    throw new Error('ABORT: Skyfall part files are not all distinct')
  }
  for (const p of skyParts) {
    const hit = PART_FROM_FILENAME.find(([re]) => re.test(p.original_filename))
    if (!hit) throw new Error(`ABORT: cannot tell which part "${p.original_filename}" is`)
    plan.partMoves.push({
      partId: p.id,
      file: p.original_filename,
      fromRepertoire: p.repertoire_id,
      toRepertoire: SKYFALL_KEEPER,
      fromPart: p.part,
      toPart: hit[1],
    })
  }
  const assigned = plan.partMoves.map((m) => m.toPart).sort()
  if (new Set(assigned).size !== 4) throw new Error(`ABORT: expected 4 distinct parts, got ${assigned.join(',')}`)

  plan.renames.push({
    id: SKYFALL_KEEPER,
    from: { title: keeper.title, artist: keeper.artist, norm_title: keeper.norm_title },
    to: { title: 'Skyfall', artist: 'Adele', norm_title: 'skyfall' },
    note: 'merged from 4 one-part works',
  })
  // Every stub's old name keeps resolving, and so does the keeper's.
  for (const id of allSkyIds) {
    const w = byId.get(id)
    if (w?.norm_title && !aliasSet.has(w.norm_title)) {
      aliasSet.add(w.norm_title)
      plan.aliases.push({ alias_norm: w.norm_title, repertoire_id: SKYFALL_KEEPER, why: `old name "${w.title}"` })
    }
  }
  for (const id of SKYFALL_STUBS) {
    plan.archives.push({ id, title: byId.get(id).title, reason: 'emptied by the Skyfall merge' })
  }

  // --- report ---
  console.log('\n♪ Catalog data fixes\n')
  console.log('RENAMES (display text only — norm_title untouched, so nothing stops matching):')
  for (const x of plan.renames) {
    console.log(`  "${x.from.title}"  ->  "${x.to.title}"`)
    if (x.to.artist !== x.from.artist) console.log(`      artist: "${x.from.artist}" -> "${x.to.artist}"`)
    if (x.to.norm_title) console.log(`      norm_title: "${x.from.norm_title}" -> "${x.to.norm_title}" (old kept as an alias)`)
  }
  console.log(`\nALIASES ADDED (${plan.aliases.length}) — so the new names match too:`)
  plan.aliases.forEach((a) => console.log(`  "${a.alias_norm}"  (${a.why})`))
  console.log(`\nSKYFALL PART MOVES (${plan.partMoves.length}):`)
  plan.partMoves.forEach((m) => console.log(`  ${m.file}  ${m.fromPart} -> ${m.toPart}`))
  console.log(`\nARCHIVED (${plan.archives.length}, reversible — rows and PDFs stay):`)
  plan.archives.forEach((a) => console.log(`  "${a.title}"`))

  if (!apply) {
    console.log('\n(dry run — nothing written. Re-run with --apply.)\n')
    return
  }

  // --- write ---
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(plan, null, 2))
  console.log(`\nundo map written: ${path.relative(ROOT, OUT)}`)

  for (const x of plan.renames) {
    const body = { title: x.to.title, artist: x.to.artist }
    if (x.to.norm_title) body.norm_title = x.to.norm_title
    await write(r, 'PATCH', `repertoire?id=eq.${x.id}`, body)
  }
  console.log(`  renamed ${plan.renames.length} works`)

  for (const m of plan.partMoves) {
    await write(r, 'PATCH', `repertoire_parts?id=eq.${m.partId}`, {
      repertoire_id: m.toRepertoire,
      part: m.toPart,
    })
  }
  console.log(`  moved ${plan.partMoves.length} parts into Skyfall`)

  if (plan.aliases.length) {
    await write(r, 'POST', 'title_aliases', plan.aliases.map((a) => ({
      organization_id: ORG,
      alias_norm: a.alias_norm,
      repertoire_id: a.repertoire_id,
    })))
    console.log(`  added ${plan.aliases.length} aliases`)
  }

  for (const a of plan.archives) {
    await write(r, 'PATCH', `repertoire?id=eq.${a.id}`, { is_active: false })
  }
  console.log(`  archived ${plan.archives.length} emptied stubs`)
  console.log('\n✓ done. Roll back with: node scripts/fix-catalog-data.js --undo\n')
}

async function rollback(r) {
  if (!fs.existsSync(OUT)) {
    console.error('No undo map — nothing to roll back.')
    process.exitCode = 1
    return
  }
  const plan = JSON.parse(fs.readFileSync(OUT, 'utf8'))
  for (const m of plan.partMoves) {
    await write(r, 'PATCH', `repertoire_parts?id=eq.${m.partId}`, {
      repertoire_id: m.fromRepertoire,
      part: m.fromPart,
    })
  }
  for (const a of plan.archives) {
    await write(r, 'PATCH', `repertoire?id=eq.${a.id}`, { is_active: true })
  }
  for (const x of plan.renames) {
    const body = { title: x.from.title, artist: x.from.artist }
    if (x.from.norm_title) body.norm_title = x.from.norm_title
    await write(r, 'PATCH', `repertoire?id=eq.${x.id}`, body)
  }
  for (const a of plan.aliases) {
    await write(r, 'DELETE', `title_aliases?organization_id=eq.${ORG}&alias_norm=eq.${encodeURIComponent(a.alias_norm)}&repertoire_id=eq.${a.repertoire_id}`)
  }
  fs.renameSync(OUT, OUT.replace('.json', `.rolled-back.json`))
  console.log('✓ rolled back.')
}

main().catch((e) => {
  console.error('\nFailed:', e.message)
  process.exitCode = 1
})
