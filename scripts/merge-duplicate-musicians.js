/*
 * One-time cleanup: merge confident duplicate musician records.
 *
 * Usage:
 *   node scripts/merge-duplicate-musicians.js          # backup + dry-run (no writes)
 *   node scripts/merge-duplicate-musicians.js --apply  # backup + perform the merges
 *
 * Rules (decided with the product owner, 2026-06-08):
 *   - Only "confident" pairs: each pair has a clear KEEPER (the record WITH an email).
 *   - Never cross organizations.
 *   - Merge, not delete: move the twin's history onto the keeper, fill the keeper's
 *     blank fields from the twin, then delete the emptied twin.
 *
 * A full backup of every involved musician row + its foreign-key rows is written to
 * scripts/backups/ before any change, so a merge can be undone by hand if needed.
 */
const fs = require('fs')
const path = require('path')

const env = fs.readFileSync('.env.local', 'utf8')
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()
const H = { apikey: key, Authorization: 'Bearer ' + key }
const APPLY = process.argv.includes('--apply')

// [label, keeperId, twinId]  — keeper is the record that has the email.
const PAIRS = [
  ['Shelly Ren [Subito Strings]',     '89fbd6fd-d43a-4759-a888-ea04b9813ad5', 'af65d639-c505-4d55-be5b-b1677d47b06e'],
  ['Foster Wang [Meridian]',          '206e29a4-36f1-4c16-a683-13805084747f', '2640e3fd-7df2-4d15-b03e-7589f65b3993'],
  ['Ruzanna Sargsyan [Subito Strings]','46b529ef-6ecc-4122-aef1-1257f2d419ce', '632c7b4c-80fa-4d57-8ef4-66f3e741ec30'],
  ['Amanda Marshall [Subito Strings]','eea5b817-15ae-4b3b-86ae-68bef055da02', 'a187a964-edb7-420d-a963-279a48b8adc6'],
  ['Leah Metzler [Subito Strings]',   '6269a343-91d7-40ed-9afe-b0bbe46f3a0d', '1a1f4ac0-5f09-4b22-b190-2e8f75a24dec'],
  ['Rachel Halvorson [Meridian]',     '536a1d46-82d2-45d8-8ac3-0b6811dfdcea', '9e003a1e-7ce9-4d1f-9728-386d86eb19ac'],
  ['Danielle Cho [Meridian]',         '4847c282-45ad-44e0-aa06-d37246ea4be1', '07344c0c-5b27-4031-b10f-98e934bcabfd'],
  ['Graham Woodland [Project SQ]',    '28df3de5-d6e4-4efe-9c21-18b3e691cbd8', 'f9720941-a258-4908-8c84-8b6b4dfb2466'],
  ['Victoria Bietz [Subito Strings]', 'd58c7a73-61a1-42b0-957a-bfc2c1cc2ef9', '79c54e07-d9dd-44ce-b72d-3e3462c746c3'],
  ['Mc Kayla Talasek [Project SQ]',   '5c3f762a-7279-4fa2-93b8-3eca183eea0a', '0efc9a19-63d3-4445-a751-7deb6efb2eb3'],
  ['Tara Santiago [Project SQ]',      '9073d633-dbe5-46de-9d19-ead9f4d66f7b', 'a4214e71-b080-4648-b8e5-b66e29354f9c'],
  ['Christopher Ahn [Subito Strings]','511daa75-dc34-48eb-9241-891449d365ec', '2ffc84d6-4984-4844-937c-125b1b2c722c'],
]

// Tables that reference musicians, and the column. Plain FK reassignments unless noted.
const FK = [
  ['book_entries', 'musician_id'],
  ['project_positions', 'musician_id'],
  ['contract_offers', 'musician_id'],
  ['substitution_requests', 'requesting_musician_id'],
  ['substitution_requests', 'substitute_musician_id'],
  ['competing_schedules', 'musician_id'],
  ['payments', 'musician_id'],
]

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
async function del(p) {
  const r = await fetch(url + '/rest/v1/' + p, { method: 'DELETE', headers: { ...H, Prefer: 'return=representation' } })
  if (!r.ok) throw new Error(`DELETE ${p} -> ${r.status} ${await r.text()}`)
  return r.json()
}

// Fields we never copy from the twin (identity / bookkeeping columns).
const SKIP_FIELDS = new Set(['id', 'created_at', 'updated_at', 'organization_id', 'first_name', 'last_name'])
function isEmpty(v) { return v === null || v === undefined || (typeof v === 'string' && v.trim() === '') }

async function main() {
  const ids = PAIRS.flatMap(([, k, t]) => [k, t])
  const inList = '(' + ids.join(',') + ')'

  // ---- BACKUP ----
  const backup = { when: new Date().toISOString(), musicians: {}, fk: {}, musician_instruments: {} }
  backup.musicians = await get(`musicians?id=in.${inList}&select=*`)
  for (const [t, c] of FK) {
    backup.fk[`${t}.${c}`] = await get(`${t}?${c}=in.${inList}&select=*`)
  }
  backup.musician_instruments = await get(`musician_instruments?musician_id=in.${inList}&select=*`)
  const dir = path.join('scripts', 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const stamp = backup.when.replace(/[:.]/g, '-')
  const file = path.join(dir, `musicians-merge-${stamp}.json`)
  fs.writeFileSync(file, JSON.stringify(backup, null, 2))
  console.log(`Backup written: ${file}  (${backup.musicians.length} musician rows)\n`)

  const byId = Object.fromEntries(backup.musicians.map((m) => [m.id, m]))

  console.log(APPLY ? '=== APPLYING MERGES ===\n' : '=== DRY RUN (no changes; pass --apply to execute) ===\n')

  for (const [label, keeperId, twinId] of PAIRS) {
    const keeper = byId[keeperId], twin = byId[twinId]
    if (!keeper || !twin) { console.log(`SKIP ${label}: record(s) not found (already merged?)`); continue }
    console.log(`• ${label}`)
    console.log(`    keep "${keeper.first_name} ${keeper.last_name}" <${keeper.email || 'no email'}>  ${keeperId}`)
    console.log(`    drop "${twin.first_name} ${twin.last_name}" <${twin.email || 'no email'}>  ${twinId}`)

    // 1) Fill keeper's blank fields from twin.
    const fill = {}
    for (const f of Object.keys(twin)) {
      if (SKIP_FIELDS.has(f)) continue
      if (isEmpty(keeper[f]) && !isEmpty(twin[f])) fill[f] = twin[f]
    }
    if (Object.keys(fill).length) {
      console.log(`    fill keeper: ${JSON.stringify(fill)}`)
      if (APPLY) await patch(`musicians?id=eq.${keeperId}`, fill)
    }

    // 2) musician_instruments — respect unique(musician_id, instrument_id).
    const keeperInstr = new Set(backup.musician_instruments.filter((r) => r.musician_id === keeperId).map((r) => r.instrument_id))
    const twinInstr = backup.musician_instruments.filter((r) => r.musician_id === twinId)
    for (const r of twinInstr) {
      if (keeperInstr.has(r.instrument_id)) {
        console.log(`    musician_instruments: drop twin's dup instrument ${r.instrument_id}`)
        if (APPLY) await del(`musician_instruments?id=eq.${r.id}`)
      } else {
        console.log(`    musician_instruments: move instrument ${r.instrument_id} -> keeper`)
        if (APPLY) await patch(`musician_instruments?id=eq.${r.id}`, { musician_id: keeperId })
      }
    }

    // 3) Plain FK reassignments.
    for (const [t, c] of FK) {
      const rows = backup.fk[`${t}.${c}`].filter((r) => r[c] === twinId)
      if (rows.length) {
        console.log(`    ${t}.${c}: move ${rows.length} row(s) -> keeper`)
        if (APPLY) await patch(`${t}?${c}=eq.${twinId}`, { [c]: keeperId })
      }
    }

    // 4) Remove the emptied twin.
    console.log(`    delete twin ${twinId}`)
    if (APPLY) await del(`musicians?id=eq.${twinId}`)
    console.log('')
  }

  console.log(APPLY ? 'Done. Re-run the detector to confirm.' : 'Dry run complete. Re-run with --apply to execute.')
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
