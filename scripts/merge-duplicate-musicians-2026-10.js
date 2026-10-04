#!/usr/bin/env node
/**
 * Merge duplicate musician records WITHOUT losing anything (David, 2026-10-04:
 * "merge the others, make sure you lose no info").
 *
 * Usage (from the project folder):
 *   node scripts/merge-duplicate-musicians-2026-10.js           # backup + dry run, no writes
 *   node scripts/merge-duplicate-musicians-2026-10.js --apply   # backup + merge
 *
 * Which records: two musicians in the SAME organization with the SAME email
 * (case-insensitive). Never across organizations.
 *
 * Which one is kept: the one with more history (chairs, offers, emails,
 * payments, ...); on a tie, the older one.
 *
 * Nothing is lost:
 *   - A full backup of both rows and every row that refers to either is
 *     written to scripts/backups/ before anything changes.
 *   - The kept record's blank fields are filled from the other. Where both
 *     have a DIFFERENT value, the kept one stays and the other's value is
 *     written into the kept record's notes ("from merged duplicate: ...").
 *     Lists (tags) are combined; yes/no flags keep a "yes" from either.
 *   - Every reference is moved to the kept record: all 17 columns in 16
 *     tables that point at a musician (from the migrations), plus the
 *     staffing history's actor/entity ids. A "musician.merged" history row
 *     records which id became which.
 *   - Rows that may only exist once per musician (an instrument, a payment
 *     for a service, a gig report, notification preferences) are checked
 *     first. An identical duplicate (same instrument twice) collapses to one;
 *     any other clash STOPS that pair, reported, untouched.
 *   - The other record is deleted only after a re-check finds nothing left
 *     pointing at it.
 */
const fs = require('fs')
const path = require('path')

const APPLY = process.argv.includes('--apply')
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
const H = { apikey: key, Authorization: 'Bearer ' + key }

// Every column that references musicians(id), from supabase/migrations.
// [table, column, unique-with] — unique-with lists the other columns of a
// one-per-musician rule, so a move that would clash is caught first.
const REFS = [
  ['book_entries', 'musician_id', null],
  ['competing_schedules', 'musician_id', null],
  ['contract_offers', 'musician_id', null],
  ['email_logs', 'musician_id', null],
  ['gig_detail_confirmations', 'musician_id', ['send_id']],
  ['gig_reports', 'musician_id', ['project_id']],
  ['impersonation_log', 'musician_id', null],
  ['music_confirmations', 'musician_id', ['send_id']],
  ['musician_instruments', 'musician_id', ['instrument_id']],
  ['musician_notification_preferences', 'musician_id', []],
  ['payments', 'musician_id', ['service_id', 'is_leader_fee', 'payment_type']],
  ['project_file_downloads', 'musician_id', null],
  ['project_positions', 'musician_id', null],
  ['projects', 'gig_lead_musician_id', null],
  ['substitution_requests', 'requesting_musician_id', null],
  ['substitution_requests', 'substitute_musician_id', null],
]

const IDENTITY = new Set(['id', 'created_at', 'updated_at', 'organization_id'])

async function req(method, p, body) {
  const r = await fetch(url + '/rest/v1/' + p, {
    method,
    headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${await r.text()}`)
  return r.status === 204 ? [] : r.json()
}
const get = (p) => req('GET', p)

async function allRows(p) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const r = await fetch(url + '/rest/v1/' + p, { headers: { ...H, Range: `${from}-${from + 999}` } })
    if (!r.ok) throw new Error(`GET ${p} -> ${r.status} ${await r.text()}`)
    const rows = await r.json()
    out.push(...rows)
    if (rows.length < 1000) return out
  }
}

const blank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

async function refsOf(id) {
  const found = {}
  for (const [t, c] of REFS) {
    const rows = await get(`${t}?${c}=eq.${id}&select=*`)
    if (rows.length) found[`${t}.${c}`] = rows
  }
  return found
}

function historyCount(refs) {
  return Object.entries(refs).reduce((n, [k, rows]) => n + (k === 'musician_instruments.musician_id' ? 0 : rows.length), 0)
}

async function main() {
  const musicians = await allRows('musicians?select=*&email=not.is.null&order=created_at')
  const groups = {}
  for (const m of musicians) {
    const k = m.organization_id + '|' + m.email.trim().toLowerCase()
    ;(groups[k] = groups[k] || []).push(m)
  }
  const dupGroups = Object.values(groups).filter((g) => g.length > 1)
  if (dupGroups.length === 0) return console.log('No duplicates (same organization and email). Nothing to do.')

  // ---- plan every pair (and back up everything they touch) ----
  const plans = []
  const backup = { when: new Date().toISOString(), apply: APPLY, groups: [] }
  for (const g of dupGroups) {
    const withRefs = []
    for (const m of g) withRefs.push({ m, refs: await refsOf(m.id) })
    withRefs.sort((a, b) => historyCount(b.refs) - historyCount(a.refs) || a.m.created_at.localeCompare(b.m.created_at))
    const [keep, ...twins] = withRefs
    const events = { actor: [], entity: [] }
    for (const t of twins) {
      events.actor.push(...(await get(`staffing_events?actor_type=eq.musician&actor_id=eq.${t.m.id}&select=id`)))
      events.entity.push(...(await get(`staffing_events?entity_type=eq.musician&entity_id=eq.${t.m.id}&select=id`)))
    }
    backup.groups.push({ keep: keep.m, keepRefs: keep.refs, twins: twins.map((t) => ({ musician: t.m, refs: t.refs })), events })
    for (const t of twins) plans.push({ keep, twin: t, events })
  }
  fs.mkdirSync(path.join(__dirname, 'backups'), { recursive: true })
  const file = path.join(__dirname, 'backups', `musician-merge-${backup.when.replace(/[:.]/g, '-')}.json`)
  fs.writeFileSync(file, JSON.stringify(backup, null, 2))
  console.log(`Backup of every involved row: ${file}\n`)
  console.log(APPLY ? '=== MERGING ===\n' : '=== DRY RUN: nothing is changed (add --apply to merge) ===\n')

  let merged = 0
  let stopped = 0
  for (const { keep, twin } of plans) {
    const k = keep.m
    const t = twin.m
    const org = (await get(`organizations?id=eq.${k.organization_id}&select=name`))[0]?.name
    console.log(`• ${org}: ${k.first_name} ${k.last_name} <${k.email}>`)
    console.log(`    keep ${k.id} (history ${historyCount(keep.refs)}, created ${k.created_at.slice(0, 10)})`)
    console.log(`    fold ${t.id} (history ${historyCount(twin.refs)}, created ${t.created_at.slice(0, 10)})`)

    // 1) Clashes on one-per-musician rows.
    const clashes = []
    const dropIdentical = []
    const flagUpdates = [] // [table, keptRow, { flag: true }]: the other's "yes" carried over
    for (const [tbl, col, uniq] of REFS) {
      if (!uniq) continue
      const mine = keep.refs[`${tbl}.${col}`] || []
      for (const row of twin.refs[`${tbl}.${col}`] || []) {
        const twinOf = mine.find((r) => uniq.every((u) => same(r[u], row[u])))
        if (!twinOf) continue
        const strip = (r) => { const c = { ...r }; delete c.id; delete c[col]; delete c.created_at; delete c.updated_at; return c }
        const a = strip(twinOf)
        const b = strip(row)
        const differing = Object.keys({ ...a, ...b }).filter((f) => !same(a[f], b[f]))
        if (differing.length === 0) dropIdentical.push([tbl, row])
        else if (differing.every((f) => typeof a[f] === 'boolean' && typeof b[f] === 'boolean')) {
          // Only yes/no flags differ (e.g. "primary instrument"): keep a yes from either.
          const yes = Object.fromEntries(differing.filter((f) => b[f] && !a[f]).map((f) => [f, true]))
          if (Object.keys(yes).length) flagUpdates.push([tbl, twinOf, yes])
          dropIdentical.push([tbl, row])
        } else clashes.push(`${tbl}: both records have a row for ${uniq.map((u) => `${u}=${row[u]}`).join(', ') || 'this musician'}`)
      }
    }
    if (clashes.length) {
      stopped++
      console.log(`    STOPPED, nothing changed for this pair. Needs a person to decide:\n      - ${clashes.join('\n      - ')}\n`)
      continue
    }

    // 2) Field merge, keeping every value.
    const patch = {}
    const kept = []
    for (const f of Object.keys(t)) {
      if (IDENTITY.has(f) || f === 'notes') continue
      const a = k[f]
      const b = t[f]
      if (blank(b) || same(a, b)) continue
      if (blank(a)) patch[f] = b
      else if (Array.isArray(a) && Array.isArray(b)) patch[f] = [...new Set([...a, ...b])]
      else if (typeof a === 'boolean' && typeof b === 'boolean') { if (b && !a) patch[f] = true }
      else kept.push(`${f}: ${typeof b === 'object' ? JSON.stringify(b) : b}`)
    }
    const notes = [k.notes, t.notes && !same(k.notes, t.notes) ? t.notes : null].filter((x) => !blank(x))
    if (kept.length) notes.push(`From merged duplicate record (${new Date().toISOString().slice(0, 10)}): ${kept.join('; ')}`)
    const mergedNotes = notes.join('\n\n')
    if (!same(mergedNotes || null, k.notes || null)) patch.notes = mergedNotes
    if (Object.keys(patch).length) console.log(`    update kept record: ${JSON.stringify(patch)}`)

    // 3) Moves.
    for (const [tbl, keptRow, yes] of flagUpdates) console.log(`    ${tbl}: kept row ${keptRow.id ?? ''} takes the duplicate's ${JSON.stringify(yes)}`)
    for (const [tbl, row] of dropIdentical) console.log(`    ${tbl}: same row already on the kept record, the duplicate's copy (${row.id}) is removed`)
    for (const [tbl, col] of REFS) {
      const rows = (twin.refs[`${tbl}.${col}`] || []).filter((r) => !dropIdentical.some(([dt, dr]) => dt === tbl && dr.id === r.id))
      if (rows.length) console.log(`    ${tbl}.${col}: move ${rows.length} row(s)`)
    }
    const ev = await get(`staffing_events?or=(and(actor_type.eq.musician,actor_id.eq.${t.id}),and(entity_type.eq.musician,entity_id.eq.${t.id}))&select=id`)
    if (ev.length) console.log(`    staffing history: repoint ${ev.length} row(s)`)

    if (!APPLY) { console.log(''); continue }

    if (Object.keys(patch).length) await req('PATCH', `musicians?id=eq.${k.id}`, patch)
    for (const [tbl, keptRow, yes] of flagUpdates) {
      const pk = tbl === 'musician_notification_preferences' ? `musician_id=eq.${keptRow.musician_id}` : `id=eq.${keptRow.id}`
      await req('PATCH', `${tbl}?${pk}`, yes)
    }
    for (const [tbl, row] of dropIdentical) {
      const pk = tbl === 'musician_notification_preferences' ? `musician_id=eq.${row.musician_id}` : `id=eq.${row.id}`
      await req('DELETE', `${tbl}?${pk}`)
    }
    for (const [tbl, col] of REFS) {
      if ((twin.refs[`${tbl}.${col}`] || []).length) await req('PATCH', `${tbl}?${col}=eq.${t.id}`, { [col]: k.id })
    }
    await req('PATCH', `staffing_events?actor_type=eq.musician&actor_id=eq.${t.id}`, { actor_id: k.id })
    await req('PATCH', `staffing_events?entity_type=eq.musician&entity_id=eq.${t.id}`, { entity_id: k.id })

    const left = await refsOf(t.id)
    if (Object.keys(left).length) {
      stopped++
      console.log(`    NOT deleted: still referenced by ${Object.keys(left).join(', ')}. Left in place; send this output to Claude.\n`)
      continue
    }
    await req('DELETE', `musicians?id=eq.${t.id}`)
    await req('POST', 'staffing_events', [{
      organization_id: k.organization_id,
      actor_type: 'system',
      actor_id: null,
      entity_type: 'musician',
      entity_id: k.id,
      action: 'musician.merged',
      before: { merged_musician_id: t.id, name: `${t.first_name} ${t.last_name}`, email: t.email },
      after: { kept_musician_id: k.id, backup_file: path.basename(file) },
    }])
    merged++
    console.log(`    merged.\n`)
  }

  console.log(APPLY
    ? `Done: ${merged} merged, ${stopped} stopped for a person to decide. Backup: ${path.basename(file)}`
    : `Dry run: ${plans.length} pair(s) planned, ${stopped} would stop. Nothing changed.`)
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
