/**
 * export-catalog.js — publish-ready song list for the brand websites.
 *
 * David updates podiumpersonnel.com / subitostrings.com / etc. by hand. This
 * turns the live shared library into paste-ready files, and — importantly —
 * REFUSES to silently publish the messy rows. Anything that isn't presentable
 * lands in a review file instead of on a customer-facing page.
 *
 * The library is an internal working index: some titles are raw filenames
 * ("Enchanted_-_Taylor_Swift_Easy"), some are fragments with no playable parts,
 * some have no artist. None of that belongs on a website.
 *
 *   node scripts/export-catalog.js            # write the files
 *   node scripts/export-catalog.js --open     # ...and print the summary
 *   node scripts/export-catalog.js --org <id>
 *
 * Outputs to scripts/repertoire-out/catalog/ :
 *   catalog.md    — grouped A–Z, "Title — Artist"      (paste into a CMS)
 *   catalog.txt   — one per line, no artists           (simple list blocks)
 *   catalog.csv   — Title,Artist,Ensembles             (spreadsheets / Squarespace)
 *   catalog.html  — styled, searchable, self-contained (drop-in page or preview)
 *   NEEDS-REVIEW.md — everything held back, and why
 *
 * INCLUSION RULE: a song is published only if it is bookable (all core parts for
 * its ensemble are present) AND its title reads like a song title. Everything
 * else is held back for review — never dropped silently.
 */
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'scripts', 'repertoire-out', 'catalog')
const DEFAULT_ORG = '6edbf230-e43a-42c0-a60d-8cd67be87276' // Project String Quartet (shared library)

const CORE = ['vln1', 'vln2', 'vla', 'vc']
const EXPECTED = {
  quartet: CORE,
  quintet: CORE, // bass is a bonus
  trio: ['vln1', 'vln2', 'vc'],
  'viola-trio': ['vln1', 'vln2', 'vla'],
  duo: [], // whole-piece single PDF
  solo: [],
  other: [],
}

// ---------------------------------------------------------------------------
function loadEnv() {
  const text = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  const url = text.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
  const key = text.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
  return { base: url.replace(/\/$/, ''), headers: { apikey: key, Authorization: 'Bearer ' + key } }
}

async function selectAll(rest, table, cols, org, extra = '') {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const res = await fetch(
      `${rest.base}/rest/v1/${table}?organization_id=eq.${org}&select=${cols}${extra}`,
      { headers: { ...rest.headers, Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } }
    )
    if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`)
    const page = await res.json()
    rows.push(...page)
    if (page.length < 1000) break
  }
  return rows
}

// ---------------------------------------------------------------------------
// Title cleanup — cosmetic only. Never invents information.
// ---------------------------------------------------------------------------
function tidyTitle(raw) {
  let t = String(raw || '')
  t = t.replace(/_/g, ' ') // filename underscores
  t = t.replace(/\.pdf$/i, '')
  t = t.replace(/\s*-\s*\d+\s*pages?\b/gi, '') // "- 47 pages"
  t = t.replace(/\bfor[\s-]*string[\s-]*(quartet|trio|quintet|duo)\b/gi, ' ')
  t = t.replace(/\b(string\s+)?(quartet|quintet|trio|duo|duet)\b\s*$/i, ' ')
  t = t.replace(/\s*\bprint(out)?\b\s*$/i, ' ')
  t = t.replace(/\s*\(\s*\d+\s*\)\s*$/, ' ') // "(1)" copy suffix
  // A part name that leaked into the title: "Air in F Viola", "If I Ain't Got You Violin Cello".
  // Only ever stripped from the END, so "Double Violin Concerto" survives intact.
  t = t.replace(/\s+(violin\s*(1|2|i{1,2})?\s*(and\s*)?)?(viola|violoncello|cello|vc|score)\s*$/i, ' ')
  t = t.replace(/\s+violin\s*(1|2|i{1,2})\s*$/i, ' ')
  // "Bass" is only a part name in a compound ("String Bass", "Violin and Bass").
  // A bare trailing "bass" is usually part of the song — "All About That Bass".
  t = t.replace(/\s+(violin|string|double|upright|contra)\s*(and\s+)?bass\s*$/i, ' ')
  t = t.replace(/\s*-\s*$/, '')
  t = t.replace(/\s{2,}/g, ' ').trim()
  return t
}

// Artist fields carry the same working-file cruft as titles ("Queen Easy", "Copy").
const ARTIST_JUNK =
  /^((string\s+)?(quartet|quintet|trio|duo|duet)|copy|score|part|parts|old|easy|fixed|new|update[d]?|version|print(out)?|v\d+|unknown|n\/?a|misc|tbd|(violin|viola|cello|violoncello|bass|vc|vln1|vln2|vla)(\s+(violin|viola|cello|bass|1|2|i{1,2}))*)$/i

function tidyArtist(raw) {
  let a = String(raw || '').replace(/_/g, ' ').trim()
  // an ensemble label appended to the artist: "Queen - String Trio"
  a = a.replace(/\s*[-–—]\s*(string\s+)?(quartet|quintet|trio|duo|duet)\s*$/i, '').trim()
  a = a.replace(/\s+(easy|slower|faster|copy|fixed|old|print(out)?|update[d]?|v\d+)\s*$/i, '').trim()
  a = a.replace(/\s{2,}/g, ' ')
  if (!a || ARTIST_JUNK.test(a)) return null
  return a
}

/** Pull "Title - Artist" apart ONLY on an explicit separator. Never guesses. */
function splitEmbeddedArtist(title) {
  const m = title.match(/^(.{2,}?)\s+-\s+(.{2,})$/)
  if (!m) return { title, artist: null }
  const [, left, right] = m
  // right side must look like a name, not a qualifier ("in D", "Easy", "Movement 2")
  if (/^\s*(easy|slow|fast|in\s+\w+|mvt|movement|no\.?\s*\d+|v\d+|\d+)\b/i.test(right)) {
    return { title, artist: null }
  }
  return { title: left.trim(), artist: right.trim() }
}

/** Does this read like a song title a customer should see? */
function presentable(title) {
  if (!title || title.length < 2) return 'empty title'
  if (title.length > 90) return 'suspiciously long'
  if (/^\d{2}\s/.test(title)) return 'leading file-sort number'
  // NB: a bare trailing "bass" is not a part marker — "All About That Bass".
  if (/\b(score|parts?)\s*$/i.test(title)) return 'looks like a part file, not a song'
  if (/\b(string|double|upright|contra)\s+bass\s*$/i.test(title)) return 'looks like a part file, not a song'
  if (/\bduets?\s+cubed\b/i.test(title)) return 'exercise/method book'
  if (/[_]{1,}/.test(title)) return 'raw filename underscores'
  if (/\.(pdf|mus|sib)\b/i.test(title)) return 'filename extension'
  if (/^[a-z]/.test(title) && /-/.test(title)) return 'lowercase filename slug'
  if (/\b(copy|fixed|old|too hard|update[d]?|version)\b/i.test(title)) return 'working-file annotation'
  if (/^(db|test|tmp|untitled)\b/i.test(title)) return 'scratch/working title'
  return null // presentable
}

function titleCase(s) {
  const small = /^(a|an|and|as|at|but|by|for|from|in|nor|of|on|or|the|to|with)$/i
  return s
    .split(/\s+/)
    .map((w, i) => {
      if (i > 0 && small.test(w)) return w.toLowerCase()
      if (/[A-Z]/.test(w.slice(1))) return w // already has internal caps — leave it
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join(' ')
}

const sortKey = (s) =>
  s
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()

// ---------------------------------------------------------------------------
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
const csvCell = (s) => (/[",\n]/.test(s) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s))

// ---------------------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2)
  const org = argv.includes('--org') ? argv[argv.indexOf('--org') + 1] : DEFAULT_ORG
  const rest = loadEnv()

  const rep = await selectAll(rest, 'repertoire', 'id,title,artist,ensemble,tags', org, '&is_active=eq.true')
  const parts = await selectAll(rest, 'repertoire_parts', 'repertoire_id,part', org)

  const partsBy = new Map()
  for (const p of parts) {
    if (!partsBy.has(p.repertoire_id)) partsBy.set(p.repertoire_id, new Set())
    partsBy.get(p.repertoire_id).add(p.part)
  }

  const published = new Map() // key -> {title, artist, ensembles:Set}
  const held = []

  for (const row of rep) {
    const have = partsBy.get(row.id) || new Set()
    const need = EXPECTED[row.ensemble] ?? CORE

    // gate 1 — bookable?
    const missing = need.filter((p) => !have.has(p))
    if (missing.length) {
      held.push({ ...row, why: `missing ${missing.join(', ')}` })
      continue
    }
    if (!need.length && have.size === 0) {
      held.push({ ...row, why: 'no part files' })
      continue
    }

    // gate 2 — presentable title?
    let title = tidyTitle(row.title)
    let artist = tidyArtist(row.artist)
    if (!artist) {
      const s = splitEmbeddedArtist(title)
      title = s.title
      artist = tidyArtist(s.artist)
    }
    title = tidyTitle(title)
    const bad = presentable(title)
    if (bad) {
      held.push({ ...row, cleaned: title, why: bad })
      continue
    }
    if (!artist) {
      held.push({ ...row, cleaned: title, why: 'no artist/composer' })
      continue
    }

    title = titleCase(title)
    const key = (sortKey(title) + '|' + sortKey(artist)).trim()
    if (!published.has(key)) published.set(key, { title, artist, ensembles: new Set() })
    published.get(key).ensembles.add(row.ensemble)
  }

  // Same song listed twice because the composer is spelled two ways
  // ("Bach" / "J.S. Bach"). Merge only when one name contains the other —
  // never merge two genuinely different artists who share a title.
  const byTitle = new Map()
  for (const s of published.values()) {
    const t = sortKey(s.title)
    if (!byTitle.has(t)) byTitle.set(t, [])
    byTitle.get(t).push(s)
  }
  const merged = []
  for (const group of byTitle.values()) {
    const kept = []
    for (const s of group.sort((a, b) => b.artist.length - a.artist.length)) {
      const host = kept.find((k) => {
        const [x, y] = [sortKey(k.artist), sortKey(s.artist)]
        return x === y || x.includes(y) || y.includes(x)
      })
      if (host) s.ensembles.forEach((e) => host.ensembles.add(e))
      else kept.push(s)
    }
    merged.push(...kept)
  }

  const songs = merged.sort(
    (a, b) => sortKey(a.title).localeCompare(sortKey(b.title)) || a.artist.localeCompare(b.artist)
  )

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)

  // --- grouped A–Z ---
  const groups = new Map()
  for (const s of songs) {
    const c = (sortKey(s.title)[0] || '#').toUpperCase()
    const g = /[A-Z]/.test(c) ? c : '#'
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g).push(s)
  }
  const letters = [...groups.keys()].sort()

  // --- markdown ---
  // catalog.md doubles as the hand-off brief for whoever builds a website page,
  // so the caveats travel WITH the data instead of living in a chat message.
  let md =
    `# Song Catalog\n\n**${songs.length} songs** · exported ${stamp} from the Podium shared ` +
    `music library.\n\n` +
    `## What this list is\n\n` +
    `Every song here is a real, complete, bookable arrangement — all core string parts are\n` +
    `on file. Unbookable rows and raw-filename titles were held back, so this is safe to\n` +
    `publish as-is. See NEEDS-REVIEW.md for what was excluded and why.\n\n` +
    `## Notes for building the page\n\n` +
    `- Format is \`Title — Artist\`. Artist = performer for pop, composer for classical.\n` +
    `- Sorted alphabetically by title, ignoring a leading "The/A/An".\n` +
    `- **No genre data exists**, so if the page groups by Classical / Pop / Wedding, that\n` +
    `  grouping has to be applied by hand.\n` +
    `- Two songs appear twice under different artist spellings (composer vs performer):\n` +
    `  "What a Wonderful World" and "The Four Seasons". Pick one of each if you dedupe.\n` +
    `- Regenerate any time with \`node scripts/export-catalog.js\` in the Podium repo.\n\n` +
    `---\n\n`
  for (const L of letters) {
    md += `## ${L}\n\n`
    for (const s of groups.get(L)) md += `- ${s.title} — ${s.artist}\n`
    md += '\n'
  }
  fs.writeFileSync(path.join(OUT_DIR, 'catalog.md'), md)

  // --- plain text ---
  fs.writeFileSync(path.join(OUT_DIR, 'catalog.txt'), songs.map((s) => `${s.title} - ${s.artist}`).join('\n') + '\n')

  // --- csv ---
  const csv = ['Title,Artist,Ensembles']
    .concat(songs.map((s) => [s.title, s.artist, [...s.ensembles].sort().join(' / ')].map(csvCell).join(',')))
    .join('\n')
  fs.writeFileSync(path.join(OUT_DIR, 'catalog.csv'), csv + '\n')

  // --- html (self-contained, searchable) ---
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Song Catalog</title>
<style>
  :root{--fg:#1a1a1a;--dim:#6b6b6b;--line:#e5e3df;--bg:#fdfcfa;--accent:#8a6a3b}
  @media (prefers-color-scheme:dark){:root{--fg:#ececec;--dim:#9a9a9a;--line:#2e2e2e;--bg:#151515;--accent:#c9a227}}
  *{box-sizing:border-box}
  body{margin:0;padding:3rem 1.25rem;background:var(--bg);color:var(--fg);
       font:16px/1.6 Georgia,'Iowan Old Style',serif}
  .wrap{max-width:820px;margin:0 auto}
  h1{font-size:2rem;margin:0 0 .25rem;letter-spacing:-.01em}
  .meta{color:var(--dim);font-size:.9rem;margin-bottom:2rem}
  #q{width:100%;padding:.7rem .9rem;font:inherit;font-size:1rem;color:var(--fg);
     background:transparent;border:1px solid var(--line);border-radius:6px;margin-bottom:2rem}
  #q:focus{outline:none;border-color:var(--accent)}
  h2{font-size:.8rem;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);
     margin:2.25rem 0 .6rem;padding-bottom:.35rem;border-bottom:1px solid var(--line)}
  ul{list-style:none;margin:0;padding:0}
  li{padding:.3rem 0;border-bottom:1px solid transparent}
  .t{font-weight:600}
  .a{color:var(--dim);font-size:.92rem}
  .a::before{content:" — "}
  .empty{color:var(--dim);font-style:italic;display:none}
</style></head><body><div class="wrap">
<h1>Song Catalog</h1>
<div class="meta">${songs.length} songs · updated ${stamp}</div>
<input id="q" type="search" placeholder="Search by title or artist…" autocomplete="off">
${letters
  .map(
    (L) =>
      `<section data-l="${L}"><h2>${L}</h2><ul>` +
      groups
        .get(L)
        .map((s) => `<li data-s="${esc((s.title + ' ' + s.artist).toLowerCase())}"><span class="t">${esc(s.title)}</span><span class="a">${esc(s.artist)}</span></li>`)
        .join('') +
      `</ul></section>`
  )
  .join('\n')}
<p class="empty" id="none">No songs match that search.</p>
<script>
  var q=document.getElementById('q'),none=document.getElementById('none');
  q.addEventListener('input',function(){
    var v=q.value.trim().toLowerCase(),shown=0;
    document.querySelectorAll('section[data-l]').forEach(function(sec){
      var n=0;
      sec.querySelectorAll('li').forEach(function(li){
        var hit=!v||li.dataset.s.indexOf(v)>-1;
        li.style.display=hit?'':'none'; if(hit)n++;
      });
      sec.style.display=n?'':'none'; shown+=n;
    });
    none.style.display=shown?'none':'block';
  });
</script>
</div></body></html>`
  fs.writeFileSync(path.join(OUT_DIR, 'catalog.html'), html)

  // --- review file: everything held back, grouped by reason ---
  const byReason = new Map()
  for (const h of held) {
    if (!byReason.has(h.why)) byReason.set(h.why, [])
    byReason.get(h.why).push(h)
  }
  let rv = `# Held back from the public catalog\n\n` +
    `${held.length} of ${rep.length} active works are NOT in the published list.\n` +
    `Nothing here is deleted — it is still bookable in Podium. This is only about\n` +
    `what is presentable on a customer-facing page.\n\n`
  for (const [why, rows] of [...byReason.entries()].sort((a, b) => b[1].length - a[1].length)) {
    rv += `## ${why} (${rows.length})\n\n`
    for (const r of rows.sort((a, b) => a.title.localeCompare(b.title))) {
      rv += `- \`${r.title}\`${r.cleaned && r.cleaned !== r.title ? ` → cleans to \`${r.cleaned}\`` : ''} _(${r.ensemble})_\n`
    }
    rv += '\n'
  }
  // Same title published under two different artist names (composer vs performer,
  // e.g. "What a Wonderful World" under both Louis Armstrong and Weiss/Thiele).
  // Too risky to auto-merge — surfaced so David can pick one.
  const dupTitles = [...byTitle.values()]
    .map((g) => merged.filter((m) => sortKey(m.title) === sortKey(g[0].title)))
    .filter((g) => g.length > 1)
  const seenDup = new Set()
  const dups = dupTitles.filter((g) => {
    const k = sortKey(g[0].title)
    if (seenDup.has(k)) return false
    seenDup.add(k)
    return true
  })
  if (dups.length) {
    rv += `## listed twice — same title, different artist name (${dups.length})\n\n`
    rv += `Both are published. Pick one if you'd rather not show the song twice.\n\n`
    for (const g of dups) {
      rv += `- **${g[0].title}** — ${g.map((x) => `\`${x.artist}\``).join(' vs ')}\n`
    }
    rv += '\n'
  }
  fs.writeFileSync(path.join(OUT_DIR, 'NEEDS-REVIEW.md'), rv)

  console.log(`\n♪ Catalog export`)
  console.log(`  active works in library : ${rep.length}`)
  console.log(`  PUBLISHED              : ${songs.length} songs`)
  console.log(`  held for review        : ${held.length}`)
  for (const [why, rows] of [...byReason.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`      ${String(rows.length).padStart(4)}  ${why}`)
  }
  console.log(`\n  written to scripts/repertoire-out/catalog/`)
  console.log(`      catalog.md  catalog.txt  catalog.csv  catalog.html  NEEDS-REVIEW.md\n`)
}

main().catch((e) => {
  console.error('\nExport failed:', e.message)
  process.exitCode = 1
})
