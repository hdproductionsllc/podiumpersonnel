/**
 * site-library-gap.js — what the brand websites advertise that Podium can't build.
 *
 * The websites and the music library drifted apart: the sites list songs the
 * quartet plays but whose PDFs were never imported. A client can pick one of those
 * off the site, and the book builder then has nothing to give the players.
 *
 * This reads a site's music.html directly and diffs it against the live library.
 *
 *   node scripts/site-library-gap.js                     # default: Subito
 *   node scripts/site-library-gap.js --site <path/to/music.html>
 *   node scripts/site-library-gap.js --out tasks/missing-repertoire.md
 *
 * A song counts as DELIVERABLE if the library has it with every core part for its
 * ensemble, OR as a conductor score with no individual parts (the players read
 * scores off tablets — see isScoreOnly in src/lib/intake/matcher.ts).
 *
 * Matching is deliberately generous — HTML entities decoded, accents folded,
 * "No. 5"/"#5" folded, plus a token-subset fallback — because over-reporting a gap
 * sends David hunting for sheet music he already owns. Treat the count as close,
 * not exact.
 */
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const ORG = '6edbf230-e43a-42c0-a60d-8cd67be87276'
const DEFAULT_SITE = 'C:/Users/david/Documents/subitostrings.com/redesign-output/music.html'

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è', uuml: 'ü', auml: 'ä', ouml: 'ö', iuml: 'ï', ccedil: 'ç', agrave: 'à', acirc: 'â', ecirc: 'ê', ocirc: 'ô', uacute: 'ú', aacute: 'á', iacute: 'í', oacute: 'ó', ntilde: 'ñ', szlig: 'ß', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: '-', mdash: '-', hellip: '...' }
const decode = (s) => String(s || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, c) => {
  if (c[0] === '#') { const hex = c[1].toLowerCase() === 'x'; return String.fromCodePoint(parseInt(hex ? c.slice(2) : c.slice(1), hex ? 16 : 10)) }
  return ENT[c.toLowerCase()] !== undefined ? ENT[c.toLowerCase()] : m
})
const STOP = new Set(['the', 'a', 'an', 'from', 'for', 'of', 'in', 'op', 'no', 'and', 'to', 'is', 'on', 'my', 'me', 'you', 'i'])
const N = (s) => decode(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
const toks = (s) => N(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w) && !/^(no|mvt|movement|op|major|minor)$/.test(w))
const numFold = (s) => N(s).replace(/\bno\s*(\d+)/g, '$1').replace(/\bdances\b/g, 'dance')

function rest() {
  const text = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  const k = text.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
  return { base: text.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim().replace(/\/$/, ''), headers: { apikey: k, Authorization: 'Bearer ' + k } }
}
async function all(r, table, cols, extra = '') {
  const out = []
  for (let f = 0; ; f += 1000) {
    const res = await fetch(`${r.base}/rest/v1/${table}?organization_id=eq.${ORG}&select=${cols}${extra}`, { headers: { ...r.headers, Range: `${f}-${f + 999}`, 'Range-Unit': 'items' } })
    if (!res.ok) throw new Error(`GET ${table}: ${res.status}`)
    const p = await res.json(); out.push(...p); if (p.length < 1000) break
  }
  return out
}

function categorize(s) {
  const b = (s.title + ' ' + s.artist).toLowerCase()
  if (/jewish|chanukah|hanukkah|hava|hine|dodi|ose shalom|klezmer|bashana|siman|erev|shalom|israel/.test(b)) return 'Jewish'
  if (/christmas|carol|noel|manger|advent|bethlehem|silent night|coventry|santa|winter wonder|sleigh|holly|jingle|charlie brown|auld lang/.test(b)) return 'Holiday'
  if (/bach|mozart|beethoven|brahms|handel|vivaldi|debussy|satie|schumann|strauss|straus|puccini|bizet|donizetti|rimsky|elgar|faure|chopin|liszt|dvorak|grieg|verdi|rossini|tchaik|massenet|gluck|purcell/.test(b)) return 'Classical'
  if (/zimmer|aladdin|rota|mohicans|spirited|castamere|chrono|toy story|sixteen candles|thrones|disney|pixar|star wars|potter/.test(b)) return 'Film / TV / Games'
  return 'Pop & Modern'
}

async function main() {
  const argv = process.argv.slice(2)
  const site = argv.includes('--site') ? argv[argv.indexOf('--site') + 1] : DEFAULT_SITE
  const out = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null
  const r = rest()

  const html = fs.readFileSync(site, 'utf8')
  const songs = [...html.matchAll(/<span class="song-title">([^<]+)<\/span><span class="song-artist">([^<]*)<\/span>/g)]
    .map((m) => ({ title: decode(m[1].trim()), artist: decode(m[2].trim()) }))
  if (!songs.length) throw new Error(`no songs parsed from ${site}`)

  const rep = await all(r, 'repertoire', 'id,title,artist,ensemble,norm_title', '&is_active=eq.true')
  const parts = await all(r, 'repertoire_parts', 'repertoire_id,part')
  const aliases = await all(r, 'title_aliases', 'alias_norm,repertoire_id')
  const by = new Map()
  parts.forEach((p) => { if (!by.has(p.repertoire_id)) by.set(p.repertoire_id, new Set()); by.get(p.repertoire_id).add(p.part) })

  const CORE = ['vln1', 'vln2', 'vla', 'vc']
  const bookable = (id) => {
    const h = by.get(id) || new Set()
    return CORE.every((p) => h.has(p)) || (h.has('score') && !CORE.some((p) => h.has(p))) || (h.has('vln1') && h.has('vln2') && h.has('vc'))
  }
  const idx = new Map()
  const add = (k, id) => { if (!k) return; if (!idx.has(k)) idx.set(k, new Set()); idx.get(k).add(id) }
  rep.forEach((x) => { add(N(x.title), x.id); add(N(x.norm_title), x.id); add(numFold(x.title), x.id) })
  aliases.forEach((a) => add(N(a.alias_norm), a.repertoire_id))
  const repIdx = rep.map((x) => ({ id: x.id, n: N(x.title), t: toks(x.title) }))

  const deliverable = [], absent = [], incomplete = []
  for (const s of songs) {
    const n = N(s.title)
    let ids = [...(idx.get(n) || idx.get(numFold(s.title)) || [])]
    if (!ids.length) ids = repIdx.filter((x) => x.n && ((n.length > 5 && x.n.includes(n)) || (x.n.length > 5 && n.includes(x.n)))).map((x) => x.id)
    if (!ids.length) {
      const st = toks(s.title)
      if (st.length >= 2) ids = repIdx.filter((x) => {
        if (!x.t.length) return false
        const [small, big] = st.length <= x.t.length ? [st, x.t] : [x.t, st]
        return small.length >= 2 && small.every((w) => big.includes(w))
      }).map((x) => x.id)
    }
    if (!ids.length) { absent.push(s); continue }
    if (ids.some(bookable)) deliverable.push(s)
    else incomplete.push({ ...s, lib: rep.find((x) => x.id === ids[0])?.title })
  }

  console.log(`\n♪ Site vs library — ${path.basename(path.dirname(site))}`)
  console.log(`  advertised on the site : ${songs.length}`)
  console.log(`  deliverable            : ${deliverable.length}`)
  console.log(`  in library, incomplete : ${incomplete.length}`)
  console.log(`  ABSENT from library    : ${absent.length}\n`)

  const groups = new Map()
  absent.forEach((s) => { const c = categorize(s); if (!groups.has(c)) groups.set(c, []); groups.get(c).push(s) })
  for (const [c, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${String(list.length).padStart(3)}  ${c}`)

  if (out) {
    const stamp = new Date().toISOString().slice(0, 10)
    let md = `# Missing repertoire — advertised but not in the library\n\n` +
      `_Generated ${stamp} by \`node scripts/site-library-gap.js --out ${out}\`_\n\n` +
      `The websites list songs the quartet plays whose PDFs were never imported into\n` +
      `Podium. A client can pick one of these off the site and the book builder has\n` +
      `nothing to give the players.\n\n` +
      `| | count |\n|---|---|\n` +
      `| Advertised on the site | ${songs.length} |\n` +
      `| Deliverable today | ${deliverable.length} |\n` +
      `| In the library but incomplete | ${incomplete.length} |\n` +
      `| **Absent — need the PDFs** | **${absent.length}** |\n\n` +
      `**Any website catalog import must be ADDITIVE.** Replacing the site list with a\n` +
      `Podium export would delete every song below from the page.\n\n` +
      `Matching is generous (entities decoded, accents folded, token-subset fallback),\n` +
      `but a piece filed under a very different name could still show here. Search the\n` +
      `library before concluding a song is truly missing.\n\n## Absent — the shopping list\n\n`
    for (const [c, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
      md += `### ${c} (${list.length})\n\n`
      list.sort((a, b) => a.title.localeCompare(b.title)).forEach((s) => { md += `- [ ] ${s.title}${s.artist ? ` — ${s.artist}` : ''}\n` })
      md += '\n'
    }
    if (incomplete.length) {
      md += `## In the library but not bookable (${incomplete.length})\n\n` +
        `Cheaper to fix — the song is already there, it just can't build a full book.\n` +
        `Often a missing part file, a duo/solo-only arrangement, or a filing error.\n\n`
      incomplete.sort((a, b) => a.title.localeCompare(b.title)).forEach((s) => { md += `- [ ] ${s.title} → library row \`${s.lib}\`\n` })
      md += '\n'
    }
    fs.mkdirSync(path.dirname(path.join(ROOT, out)), { recursive: true })
    fs.writeFileSync(path.join(ROOT, out), md)
    console.log(`\n  written: ${out}\n`)
  }
}

main().catch((e) => { console.error('\nFailed:', e.message); process.exitCode = 1 })
