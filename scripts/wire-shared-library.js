/**
 * wire-shared-library.js — point David's brand orgs at Project String Quartet's
 * master music library (the org that holds all 996 songs / 3,558 part files).
 *
 * This is the DATA step that follows migration 075 (which adds the
 * organizations.library_org_id column). It does NOT copy any song or file — it
 * only sets a pointer per brand, so every brand reads/writes the ONE shared
 * library. Idempotent: safe to re-run.
 *
 *   node scripts/wire-shared-library.js          # dry-run: show what WOULD change
 *   node scripts/wire-shared-library.js --apply   # perform the UPDATEs
 *
 * Reads Supabase creds from .env.local (service role — bypasses RLS).
 */

const fs = require('fs')

const env = fs.readFileSync('.env.local', 'utf8')
const URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim()
const KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY }

// The org that OWNS the master library. Every brand below points here.
const LIBRARY_ORG = { id: '6edbf230-e43a-42c0-a60d-8cd67be87276', name: 'Project String Quartet' }

// David's brands to wire (confirmed 2026-07-18). Deliberately EXCLUDES the
// duplicate empty PSQ and the orphan "Subito String Quartet" — cleanup, not wiring.
const BRANDS = [
  { id: 'acd446d8-3fc9-4f56-99f9-0fc23f8792c6', name: 'Subito Strings' },
  { id: '9139dd8a-8735-4da2-a4ce-0e184609b8ce', name: 'Meridian String Quartet' },
  { id: '7478774f-9edb-46e1-b001-5191f0dec6f5', name: 'Lonestar String Quartet' },
]

const APPLY = process.argv.includes('--apply')

async function getJson(path) {
  const res = await fetch(URL + path, { headers: H })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

async function countRepertoire(orgId) {
  const res = await fetch(
    URL + `/rest/v1/repertoire?select=id&organization_id=eq.${orgId}`,
    { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } }
  )
  return res.headers.get('content-range')?.split('/')[1] ?? '?'
}

async function main() {
  console.log(`\nLibrary source: ${LIBRARY_ORG.name} (${LIBRARY_ORG.id})`)
  console.log(`  → repertoire rows: ${await countRepertoire(LIBRARY_ORG.id)}\n`)

  // Guard: confirm migration 075 has been applied (the column must exist).
  try {
    await getJson(`/rest/v1/organizations?select=id,library_org_id&limit=1`)
  } catch (e) {
    console.error('✗ Cannot read organizations.library_org_id — has migration 075 been applied?')
    console.error('  Run supabase/migrations/075_org_shared_library.sql in the Supabase SQL editor first.')
    console.error('  Detail:', e.message)
    process.exit(1)
  }

  console.log(APPLY ? 'APPLYING pointers:\n' : 'DRY RUN (pass --apply to write):\n')

  for (const b of BRANDS) {
    const [cur] = await getJson(
      `/rest/v1/organizations?select=id,name,library_org_id&id=eq.${b.id}`
    )
    if (!cur) {
      console.log(`  ! ${b.name}: org not found (${b.id}) — skipped`)
      continue
    }
    const already = cur.library_org_id === LIBRARY_ORG.id
    if (already) {
      console.log(`  = ${b.name}: already points at ${LIBRARY_ORG.name} — no change`)
      continue
    }

    if (!APPLY) {
      console.log(`  → ${b.name}: library_org_id ${cur.library_org_id ?? '(own)'} ⇒ ${LIBRARY_ORG.name}`)
      continue
    }

    const res = await fetch(URL + `/rest/v1/organizations?id=eq.${b.id}`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ library_org_id: LIBRARY_ORG.id }),
    })
    if (!res.ok) {
      console.log(`  ✗ ${b.name}: UPDATE failed → ${res.status} ${await res.text()}`)
      continue
    }
    console.log(`  ✓ ${b.name}: now shares ${LIBRARY_ORG.name}'s library`)
  }

  // Proof: print the resolved sharing map + confirm each brand resolves to the
  // library's real song count (what the app's resolveLibraryOrgId will see).
  console.log('\nResulting sharing map:')
  const rows = await getJson(
    `/rest/v1/organizations?select=name,library_org_id&library_org_id=not.is.null&order=name`
  )
  if (rows.length === 0) {
    console.log('  (none yet)')
  } else {
    for (const r of rows) {
      const n = await countRepertoire(r.library_org_id)
      console.log(`  ${r.name}  →  library ${r.library_org_id}  (${n} songs)`)
    }
  }
  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
