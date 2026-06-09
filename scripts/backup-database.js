/**
 * Nightly database backup (stopgap until Supabase Pro backups).
 *
 * Dumps every table in the public schema to JSON via the PostgREST API using
 * the service-role key from .env.local. Table list and primary keys are
 * discovered from the API's OpenAPI spec, so new tables are picked up
 * automatically. Keeps the most recent 14 backups, deletes older ones.
 *
 * Run manually:        node scripts/backup-database.js
 * Scheduled:           Windows Task Scheduler job "PodiumNightlyBackup" (daily 09:00,
 *                      runs at next boot if the machine was off)
 * Output:              scripts/backups/db/<timestamp>/<table>.json + manifest.json
 */
const fs = require('fs')
const path = require('path')

const PAGE = 1000
const KEEP = 14

const envFile = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const URL = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
const KEY = envFile.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` }

async function discoverTables() {
  const res = await fetch(`${URL}/rest/v1/`, { headers: HEADERS })
  if (!res.ok) throw new Error(`OpenAPI spec fetch failed: ${res.status}`)
  const spec = await res.json()
  const tables = []
  for (const [name, def] of Object.entries(spec.definitions || {})) {
    // primary key columns are marked "<pk/>" in their description
    const pk = Object.entries(def.properties || {})
      .filter(([, p]) => (p.description || '').includes('<pk/>'))
      .map(([col]) => col)
    tables.push({ name, pk })
  }
  return tables
}

async function dumpTable({ name, pk }, dir) {
  const order = pk.length ? `?order=${pk.join('.asc,')}.asc` : '?'
  const rows = []
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetch(`${URL}/rest/v1/${name}${order}`, {
      headers: { ...HEADERS, Range: `${offset}-${offset + PAGE - 1}`, 'Range-Unit': 'items' },
    })
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status} at offset ${offset}`)
    const page = await res.json()
    rows.push(...page)
    if (page.length < PAGE) break
  }
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(rows))
  return rows.length
}

function rotate(root) {
  const dirs = fs.readdirSync(root).filter((d) => fs.statSync(path.join(root, d)).isDirectory()).sort()
  for (const old of dirs.slice(0, Math.max(0, dirs.length - KEEP))) {
    fs.rmSync(path.join(root, old), { recursive: true, force: true })
    console.log(`rotated out ${old}`)
  }
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const root = path.join(__dirname, 'backups', 'db')
  const dir = path.join(root, stamp)
  fs.mkdirSync(dir, { recursive: true })

  const tables = await discoverTables()
  const manifest = { started: new Date().toISOString(), tables: {} }
  let failed = 0
  for (const t of tables) {
    try {
      manifest.tables[t.name] = await dumpTable(t, dir)
      console.log(`${t.name}: ${manifest.tables[t.name]} rows`)
    } catch (e) {
      failed++
      manifest.tables[t.name] = `ERROR: ${e.message}`
      console.error(String(e))
    }
  }
  manifest.finished = new Date().toISOString()
  manifest.ok = failed === 0
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  rotate(root)
  console.log(`backup ${failed === 0 ? 'OK' : `FINISHED WITH ${failed} ERRORS`} -> ${dir}`)
  if (failed > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
