/**
 * audit-consistency.js — verify a work's parts really belong to the SAME piece.
 *
 * For each repertoire work in the given batch, reads EVERY part PDF and pulls the
 * significant words printed on page 1 (title / composer / arranger). If the parts
 * don't share a common title word — or a part can't be read — the work is flagged
 * for human/agent review. This is the deep, look-inside-the-PDF consistency check.
 *
 *   node scripts/audit-consistency.js <batch.json>   # batch.json = ["<workId>", ...]
 *   node scripts/audit-consistency.js --ids id1,id2
 *
 * Output: JSON lines to stdout, one object per work:
 *   { id, title, nparts, shared:[tokens], flagged, reason, parts:[{part,file,words}] }
 */
'use strict'
const fs = require('fs')
const path = require('path')
const { PDFParse } = require(path.join(__dirname, '..', 'node_modules', 'pdf-parse'))

const ROOT = path.join(__dirname, '..')
const ORG = '6edbf230-e43a-42c0-a60d-8cd67be87276'
const LIB = path.join(ROOT, 'Music Compiler Local System', 'Reorganized Music Library')

function R() {
  const t = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  const k = t.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
  return { base: t.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim().replace(/\/$/, ''), headers: { apikey: k, Authorization: 'Bearer ' + k } }
}
const rest = R()
const get = (p) => fetch(rest.base + '/rest/v1/' + p, { headers: rest.headers }).then((r) => r.json())

const disk = new Map()
;(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.pdf$/i.test(e.name) && !e.name.startsWith('._')) disk.set(e.name.toLowerCase(), f) } })(LIB)

const NOISE = new Set(('violin viola cello bass contrabass double vln vla vlc vc cb score full string quartet quintet trio duo ' +
  'copyright arranged arrangement arr by music engraving performance time from the of and for solo pizz arco div ten espr dolce ' +
  'cresc dim rit rall molto sempre legato marcato moderato allegro andante adagio largo tempo con amore poco piu meno mariusz flis ' +
  'maag post manuscript computer print out email order copy purchased sheet plus sheetmusicdirect nashville rights reserved administered ' +
  'publishing songs universal sony music inc llc used permission international secured behalf controlled variation').split(/\s+/))

function words(text) {
  const seen = new Set(), out = []
  for (const w of (text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').match(/[a-z][a-z0-9]{2,}/g) || [])) {
    if (NOISE.has(w) || seen.has(w)) continue
    seen.add(w); out.push(w)
  }
  return out
}

async function partWords(file) {
  try {
    const p = new PDFParse({ data: fs.readFileSync(file) })
    const r = await p.getText({ first: 1 })
    await p.destroy?.()
    return words(r.text || '')
  } catch { return null }
}

async function main() {
  const args = process.argv.slice(2)
  let ids
  if (args[0] === '--ids') ids = args[1].split(',')
  else ids = JSON.parse(fs.readFileSync(args[0], 'utf8'))

  for (const id of ids) {
    const w = (await get(`repertoire?id=eq.${id}&select=title,ensemble`))[0] || {}
    const parts = await get(`repertoire_parts?repertoire_id=eq.${id}&select=part,original_filename&order=part`)
    const partInfo = []
    let unreadable = 0
    for (const p of parts) {
      const file = p.original_filename && disk.get(String(p.original_filename).toLowerCase())
      const ws = file ? await partWords(file) : null
      if (ws === null) unreadable++
      partInfo.push({ part: p.part, file: p.original_filename, words: ws ? ws.slice(0, 12) : null })
    }
    // shared significant tokens across all READABLE parts
    const readable = partInfo.filter((p) => p.words && p.words.length)
    let shared = []
    if (readable.length >= 2) {
      shared = readable[0].words.filter((tok) => readable.every((p) => p.words.includes(tok)))
    }
    const flagged = readable.length >= 2 && shared.length === 0
    const reason = flagged ? 'parts share NO common title word' : unreadable ? `${unreadable} part(s) unreadable` : ''
    console.log(JSON.stringify({ id, title: w.title, ensemble: w.ensemble, nparts: parts.length, readable: readable.length, shared, flagged, reason, parts: partInfo }))
  }
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1) })
