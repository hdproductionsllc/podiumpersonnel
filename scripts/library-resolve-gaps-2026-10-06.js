/**
 * library-resolve-gaps-2026-10-06.js — complete the library songs that were
 * missing parts for their own ensemble (found after "Ordinary World" reached a
 * gig's book-building with only its Cello II and Double Bass). Approved by David
 * 2026-10-06.
 *
 * Every decision below was made by matching sha256 fingerprints of the PDFs on
 * David's Desktop (forScore Full Library, Music Library PDF/, past gig books)
 * against the library, never by filename alone:
 *   - most gaps were ONE arrangement split across two or three entries (a quintet's
 *     strings in one, its Cello II/bass/score in another) → move the parts into the
 *     best-titled entry and archive the emptied one;
 *   - a few parts were never imported → upload them from the Desktop;
 *   - "Che faro" is a solo cello piece filed as a quartet → relabel.
 * Left flagged on purpose: Wedding Dress (only vla+vln2 exist anywhere) and the
 * violin/viola/cello Stand by Me trio (David's call).
 *
 * Gig song lists that point at an entry being archived are repointed to the entry
 * that now holds its parts, so no project is left matched to an archived work.
 *
 *   node scripts/library-resolve-gaps-2026-10-06.js            # dry run (default)
 *   node scripts/library-resolve-gaps-2026-10-06.js --apply    # write; saves an undo map
 *   node scripts/library-resolve-gaps-2026-10-06.js --undo <undo.json>
 *
 * Nothing is deleted: archived entries keep their rows; uploads are additive.
 */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.join(__dirname, '..')
const ORG = '6edbf230-e43a-42c0-a60d-8cd67be87276' // shared library (Project String Quartet)
const DESKTOP = 'C:/Users/david/Desktop/Music'
const FS = `${DESKTOP}/forScore Full Library`
const OUT = path.join(ROOT, 'scripts', 'repertoire-out')

for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
}
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }

async function rest(method, pathQ, body) {
  const r = await fetch(BASE + pathQ, {
    method,
    headers: { ...H, Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`${method} ${pathQ} → ${r.status} ${text}`)
  return text ? JSON.parse(text) : null
}

// --- the plan -----------------------------------------------------------------
// Works are named by id prefix and resolved (uniquely) against the live library.
// Parts are named by sha256 prefix. `as` changes the part's role while moving.

const PLAN = [
  {
    song: 'All the Way My Savior Leads Me',
    into: '8f3487d8',
    move: [{ sha: 'f586010d', from: 'd8600246' }], // "Viola for Cello" (sub for vc)
    archive: ['d8600246'],
  },
  {
    song: 'Are Ye Able, Said the Master',
    into: 'd611b684',
    move: [{ sha: 'e855237c', from: 'c27dbf05' }], // "Vla for VC"
    archive: ['c27dbf05'],
  },
  {
    song: "Can't Stop",
    into: 'dfabd742', // has the quintet's vln1/vln2/vla
    move: [
      // Cello II is the part David's past quartet books used as the cello part
      // (Mailliard/04_Cello/...Can't Stop - vc.pdf is byte-identical to it).
      { sha: 'f7f7c069', from: '2af24149', notes: 'quintet Cello II — the part the quartet cellist reads (matches past quartet books)' },
      { sha: 'b6a2ebec', from: '2af24149' },
      { sha: 'acdd19d3', from: '0403308b' },
    ],
    archive: ['2af24149', '0403308b'],
  },
  {
    song: 'Dear Theodosia',
    into: '472eabe9', // has vc/vln1/vln2
    move: [
      { sha: 'f401c948', from: 'f5e612ba' }, // viola (Easier 2024 version — the one in forScore)
      { sha: '9638acf1', from: 'f5e612ba' },
      { sha: 'ce0ca47b', from: 'f5e612ba' },
    ],
    archive: ['f5e612ba'],
  },
  {
    song: 'One Sweet Day',
    into: '001af0c6', // has vc/vln1
    move: [
      { sha: '27c56fcb', from: '1fa383d6' },
      { sha: 'b96f23f7', from: '1fa383d6' },
      { sha: 'fdb81a2c', from: '1fa383d6' },
    ],
    archive: ['1fa383d6'],
  },
  {
    song: 'Simply the Best',
    into: '52d2f1d9', // has vln1/vln2/vla
    move: [
      // Filed as 'other'; on the Desktop it is "...Quintet - Cello use for quartet.pdf".
      { sha: '0e22797c', from: '328be110', as: 'vc' },
      { sha: 'b15c056d', from: '328be110' },
      { sha: '5180d27b', from: '328be110' },
    ],
    archive: ['328be110'],
  },
  {
    song: "Nothing's Gonna Stop Us Now",
    into: 'dbd47253', // the cleanly titled entry (has vc)
    move: [
      { sha: '5887597d', from: 'b33278de' },
      { sha: 'e3286ad4', from: 'b33278de' },
      { sha: '0d7845cc', from: 'b33278de' },
      { sha: 'af66d903', from: 'b33278de', as: 'score' }, // "...String Quartet.pdf"
    ],
    archive: ['b33278de'],
  },
  {
    song: 'Levitating (quartet)',
    into: '8c84c83e',
    move: [
      // The quartet entry held the QUINTET's Violin II; hand it to the quintet first
      // (one vln2 per entry), then bring in "Violin II fixed" — the quartet vln2 used
      // in the Subito Don/Nick books.
      { sha: '8f8b2cdd', from: '8c84c83e', to: 'c671f89d' },
      { sha: '2d07cc46', from: 'eb0ccd2d' },
      { sha: '2adee8e9', from: 'eb0ccd2d' },
    ],
    archive: ['eb0ccd2d'],
  },
  {
    song: 'Levitating (quintet)',
    into: 'c671f89d', // has bass/score (+ vln2 from the step above)
    retitle: { title: 'Levitating', norm_title: 'levitating' }, // same family as the quartet
    upload: [
      { file: `${FS}/Levitating Dua Lipa String Quintet - Violin I.pdf`, part: 'vln1' },
      { file: `${FS}/Levitating Dua Lipa String Quintet - Viola.pdf`, part: 'vla' },
      { file: `${FS}/Levitating Dua Lipa String Quintet - Cello.pdf`, part: 'vc' },
    ],
  },
  {
    // Two arrangements had been mixed: 2ecccfd0 is the "String Quartet" set (complete)
    // and its score sat in 7d926730; 7d926730's vln2 belongs to a second set
    // ("Siman Tov Mazel Tov Vln1/Vln2/Vla/Vc") whose other three were never imported.
    song: 'Siman Tov Mazel Tov',
    into: '7d926730',
    move: [{ sha: '705d3cc3', from: '7d926730', to: '2ecccfd0', as: 'score' }],
    upload: [
      { file: `${FS}/Siman Tov Mazel Tov Vln1.pdf`, part: 'vln1' },
      { file: `${FS}/Siman Tov Mazel Tov Vla.pdf`, part: 'vla' },
      { file: `${FS}/Siman Tov Mazel Tov Vc.pdf`, part: 'vc' },
    ],
  },
  {
    song: 'Christmas Songs',
    into: '92c0b373',
    // The lone vln1 was "Christmas Songs for Violin" — a separate violin book. Keep
    // it as an extra and add the 4-part quartet medley set.
    move: [{ sha: '5e71a8e0', from: '92c0b373', as: 'other', played_on: 'vln1', notes: 'Christmas Songs for Violin (separate violin book)' }],
    upload: [
      { file: `${DESKTOP}/Christmas Songs/Christmas Songs - Vln1.pdf`, part: 'vln1' },
      { file: `${DESKTOP}/Christmas Songs/Christmas Songs - Vln2.pdf`, part: 'vln2' },
      { file: `${DESKTOP}/Christmas Songs/Christmas Songs - Vla.pdf`, part: 'vla' },
      { file: `${DESKTOP}/Christmas Songs/Christmas Songs - Vc.pdf`, part: 'vc' },
    ],
  },
  {
    song: 'Che faro senza Euridice',
    into: '29ae748f',
    // "Che faro senza Euridice Gluck Solo Cello.pdf" — a solo, not a quartet.
    reensemble: 'solo',
  },
]

// --- helpers ------------------------------------------------------------------

const roleKey = (p) => `${p.part}|${p.substitute ? 1 : 0}|${p.played_on || ''}`
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex')
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k] ?? null]))

async function loadLibrary() {
  const works = []
  for (let o = 0; ; o += 1000) {
    const page = await rest(
      'GET',
      `repertoire?select=id,title,artist,ensemble,is_active,norm_title,repertoire_parts(*)&organization_id=eq.${ORG}&offset=${o}&limit=1000`,
    )
    works.push(...page)
    if (page.length < 1000) break
  }
  return works
}

// --- main ---------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === '--undo') return undo(args[1])
  const apply = args.includes('--apply')

  const works = await loadLibrary()
  const work = (prefix) => {
    const hits = works.filter((w) => w.id.startsWith(prefix))
    if (hits.length !== 1) throw new Error(`work prefix ${prefix} matched ${hits.length} works`)
    return hits[0]
  }
  const allShas = new Set(works.flatMap((w) => w.repertoire_parts.map((p) => p.sha256.toLowerCase())))

  // Simulated roles per work, so every move/insert is checked against the
  // unique (repertoire_id, part, substitute, played_on) index BEFORE any write.
  const roles = new Map(works.map((w) => [w.id, new Set(w.repertoire_parts.map(roleKey))]))
  const ops = []
  const problems = []

  for (const step of PLAN) {
    const into = work(step.into)
    for (const m of step.move || []) {
      const from = work(m.from)
      const to = m.to ? work(m.to) : into
      const part = from.repertoire_parts.find((p) => p.sha256.startsWith(m.sha))
      if (!part) { problems.push(`${step.song}: part ${m.sha} not in ${from.title} (${m.from})`); continue }
      const next = {
        repertoire_id: to.id,
        part: m.as ?? part.part,
        substitute: part.substitute,
        played_on: m.played_on !== undefined ? m.played_on : m.as ? null : part.played_on,
        notes: m.notes ?? part.notes,
      }
      roles.get(from.id).delete(roleKey(part))
      if (roles.get(to.id).has(roleKey(next))) {
        problems.push(`${step.song}: ${to.title} already has role ${roleKey(next)}`)
        continue
      }
      roles.get(to.id).add(roleKey(next))
      ops.push({
        kind: 'move', song: step.song, id: part.id, before: pick(part, Object.keys(next)), after: next,
        label: `${part.original_filename}${from.id === to.id ? '' : `  [${from.title} → ${to.title}]`}${next.part !== part.part ? `  (${part.part} → ${next.part})` : ''}`,
      })
    }
    for (const u of step.upload || []) {
      if (!fs.existsSync(u.file)) { problems.push(`${step.song}: missing file ${u.file}`); continue }
      const buf = fs.readFileSync(u.file)
      const sha = sha256(buf)
      if (allShas.has(sha)) { problems.push(`${step.song}: ${path.basename(u.file)} is already in the library`); continue }
      const row = {
        repertoire_id: into.id, organization_id: ORG, part: u.part, substitute: false, played_on: null,
        storage_path: `repertoire/${ORG}/${sha}.pdf`, original_filename: path.basename(u.file),
        bytes: buf.length, sha256: sha, notes: null,
      }
      if (roles.get(into.id).has(roleKey(row))) { problems.push(`${step.song}: ${into.title} already has ${u.part}`); continue }
      roles.get(into.id).add(roleKey(row))
      ops.push({ kind: 'upload', song: step.song, file: u.file, row, label: `${row.original_filename} → as ${u.part}` })
    }
    if (step.retitle) ops.push({ kind: 'work', song: step.song, id: into.id, before: pick(into, Object.keys(step.retitle)), after: step.retitle, label: `retitle "${into.title}" → "${step.retitle.title}"` })
    if (step.reensemble) ops.push({ kind: 'work', song: step.song, id: into.id, before: { ensemble: into.ensemble }, after: { ensemble: step.reensemble }, label: `ensemble ${into.ensemble} → ${step.reensemble}` })
    for (const a of step.archive || []) {
      const stub = work(a)
      const left = [...roles.get(stub.id)]
      if (left.length) { problems.push(`${step.song}: ${stub.title} (${a}) would be archived still holding ${left.join(', ')}`); continue }
      ops.push({ kind: 'work', song: step.song, id: stub.id, before: { is_active: stub.is_active }, after: { is_active: false }, label: `archive "${stub.title}" [${stub.ensemble}] (${a})` })
      const refs = await rest('GET', `intake_songs?matched_repertoire_id=eq.${stub.id}&select=id`)
      for (const r of refs) {
        ops.push({ kind: 'song', song: step.song, id: r.id, before: { matched_repertoire_id: stub.id }, after: { matched_repertoire_id: into.id }, label: `repoint a gig song-list entry → "${into.title}"` })
      }
    }
  }

  let cur = null
  for (const op of ops) {
    if (op.song !== cur) { cur = op.song; console.log(`\n${op.song}`) }
    console.log(`  ${op.kind.padEnd(6)} ${op.label}`)
  }
  if (problems.length) {
    console.log('\nPROBLEMS — nothing will be written:')
    for (const p of problems) console.log('  ✗ ' + p)
    process.exitCode = 1
    return
  }
  console.log(`\n${ops.length} operations, 0 problems.`)
  if (!apply) { console.log('(dry run — re-run with --apply to write)'); return }

  // Uploads verify size + MD5 before their row is written; every write is logged
  // to the undo map as it happens, so a mid-run failure is still reversible.
  const { getR2Client } = require(path.join(ROOT, 'src', 'lib', 'storage', 'r2.ts'))
  const r2 = getR2Client()
  const undoLog = []
  const undoPath = path.join(OUT, `resolve-gaps-undo-${Date.now()}.json`)
  const save = () => fs.writeFileSync(undoPath, JSON.stringify(undoLog, null, 2))
  try {
    for (const op of ops) {
      if (op.kind === 'upload') {
        const buf = fs.readFileSync(op.file)
        const head = await r2.headObject(op.row.storage_path)
        if (!head || head.size !== buf.length) {
          await r2.putObject(op.row.storage_path, buf, 'application/pdf', { contentLength: buf.length })
          const after = await r2.headObject(op.row.storage_path)
          const etag = after && after.etag ? String(after.etag).replace(/"/g, '').toLowerCase() : null
          if (!after || after.size !== buf.length || (etag && !etag.includes('-') && etag !== md5(buf))) {
            throw new Error(`upload verification failed for ${op.file}`)
          }
        }
        const [ins] = await rest('POST', 'repertoire_parts', op.row)
        undoLog.push({ kind: 'insert', id: ins.id })
      } else {
        const table = op.kind === 'move' ? 'repertoire_parts' : op.kind === 'work' ? 'repertoire' : 'intake_songs'
        await rest('PATCH', `${table}?id=eq.${op.id}`, op.after)
        undoLog.push({ kind: 'patch', table, id: op.id, before: op.before })
      }
      save()
      console.log('  ✓ ' + op.label)
    }
  } finally {
    save()
    console.log(`\nUndo map: ${path.relative(ROOT, undoPath)}`)
  }
}

async function undo(file) {
  const log = JSON.parse(fs.readFileSync(file, 'utf8'))
  // Reverse order, so a part moves back out before the one that took its slot returns.
  for (const e of log.slice().reverse()) {
    if (e.kind === 'insert') await rest('DELETE', `repertoire_parts?id=eq.${e.id}`)
    else await rest('PATCH', `${e.table}?id=eq.${e.id}`, e.before)
  }
  console.log(`Undid ${log.length} operations (uploaded PDFs stay in storage, unreferenced).`)
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
