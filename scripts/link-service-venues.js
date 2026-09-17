/*
 * Link gigs to the venue records they already name.
 *
 * Usage:
 *   node scripts/link-service-venues.js          # backup + dry-run (no writes)
 *   node scripts/link-service-venues.js --apply  # backup + set the venue_id links
 *
 * Why this exists: gig-details and offer emails read the address and the Google Maps
 * link from the LINKED venue record (services.venue_id), never from the venue text.
 * A gig whose venue was typed rather than picked keeps the text and loses the link,
 * so musicians get a bare venue name with no address and nothing to tap. Migration
 * 059 repaired this once in 2026; nothing re-runs it, so the gap reopened.
 *
 * Matching uses src/lib/venue-match.js — the same rule the venue picker applies live,
 * so this script can never link a gig the picker would have left alone, or the reverse.
 * It links only when exactly one venue in the SAME organization answers to the name.
 * Ties are reported, never guessed: two venues really are called "Our Lady of Solitude
 * Church", and picking the wrong one sends musicians to a different city.
 *
 * Gigs whose venue has no record at all are reported too. The script will not invent
 * a venue, because an address is not something it can know.
 *
 * Safe to re-run. A JSON backup of every row it touches is written to scripts/backups/
 * first, so a link can be undone by hand.
 */
const fs = require('fs')
const path = require('path')
const { matchSavedVenue } = require('../src/lib/venue-match')

const env = fs.readFileSync('.env.local', 'utf8')
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()
const H = { apikey: key, Authorization: 'Bearer ' + key }
const APPLY = process.argv.includes('--apply')

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

async function get(p) {
  const r = await fetch(url + '/rest/v1/' + p, { headers: H })
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status} ${await r.text()}`)
  return r.json()
}
async function patch(p, body) {
  const r = await fetch(url + '/rest/v1/' + p, {
    method: 'PATCH',
    headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`PATCH ${p} -> ${r.status} ${await r.text()}`)
  return r.json()
}

// The two venue slots a gig can have: primary, and an optional second location.
const SLOTS = [
  { text: 'venue', link: 'venue_id', label: 'venue' },
  { text: 'venue_2', link: 'venue_id_2', label: 'venue 2' },
]

function hasText(v) {
  return typeof v === 'string' && v.trim() !== ''
}

async function main() {
  console.log(APPLY ? 'MODE: APPLY (writing)\n' : 'MODE: dry run (no writes)\n')

  const venues = await get('venues?select=id,name,organization_id,address,city,state,zip,google_maps_url&limit=5000')
  const services = await get(
    'services?select=id,name,venue,venue_id,venue_2,venue_id_2,start_time,project:projects(id,name,organization_id)&limit=5000'
  )

  const byOrg = new Map()
  for (const v of venues) {
    if (!byOrg.has(v.organization_id)) byOrg.set(v.organization_id, [])
    byOrg.get(v.organization_id).push(v)
  }

  const toLink = []   // { service, slot, venue }
  const ambiguous = []
  const unmatched = []

  for (const s of services) {
    const orgId = s.project?.organization_id
    if (!orgId) continue
    const orgVenues = byOrg.get(orgId) || []

    for (const slot of SLOTS) {
      // Only gigs that name a venue but point at nothing.
      if (!hasText(s[slot.text]) || s[slot.link]) continue

      const { venue, candidates } = matchSavedVenue(s[slot.text], orgVenues)
      const row = { service: s, slot, text: s[slot.text], orgId }

      if (venue) toLink.push({ ...row, venue })
      else if (candidates.length > 1) ambiguous.push({ ...row, candidates })
      else unmatched.push(row)
    }
  }

  const when = (s) => (s.start_time ? s.start_time.slice(0, 10) : '  no date ')
  const where = (r) => `${when(r.service)}  ${r.text}${r.slot.label === 'venue 2' ? '  [2nd location]' : ''}`

  console.log(`== WILL LINK (${toLink.length}) ==`)
  for (const r of toLink) {
    const addr = r.venue.address || r.venue.city || (r.venue.google_maps_url ? 'map link only' : 'NO ADDRESS ON FILE')
    console.log(`  ${where(r)}\n      -> ${r.venue.id}  (${addr})`)
  }

  console.log(`\n== AMBIGUOUS, left alone (${ambiguous.length}) ==`)
  for (const r of ambiguous) {
    console.log(`  ${where(r)}  -> ${r.candidates.length} venues share this name; link it by hand`)
  }

  console.log(`\n== NO VENUE RECORD, needs one created with a real address (${unmatched.length}) ==`)
  for (const r of unmatched) console.log(`  ${where(r)}`)

  if (!toLink.length) {
    console.log('\nNothing to link.')
    return
  }

  // Back up the rows we are about to touch, before touching them.
  const dir = path.join('scripts', 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(dir, `service-venue-links-${stamp}.json`)
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      toLink.map((r) => ({
        service_id: r.service.id,
        service_name: r.service.name,
        project: r.service.project?.name,
        column: r.slot.link,
        previous_value: r.service[r.slot.link] ?? null,
        new_value: r.venue.id,
        venue_text: r.text,
      })),
      null,
      2
    )
  )
  console.log(`\nBackup written: ${backupPath}`)

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to link these.')
    return
  }

  let done = 0
  for (const r of toLink) {
    await patch(`services?id=eq.${r.service.id}`, { [r.slot.link]: r.venue.id })
    done++
  }
  console.log(`\nLinked ${done} venue reference${done === 1 ? '' : 's'}.`)
  console.log('No emails were sent. Re-send gig details only if you intend to.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
