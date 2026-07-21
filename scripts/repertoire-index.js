/**
 * Repertoire indexer (Phase A of the client-intake / book-builder import).
 *
 * READ-ONLY walk of David's sheet-music library. Classifies every non-junk PDF,
 * detects instrument part / ensemble / title / artist, groups parts into
 * arrangements, flags gaps and duplicates, and records a sha256 of every file
 * so the R2 upload step (later phase) can verify byte-identical delivery.
 *
 * We NEVER rename/move/rewrite the source PDFs. Original filenames are preserved
 * verbatim in the output; normalization happens only for MATCHING.
 *
 * Domain rules ported from:
 *   Music Compiler Local System/Music Compiler/CLAUDE_CODE_PROMPT_GIG_COMPILER.md
 *   Music Compiler Local System/Music Compiler/LESSONS_LEARNED_AND_PLANNING.md
 * and EXTENDED per a real scan of the 3,637-file library (see decision-batches.md).
 *
 * Run:     node scripts/repertoire-index.js
 * Output:  scripts/repertoire-out/{index.json, decision-batches.md, stragglers.csv}
 *          (gitignored)
 *
 * Style mirrors scripts/backup-database.js: plain CommonJS, no new deps,
 * node:crypto + node:fs only, streams file bytes for hashing (never slurps).
 */
'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const LIBRARY_ROOT = path.join(
  __dirname,
  '..',
  'Music Compiler Local System',
  'Reorganized Music Library'
)
const OUT_DIR = path.join(__dirname, 'repertoire-out')

// Top folder -> ensemble
const ENSEMBLE_BY_FOLDER = {
  'Quartet Quintet': 'quartet', // quartet OR quintet; refined per-file below
  Trio: 'trio',
  'VC Duo': 'duo',
  'Solo Cello': 'solo',
  'Solo Violin': 'solo',
  'Viola Trio': 'viola-trio',
}

// Completeness is judged ONLY on the core string parts an ensemble splits into.
// Bass / vc2 / score / voice / organ are optional extras — present-when-present,
// never counted as "missing". Duo and solo pieces live as a single whole-piece
// PDF, so they have no expected split (evaluated as "single").
const CORE_PARTS = ['vln1', 'vln2', 'vla', 'vc']
const EXPECTED_PARTS = {
  quartet: ['vln1', 'vln2', 'vla', 'vc'],
  quintet: ['vln1', 'vln2', 'vla', 'vc'], // bass is a bonus, not required
  trio: ['vln1', 'vln2', 'vc'],
  'viola-trio': ['vln1', 'vln2', 'vla'],
  duo: [], // whole-piece single PDF
  solo: [], // single-part by nature
}

// ---------------------------------------------------------------------------
// Junk / exclusion detection
// ---------------------------------------------------------------------------
// Hard junk: never indexed at all (AppleDouble, OS cruft, archives, reports).
function isJunk(base) {
  if (base.startsWith('._')) return true // AppleDouble sidecars (3,645 of them)
  if (base === '.DS_Store') return true
  const lower = base.toLowerCase()
  if (lower.endsWith('.zip')) return true
  if (lower.endsWith('.txt')) return true
  if (!lower.endsWith('.pdf')) return true
  return false
}

// ---------------------------------------------------------------------------
// Unicode / matching normalization  (PRESERVE originals; normalize only to match)
// ---------------------------------------------------------------------------
function unifyQuotes(s) {
  return s
    .replace(/[‘’‛ʼ]/g, "'") // curly / modifier apostrophes
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-') // en/em dash -> hyphen
    .replace(/[]/g, '(') // private-use glyph seen in a folder name
}

// Ensemble/qualifier words that pollute titles; stripped for normTitle + display.
const ENSEMBLE_WORDS =
  /\b(string\s+)?(quartet|quintet|trio|duo|duet|sextet)\b|\bvc\s+duo\b|\bstring\s+duo\b/gi

// Version / engraving-revision noise that denotes the SAME piece, so all parts
// of a re-typeset arrangement converge to one normTitle (e.g. "God Only Knows"
// and "God Only Knows 2021 Update" are the same song).
const VERSION_NOISE =
  /\b(v\d+|updated?|update\s+\w+\s*\d{0,4}|version|revised|slower|faster|easier|harder|old|too\s+hard|new\s+version|print(?:out)?|copy|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b/g

function normTitle(title) {
  let t = unifyQuotes(title).toLowerCase()
  t = t.replace(/\(\s*\d+\s*\)/g, ' ') // "(1)" copy suffix
  t = t.replace(ENSEMBLE_WORDS, ' ')
  t = t.replace(/-\s*0?\d+\b/g, ' ') // leftover Naughtin "-01" numbering
  t = t.replace(/\b(19|20)\d{2}\b/g, ' ') // years (2021, 2022, ...)
  t = t.replace(VERSION_NOISE, ' ')
  t = t.replace(/[''`]/g, '') // drop apostrophes entirely (Cant == Can't)
  t = t.replace(/[^a-z0-9]+/g, ' ') // collapse punctuation
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

// ---------------------------------------------------------------------------
// Part detection
// ---------------------------------------------------------------------------
// Trailing annotations that may FOLLOW a part token and must not defeat it.
// Order matters only in that this is applied repeatedly from the tail.
// NOTE "v2": an engraver's version suffix ("… - Cello v2.pdf"), NOT violin 2. It is
// stripped here so the real instrument token behind it can win. Treating it as a
// part name filed the CELLO of "Welcome To the Jungle" as vln2 and left the work
// unbookable. Every v-suffixed file in the library is a version, none is a violin.
const TRAILING_ANNOT =
  /[\s\-_]*(?:\(\s*\d+\s*\)|copy|fixed|part|old(?:\s+too\s+hard)?|too\s+hard|update(?:d)?(?:\s+\w+)*|version|slower|easier(?:\s+\d{4})?|\d{4}\s+version|june\s+\d{4}|updated\s+\w+\s*\d{0,4}|new\s+version|easy|v\d+)\s*$/i

function stripTrailingAnnot(s) {
  let prev
  let out = s
  let note = ''
  do {
    prev = out
    out = out.replace(TRAILING_ANNOT, (m) => {
      note = (m.trim() + ' ' + note).trim()
      return ''
    })
  } while (out !== prev)
  return { text: out.trim(), note }
}

// Part patterns. Each entry: canonical part + regex that matches the part token
// as a trailing/standalone token. Ordered most-specific first (Naughtin "-0N",
// numbered violins, second cello) so a greedy simple pattern can't win early.
// The regex matches the token and everything to end-of-string (annotations
// already stripped), capturing the pre-token text in group 1 where possible.
const PART_RULES = [
  // second cello (quintet) -- before generic cello
  { part: 'vc', vc2: true, re: /^(.*?)[\s\-_]+(?:vc\s*2|cello\s*(?:2|ii)|cello\s+part\s*2)$/i },
  // second violin -- before generic violin
  { part: 'vln2', re: /^(.*?)[\s\-_]+(?:vln\s*2|vln\s*ii|violin\s*2|violin\s*ii|2nd\s+violin|violin\s+two)$/i },
  { part: 'vln1', re: /^(.*?)[\s\-_]+(?:vln\s*1|vln\s*i|violin\s*1|violin\s*i|1st\s+violin|violin\s+one|vln)$/i },
  // viola (incl. common "vIa" capital-I-for-l typo, "va")
  { part: 'vla', re: /^(.*?)[\s\-_]+(?:vla|v[il]a|viola|va)$/i },
  // cello
  { part: 'vc', re: /^(.*?)[\s\-_]+(?:vc|cello|violoncello|vcello)$/i },
  // bass / double bass / contrabass
  { part: 'bass', re: /^(.*?)[\s\-_]+(?:db|d\.?\s*b\.?|double\s*bass|contra\s*bass|contrabass|string\s+bass|bass)$/i },
  { part: 'voice', re: /^(.*?)[\s\-_]+(?:voice|vocal|soprano|tenor)$/i },
  { part: 'organ', re: /^(.*?)[\s\-_]+organ$/i },
  { part: 'other', reOther: true, re: /^(.*?)[\s\-_]+(?:harp|piano|guitar|lead\s*sheet|piano[\s\-_]*vocal[\s\-_]*guitar|easy\s*piano)\b.*$/i },
]

// Long-form parenthetical parts: "(Violin_1_part)", "(Cello part)"
const PAREN_PART = [
  { part: 'vln2', re: /\(\s*violin[\s_]*(?:2|ii)[\s_]*part\s*\)/i },
  { part: 'vln1', re: /\(\s*violin[\s_]*(?:1|i)[\s_]*part\s*\)/i },
  { part: 'vla', re: /\(\s*viola[\s_]*part\s*\)/i },
  { part: 'vc', re: /\(\s*cello[\s_]*part\s*\)/i },
]

// Naughtin collection: "Title-05 Bass.pdf", "Title-01 Violin I.pdf"
const NAUGHTIN_RE =
  /^(.*?)-\s*0?(\d+)\s+(violin\s*ii|violin\s*i|violin\s*2|violin\s*1|viola|cello|bass|double\s*bass|voice|organ|score)\.?$/i
const NAUGHTIN_PART = {
  'violin i': 'vln1',
  'violin 1': 'vln1',
  'violin ii': 'vln2',
  'violin 2': 'vln2',
  viola: 'vla',
  cello: 'vc',
  bass: 'bass',
  'double bass': 'bass',
  voice: 'voice',
  organ: 'organ',
  score: 'score',
}

// Score / conductor part
const SCORE_RE = /(?:^|[\s\-_.])score(?:\s+with\s+lyrics)?\.?$/i

// Substitute part: "vla for vc" (viola part covering the cello line), "vln2 as vla"
const SUBSTITUTE_RE = /\b(vln1|vln2|vla|vc|violin\s*i{1,2}|viola|cello)\s+(?:for|as)\s+(vln1|vln2|vla|vc|violin\s*i{1,2}|viola|cello)\b/i
const READS_RE = /\(\s*reads\s+([^)]+)\)/i

function canonPartWord(w) {
  const s = w.toLowerCase().replace(/\s+/g, '')
  if (/^(vln1|violini|violin1)$/.test(s)) return 'vln1'
  if (/^(vln2|violinii|violin2)$/.test(s)) return 'vln2'
  if (/^(vla|viola)$/.test(s)) return 'vla'
  if (/^(vc|cello)$/.test(s)) return 'vc'
  return w.toLowerCase()
}

// Administrative / non-part PDFs to EXCLUDE from import (indexes, printouts, covers).
const ADMIN_RE = /\b(complete\s+set\s+index|printout|cover|index)\b/i

// ---------------------------------------------------------------------------
// Core classifier for one file
// ---------------------------------------------------------------------------
function classifyFile(relPath, folder) {
  const original = path.basename(relPath)
  const stem0 = original.replace(/\.pdf$/i, '')
  // Detect + strip a trailing "(N)" copy suffix from the WORKING string so it
  // can't defeat part/Naughtin detection. Original filename is preserved intact.
  const isCopy = /\(\s*\d+\s*\)\s*$/.test(unifyQuotes(stem0))
  const uni = unifyQuotes(stem0).replace(/\s*\(\s*\d+\s*\)\s*$/, '')

  const out = {
    title: '',
    artist: '',
    part: null,
    substitute: false,
    playedOn: null,
    score: false,
    ensemble: ENSEMBLE_BY_FOLDER[folder] || 'other',
    notes: '',
  }

  // Ensemble refinement from filename qualifiers.
  if (out.ensemble === 'quartet') {
    if (/\bquintet\b/i.test(uni)) out.ensemble = 'quintet'
    else if (/\btrio\b/i.test(uni)) out.ensemble = 'trio'
    else if (/\bviola\s+trio\b/i.test(uni)) out.ensemble = 'viola-trio'
  }

  // --- 1. Substitute parts (highest priority: explicit "X for/as Y") ---
  const sub = uni.match(SUBSTITUTE_RE)
  if (sub) {
    const played = canonPartWord(sub[1])
    const covers = canonPartWord(sub[2])
    // "vla for vc" = a VIOLA part (part) that covers the CELLO line (played_on),
    // matching migration 068's model: part='vla', substitute=true, played_on='vc'.
    // The covered role stays MISSING in arrangement completeness (review finding I1).
    out.part = played
    out.playedOn = covers
    out.substitute = true
    out.notes = `substitute: ${played} part covering the ${covers} line`
    out.title = cleanTitle(uni.slice(0, sub.index))
    splitArtist(out)
    return finalize(out, isCopy, 'confident')
  }

  // --- 2. Naughtin "-0N Part" ---
  const naughtin = uni.match(NAUGHTIN_RE)
  if (naughtin) {
    const pk = NAUGHTIN_PART[naughtin[3].toLowerCase().replace(/\s+/g, ' ')]
    if (pk) {
      out.part = pk
      out.score = pk === 'score'
      out.title = cleanTitle(naughtin[1])
      splitArtist(out)
      out.notes = `naughtin numbered part (-${naughtin[2]})`
      return finalize(out, isCopy, out.artist || pk !== 'score' ? 'confident' : 'confident')
    }
  }

  // --- 3. Canonical "Title - Artist - part" ---
  const parts = uni.split(' - ')
  if (parts.length >= 3) {
    const last = parts[parts.length - 1].trim()
    const { text: lastClean, note } = stripTrailingAnnot(last)
    const pk = quickPart(lastClean)
    if (pk) {
      out.part = pk
      out.score = pk === 'score'
      out.artist = parts[parts.length - 2].trim()
      out.title = cleanTitle(parts.slice(0, parts.length - 2).join(' - '))
      if (note) out.notes = note
      return finalize(out, isCopy, 'confident')
    }
  }

  // --- 4. Score files ("...-Score", "... Score", "Score with Lyrics") ---
  if (SCORE_RE.test(stripTrailingAnnot(uni).text)) {
    out.part = 'score'
    out.score = true
    out.title = cleanTitle(uni.replace(SCORE_RE, ''))
    splitArtist(out)
    return finalize(out, isCopy, 'confident')
  }

  // --- 5. Parenthetical long-form parts ---
  for (const rule of PAREN_PART) {
    if (rule.re.test(uni)) {
      out.part = rule.part
      out.title = cleanTitle(uni.replace(rule.re, ''))
      splitArtist(out)
      return finalize(out, isCopy, 'confident')
    }
  }

  // --- 6. Trailing part token (long & short forms) ---
  const { text: annotStripped, note: tnote } = stripTrailingAnnot(uni)
  for (const rule of PART_RULES) {
    const m = annotStripped.match(rule.re)
    if (m) {
      out.part = rule.part
      if (rule.vc2) out.notes = 'second cello (vc2)'
      if (rule.reOther) out.notes = 'non-string part (harp/piano/lead sheet)'
      if (tnote) out.notes = (out.notes ? out.notes + '; ' : '') + tnote
      out.title = cleanTitle(m[1])
      splitArtist(out)
      // "(reads vln2 div)" style annotation
      const reads = uni.match(READS_RE)
      if (reads) out.notes = (out.notes ? out.notes + '; ' : '') + `reads ${reads[1].trim()}`
      const cls = rule.reOther ? 'needs-review' : 'confident'
      return finalize(out, isCopy, cls)
    }
  }

  // --- 7. Administrative non-part files -> excluded ---
  if (ADMIN_RE.test(uni)) {
    out.title = cleanTitle(uni)
    out.notes = 'administrative / non-part file (index, printout, or cover)'
    return finalize(out, isCopy, 'excluded')
  }

  // --- 8. Solo / duo whole-piece PDFs (single-file arrangements, no split part) ---
  // These are legitimately one PDF per piece; a rule-level decision covers the
  // whole batch, so they're CONFIDENT (part='other') rather than per-file review.
  if (out.ensemble === 'solo' || out.ensemble === 'duo') {
    out.part = 'other'
    out.title = cleanTitle(uni)
    splitArtist(out)
    out.notes = `${out.ensemble} whole-piece PDF (no split part detected)`
    return finalize(out, isCopy, 'confident')
  }

  // --- 9. Title-only (no detectable part): full-set / lead sheet / unknown ---
  out.part = null
  out.title = cleanTitle(uni)
  splitArtist(out)
  out.notes = 'no part detected'
  return finalize(out, isCopy, 'needs-review')
}

// Quick part check for a single trailing token (canonical position).
function quickPart(tok) {
  const t = tok.toLowerCase().replace(/\s+/g, ' ').trim()
  if (/^(vln\s*1|vln\s*i|violin\s*1|violin\s*i|vln)$/.test(t)) return 'vln1'
  if (/^(vln\s*2|vln\s*ii|violin\s*2|violin\s*ii)$/.test(t)) return 'vln2'
  if (/^(vla|v[il]a|viola|va)$/.test(t)) return 'vla'
  if (/^(vc\s*2|cello\s*2|cello\s*ii)$/.test(t)) return 'vc'
  if (/^(vc|cello|violoncello)$/.test(t)) return 'vc'
  if (/^(db|double\s*bass|contrabass|bass)$/.test(t)) return 'bass'
  if (/^voice$/.test(t)) return 'voice'
  if (/^organ$/.test(t)) return 'organ'
  if (/^score$/.test(t)) return 'score'
  // Non-string bonus parts (horn, winds) ride along as 'other' — the DB part
  // canon has no slot for them, and the original filename preserves which
  // instrument it is. Without this, "Title - Artist - Horn in F.pdf" misparses
  // into a separate junk work instead of joining its arrangement.
  if (/^(french\s*horn|horn(\s*in\s*[a-g])?|trumpet|flute|clarinet|oboe)$/.test(t)) return 'other'
  return null
}

// Remove ensemble qualifier words and trailing separators from a raw title.
function cleanTitle(raw) {
  let t = raw.replace(/\(\s*\d+\s*\)\s*$/, '') // trailing copy suffix
  t = t.replace(ENSEMBLE_WORDS, ' ')
  t = t.replace(/[\s\-_]+$/g, '').replace(/^[\s\-_]+/g, '')
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

// If a cleaned title still holds "Something - Artist", peel a trailing artist.
// Conservative: only when exactly one " - " separator remains and the RHS looks
// like an artist name (letters/periods, <= 5 words). Never guesses beyond the
// filename's own delimiters.
function splitArtist(out) {
  if (out.artist) return
  const segs = out.title.split(' - ')
  if (segs.length === 2) {
    const rhs = segs[1].trim()
    if (rhs && rhs.split(/\s+/).length <= 5 && /^[A-Za-z][A-Za-z.'\- ]+$/.test(rhs)) {
      out.title = segs[0].trim()
      out.artist = rhs
    }
  }
}

function finalize(out, isCopy, classification) {
  out.classification = classification
  out.normTitle = normTitle(out.title)
  if (isCopy) out.notes = (out.notes ? out.notes + '; ' : '') + 'copy suffix "(N)" in filename'
  return out
}

// ---------------------------------------------------------------------------
// Filesystem walk + hashing
// ---------------------------------------------------------------------------
function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else acc.push(full)
  }
  return acc
}

function sha256Stream(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256')
    const s = fs.createReadStream(file)
    s.on('error', reject)
    s.on('data', (d) => h.update(d))
    s.on('end', () => resolve(h.digest('hex')))
  })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!fs.existsSync(LIBRARY_ROOT)) throw new Error(`Library not found: ${LIBRARY_ROOT}`)
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const allFiles = walk(LIBRARY_ROOT, [])
  const records = []
  const junkCounts = { appleDouble: 0, dsStore: 0, zip: 0, txt: 0, nonPdf: 0 }

  let done = 0
  for (const full of allFiles) {
    const base = path.basename(full)
    if (isJunk(base)) {
      if (base.startsWith('._')) junkCounts.appleDouble++
      else if (base === '.DS_Store') junkCounts.dsStore++
      else if (base.toLowerCase().endsWith('.zip')) junkCounts.zip++
      else if (base.toLowerCase().endsWith('.txt')) junkCounts.txt++
      else junkCounts.nonPdf++
      continue
    }
    const relPath = path.relative(LIBRARY_ROOT, full).split(path.sep).join('/')
    const folder = relPath.split('/')[0]
    const stat = fs.statSync(full)
    const sha256 = await sha256Stream(full)
    const c = classifyFile(relPath, folder)

    records.push({
      relPath,
      originalFilename: base,
      bytes: stat.size,
      sha256,
      folder,
      classification: c.classification,
      title: c.title,
      artist: c.artist,
      part: c.part,
      substitute: c.substitute,
      playedOn: c.playedOn,
      score: c.score,
      ensemble: c.ensemble,
      normTitle: c.normTitle,
      arrangementKey: `${folder}::${c.ensemble}::${c.normTitle}`,
      notes: c.notes,
    })

    if (++done % 500 === 0) process.stdout.write(`  hashed ${done}/${allFiles.length}\r`)
  }

  // -------------------------------------------------------------------------
  // Duplicate detection (same sha256 = byte-identical)
  // -------------------------------------------------------------------------
  // Two files are a true DUPLICATE only when they are byte-identical AND the
  // same detected part (e.g. the same vln1 saved in two folders). Byte-identical
  // files with DIFFERENT parts are NOT duplicates — they mean one instrument
  // reads another's line (e.g. a viola file that is literally the vln2 part);
  // both must survive as real parts, so we only annotate the relationship.
  const byHash = new Map()
  for (const r of records) {
    if (!byHash.has(r.sha256)) byHash.set(r.sha256, [])
    byHash.get(r.sha256).push(r)
  }
  let dupGroups = 0
  let dupExtra = 0
  for (const [, group] of byHash) {
    if (group.length < 2) continue
    // subgroup by part: alias only within identical parts
    const byPartKey = new Map()
    for (const r of group) {
      const k = r.part || '(none)'
      if (!byPartKey.has(k)) byPartKey.set(k, [])
      byPartKey.get(k).push(r)
    }
    for (const [, sub] of byPartKey) {
      if (sub.length < 2) continue
      dupGroups++
      sub.sort((a, b) => a.relPath.localeCompare(b.relPath))
      sub[0].duplicateOf = null
      sub[0].aliasPaths = sub.slice(1).map((g) => g.relPath)
      for (const g of sub.slice(1)) {
        g.duplicateOf = sub[0].relPath
        dupExtra++
      }
    }
    // cross-part identical bytes: note it on each (interchangeable parts)
    if (byPartKey.size > 1) {
      const parts = [...byPartKey.keys()].join(', ')
      for (const r of group) {
        r.notes = (r.notes ? r.notes + '; ' : '') + `byte-identical to other part(s) here (${parts}) — interchangeable`
      }
    }
  }

  // -------------------------------------------------------------------------
  // Arrangement grouping + completeness
  // -------------------------------------------------------------------------
  const arrangements = new Map()
  for (const r of records) {
    if (r.classification === 'excluded') continue
    if (r.duplicateOf) continue // aliases don't re-add parts
    if (!r.normTitle) continue
    if (!arrangements.has(r.arrangementKey)) {
      arrangements.set(r.arrangementKey, {
        arrangementKey: r.arrangementKey,
        folder: r.folder,
        ensemble: r.ensemble,
        title: r.title,
        parts: new Set(),
        files: [],
      })
    }
    const a = arrangements.get(r.arrangementKey)
    a.files.push(r.relPath)
    // Substitute parts (e.g. a vla file covering the vc line) don't make either
    // role canonically present — the real part is still a library gap.
    if (r.part && !r.substitute) a.parts.add(r.part)
    // a bass part present anywhere makes it a quintet variant (display only;
    // completeness is still judged on the 4 core parts).
    if (r.part === 'bass' && a.ensemble === 'quartet') a.ensemble = 'quintet'
  }

  let complete = 0
  let incomplete = 0
  let supplemental = 0 // only bonus parts (bass/score/voice/organ/other) — no core split
  const incompleteList = []
  for (const [, a] of arrangements) {
    const expected = EXPECTED_PARTS[a.ensemble] || []
    const coreHeld = CORE_PARTS.filter((p) => a.parts.has(p))
    const missing = expected.filter((p) => !a.parts.has(p))
    a.missingParts = missing
    a.presentParts = [...a.parts].sort()
    a.status =
      expected.length === 0
        ? 'single' // solo / duo whole-piece
        : coreHeld.length === 0
          ? 'supplemental' // e.g. Naughtin bass-only or a standalone score
          : missing.length === 0
            ? 'complete'
            : 'incomplete'
    if (a.status === 'incomplete') {
      incomplete++
      incompleteList.push(a)
    } else if (a.status === 'supplemental') {
      supplemental++
    } else {
      complete++ // 'complete' or 'single'
    }
  }

  // annotate each record with its arrangement's missing parts (for the gap flag)
  for (const r of records) {
    const a = arrangements.get(r.arrangementKey)
    r.arrangementMissingParts = a ? a.missingParts : []
    r.arrangementComplete = a ? a.missingParts.length === 0 : null
  }

  // -------------------------------------------------------------------------
  // Write index.json
  // -------------------------------------------------------------------------
  const indexPayload = {
    generatedAt: new Date().toISOString(),
    libraryRoot: LIBRARY_ROOT.split(path.sep).join('/'),
    fileCount: records.length,
    junkExcluded: junkCounts,
    files: records,
    arrangements: [...arrangements.values()].map((a) => ({
      arrangementKey: a.arrangementKey,
      folder: a.folder,
      ensemble: a.ensemble,
      title: a.title,
      status: a.status,
      presentParts: a.presentParts,
      missingParts: a.missingParts,
      complete: a.status === 'complete' || a.status === 'single',
      files: a.files,
    })),
  }
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(indexPayload, null, 2))

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------
  const byClass = { confident: 0, 'needs-review': 0, excluded: 0 }
  const byPart = {}
  for (const r of records) {
    byClass[r.classification]++
    const k = r.part || '(none)'
    byPart[k] = (byPart[k] || 0) + 1
  }

  writeDecisionBatches(OUT_DIR, {
    records,
    arrangements,
    incompleteList,
    dupGroups,
    dupExtra,
    byClass,
    byPart,
    junkCounts,
  })
  writeStragglers(OUT_DIR, records)

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------
  const line = (a, b) => `  ${String(a).padEnd(26)} ${b}`
  console.log('\n=== Repertoire index complete ===')
  console.log(line('PDFs indexed', records.length))
  console.log(line('  confident', byClass.confident))
  console.log(line('  needs-review', byClass['needs-review']))
  console.log(line('  excluded', byClass.excluded))
  console.log(line('Arrangements', arrangements.size))
  console.log(line('  complete/single', complete))
  console.log(line('  incomplete (core gap)', incomplete))
  console.log(line('  supplemental only', supplemental))
  console.log(line('Duplicate sets (sha256)', dupGroups))
  console.log(line('  redundant copies', dupExtra))
  console.log('  --- parts ---')
  for (const [k, v] of Object.entries(byPart).sort((a, b) => b[1] - a[1])) {
    console.log(line('  ' + k, v))
  }
  console.log('  --- junk excluded (not indexed) ---')
  for (const [k, v] of Object.entries(junkCounts)) console.log(line('  ' + k, v))
  console.log(`\nOutput -> ${OUT_DIR.split(path.sep).join('/')}/`)
}

// ---------------------------------------------------------------------------
// decision-batches.md  (grouped BY RULE, not by file)
// ---------------------------------------------------------------------------
function writeDecisionBatches(dir, ctx) {
  const { records, incompleteList, dupGroups, dupExtra, byClass, byPart, junkCounts } = ctx
  const ex = (pred, n = 5) =>
    records
      .filter(pred)
      .slice(0, n)
      .map((r) => `  - \`${r.relPath}\``)
      .join('\n')
  const count = (pred) => records.filter(pred).length

  let md = ''
  md += `# Repertoire Import - Decision Batches\n\n`
  md += `Generated ${new Date().toISOString()} from a read-only scan of the library.\n`
  md += `Review each RULE below (grouped, not file-by-file) and confirm the proposed default.\n\n`
  md += `## Summary\n\n`
  md += `| Classification | Count |\n|---|---|\n`
  md += `| confident | ${byClass.confident} |\n`
  md += `| needs-review | ${byClass['needs-review']} |\n`
  md += `| excluded | ${byClass.excluded} |\n`
  md += `| **total indexed** | **${records.length}** |\n\n`
  md += `Junk filtered before indexing: ${junkCounts.appleDouble} AppleDouble, ${junkCounts.dsStore} .DS_Store, ${junkCounts.zip} .zip, ${junkCounts.txt} .txt.\n\n`

  md += `## Rule-based decisions\n\n`

  const rules = [
    {
      title: 'Canonical "Title - Artist - part" files',
      count: count((r) => r.classification === 'confident' && r.artist && !r.substitute && !r.score && r.notes === ''),
      pred: (r) => r.classification === 'confident' && r.artist && !r.substitute && !r.score && r.notes === '',
      proposal: 'Import as-is. Title/artist/part all parsed from the filename. **YES**',
    },
    {
      title: 'Conductor SCORE files (part = "score")',
      count: count((r) => r.score),
      pred: (r) => r.score,
      proposal: 'Import with part="score" (reference/conductor copy, not a player part). **YES**',
    },
    {
      title: 'Naughtin numbered parts ("-0N Bass", "-0N Violin I")',
      count: count((r) => /naughtin numbered part/.test(r.notes)),
      pred: (r) => /naughtin numbered part/.test(r.notes),
      proposal: 'Import; part decoded from the "-0N <Part>" suffix (quintet bass etc.). **YES**',
    },
    {
      title: 'Bass / double-bass parts (db, contrabass) -> quintet bass',
      count: count((r) => r.part === 'bass'),
      pred: (r) => r.part === 'bass',
      proposal: 'Import as part="bass"; promotes its arrangement to a quintet. **YES**',
    },
    {
      title: 'Substitute parts ("vla for vc", "vln2 as vla")',
      count: count((r) => r.substitute),
      pred: (r) => r.substitute,
      proposal: 'Import with { part, playedOn, substitute:true } so the covering instrument is clear. **YES**',
    },
    {
      title: 'Long-form part names ("- Violin I", "- Viola", "- Cello", "(Cello part)")',
      count: count((r) => r.classification === 'confident' && !r.artist && !r.score && !r.substitute && !/naughtin/.test(r.notes)),
      pred: (r) => r.classification === 'confident' && !r.artist && !r.score && !r.substitute && !/naughtin/.test(r.notes),
      proposal: 'Import; part parsed from a long-form suffix. Artist blank (not in filename) - fill later if desired. **YES**',
    },
    {
      title: 'Checksum-identical duplicates (same file in two folders)',
      count: dupExtra,
      pred: () => false,
      proposal: `${dupGroups} sets, ${dupExtra} redundant copies. Import ONE, record the other path as an alias. **YES**`,
      extraExamples: records
        .filter((r) => r.aliasPaths && r.aliasPaths.length)
        .slice(0, 5)
        .map((r) => `  - \`${r.relPath}\`  <=  \`${r.aliasPaths.join('`, `')}\``)
        .join('\n'),
    },
    {
      title: 'Incomplete arrangements (missing an expected part)',
      count: incompleteList.length,
      pred: () => false,
      proposal: 'Import what exists and flag the gap (arrangementMissingParts). **YES**',
      extraExamples: incompleteList
        .slice(0, 8)
        .map((a) => `  - \`${a.title}\` (${a.ensemble}) missing: ${a.missingParts.join(', ')}`)
        .join('\n'),
    },
    {
      title: 'Non-string parts (harp / piano / lead sheet)',
      count: count((r) => r.part === 'other' && /non-string|harp|piano|lead sheet/.test(r.notes) && r.ensemble !== 'solo' && r.ensemble !== 'duo'),
      pred: (r) => r.part === 'other' && /non-string|harp|piano|lead sheet/.test(r.notes) && r.ensemble !== 'solo' && r.ensemble !== 'duo',
      proposal: 'Import as part="other" OR skip (not a string part). Default: import, low priority. **REVIEW**',
    },
    {
      title: 'Solo / duo whole-piece PDFs (single file, no split part)',
      count: count((r) => (r.ensemble === 'solo' || r.ensemble === 'duo') && r.part === 'other'),
      pred: (r) => (r.ensemble === 'solo' || r.ensemble === 'duo') && r.part === 'other',
      proposal: 'Import as the whole arrangement (solo/duo pieces are often one PDF). **YES**',
    },
    {
      title: 'Administrative / non-part files (index, printout, cover) -> excluded',
      count: count((r) => r.classification === 'excluded'),
      pred: (r) => r.classification === 'excluded',
      proposal: 'Exclude from import (not sheet music). **YES**',
    },
    {
      title: 'No part detected (title-only / lead sheet / full set)',
      count: count((r) => r.part === null && r.classification === 'needs-review'),
      pred: (r) => r.part === null && r.classification === 'needs-review',
      proposal: 'See stragglers.csv - individually reviewed with best guesses. **REVIEW**',
    },
  ]

  for (const rule of rules) {
    if (rule.count === 0) continue
    md += `### ${rule.title}\n\n`
    md += `- **Count:** ${rule.count}\n`
    md += `- **Examples:**\n${rule.extraExamples || ex(rule.pred)}\n`
    md += `- **Proposed default:** ${rule.proposal}\n\n`
  }

  // Stragglers narrative pointer
  const stragglerCount = records.filter(isStraggler).length
  md += `## Stragglers\n\n`
  md += `${stragglerCount} individually-ambiguous files are listed in \`stragglers.csv\` `
  md += `with per-file best guesses (title / artist / part / ensemble) and an \`action\` column for you to set import/skip.\n`

  fs.writeFileSync(path.join(dir, 'decision-batches.md'), md)
}

// A "straggler" = needs-review AND not part of a clean bulk rule.
function isStraggler(r) {
  if (r.classification !== 'needs-review') return false
  return true
}

// ---------------------------------------------------------------------------
// stragglers.csv
// ---------------------------------------------------------------------------
function csvCell(s) {
  const v = String(s == null ? '' : s)
  if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"'
  return v
}

function writeStragglers(dir, records) {
  const rows = records.filter(isStraggler)
  const header = ['relPath', 'guessTitle', 'guessArtist', 'guessPart', 'guessEnsemble', 'action', 'notes']
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.relPath),
        csvCell(r.title),
        csvCell(r.artist),
        csvCell(r.part || ''),
        csvCell(r.ensemble),
        'import', // default action; David flips to skip as needed
        csvCell(r.notes),
      ].join(',')
    )
  }
  fs.writeFileSync(path.join(dir, 'stragglers.csv'), lines.join('\n') + '\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
