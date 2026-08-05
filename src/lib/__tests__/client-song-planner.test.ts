import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  normalizePlannerSongs,
  normalizeProcessionalOrder,
  sectionsForEventType,
  showsProcessionalOrder,
  plannerDueAt,
  isPlannerSection,
  PLANNER_MAX_SONGS,
  PLANNER_MAX_FIELD_CHARS,
  PLANNER_MAX_PROCESSIONAL,
  PLANNER_DUE_DAYS_BEFORE_EVENT,
} from '@/lib/intake/planner'
import { plannerState } from '@/lib/intake/types'
import { rateLimit, __resetRateLimits } from '@/lib/rate-limit'

/**
 * The client song planner (082) hands a page to someone with no account and
 * lets them write into the same tables the book builder reads from. Two
 * properties have to hold for that to be safe, and both are easy to break by
 * accident later:
 *
 *   1. NOTHING about the repertoire library reaches the client. Not a title,
 *      not an id, not a match count. The free-text box only works if the
 *      catalogue stays invisible (spec §4, acceptance criterion 4).
 *   2. Nothing the client sends is trusted — not the order, not the section,
 *      not the length, and never a match.
 *
 * The pure tests below check the second directly. The source assertions guard
 * the first, which has no runtime seam: it is a property of what the code is
 * allowed to SELECT and return.
 */

const root = resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf-8')

const SAVE_ROUTE = 'src/app/api/plan/[token]/save/route.ts'
const SUBMIT_ROUTE = 'src/app/api/plan/[token]/submit/route.ts'
const CHANGES_ROUTE = 'src/app/api/plan/[token]/request-changes/route.ts'
const PAGE = 'src/app/plan/[token]/page.tsx'
const RESOLVER = 'src/lib/intake/planner-token.ts'
const LINK_ROUTE = 'src/app/api/intake/[projectId]/planner-link/route.ts'
const CRON_ROUTE = 'src/app/api/cron/song-planner-reminders/route.ts'
const CLIENT_UI = 'src/components/plan/song-planner-client.tsx'
const MIGRATION = 'supabase/migrations/082_client_song_planner.sql'

// --- the list the client sends ------------------------------------------------

describe('the client cannot break the song list', () => {
  const song = (over: Record<string, unknown> = {}) => ({
    section: 'ceremony',
    titleRaw: 'Canon in D',
    artistRaw: 'Pachelbel',
    ...over,
  })

  it('numbers positions densely per section, from array order', () => {
    // 069 has UNIQUE (intake_id, section, position). Positions come from where a
    // row SITS, never from a number the client sent, so a tampered or repeated
    // position cannot collide.
    const result = normalizePlannerSongs([
      song({ section: 'prelude', titleRaw: 'A', position: 99 }),
      song({ section: 'ceremony', titleRaw: 'B', position: 99 }),
      song({ section: 'prelude', titleRaw: 'C', position: -4 }),
      song({ section: 'ceremony', titleRaw: 'D', position: 0 }),
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.songs.map((s) => [s.section, s.position, s.title_raw])).toEqual([
      ['prelude', 0, 'A'],
      ['ceremony', 0, 'B'],
      ['prelude', 1, 'C'],
      ['ceremony', 1, 'D'],
    ])
  })

  it('keeps the order within a section across a round trip', () => {
    // Criterion 2: reordering survives a reload in the same order.
    const titles = ['Third', 'First', 'Second']
    const result = normalizePlannerSongs(titles.map((t) => song({ section: 'reception', titleRaw: t })))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const reloaded = [...result.songs].sort((a, b) => a.position - b.position)
    expect(reloaded.map((s) => s.title_raw)).toEqual(titles)
  })

  it('drops a half-typed empty row instead of failing the save', () => {
    // An empty row at the bottom of a lane is someone still typing. An autosave
    // that errors on it would flash a failure every few seconds.
    const result = normalizePlannerSongs([song(), song({ titleRaw: '   ' }), song({ titleRaw: '' })])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.songs).toHaveLength(1)
  })

  it(`accepts ${PLANNER_MAX_SONGS} songs and rejects one more`, () => {
    // Criterion 9, at the owner's number.
    const list = (n: number) => Array.from({ length: n }, (_, i) => song({ titleRaw: `Song ${i}` }))
    expect(normalizePlannerSongs(list(PLANNER_MAX_SONGS)).ok).toBe(true)
    expect(normalizePlannerSongs(list(PLANNER_MAX_SONGS + 1)).ok).toBe(false)
  })

  it('rejects a section outside migration 069\'s CHECK set', () => {
    expect(normalizePlannerSongs([song({ section: 'afterparty' })]).ok).toBe(false)
    expect(normalizePlannerSongs([song({ section: null })]).ok).toBe(false)
    expect(isPlannerSection('other')).toBe(true)
    expect(isPlannerSection('dinner')).toBe(false)
  })

  it('bounds every field', () => {
    const long = 'x'.repeat(PLANNER_MAX_FIELD_CHARS + 1)
    expect(normalizePlannerSongs([song({ titleRaw: long })]).ok).toBe(false)
    expect(normalizePlannerSongs([song({ artistRaw: long })]).ok).toBe(false)
    expect(normalizePlannerSongs([song({ role: long })]).ok).toBe(false)
  })

  it('never lets the client set a match', () => {
    // The shape of a normalized row is the whole allowlist: no repertoire id, no
    // match status, no org id, no intake id.
    const result = normalizePlannerSongs([
      song({ matchedRepertoireId: 'someone-elses-work', matchStatus: 'matched', organization_id: 'other-org' }),
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.songs[0]).sort()).toEqual(
      ['artist_raw', 'notes', 'position', 'role', 'section', 'title_raw'].sort()
    )
  })

  it('drops a ceremony role from a row that is not in the ceremony', () => {
    const result = normalizePlannerSongs([
      song({ section: 'reception', role: "Bride's Entrance" }),
      song({ section: 'ceremony', role: "Bride's Entrance" }),
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.songs[0].role).toBeNull()
    expect(result.songs[1].role).toBe("Bride's Entrance")
  })

  it('bounds and cleans the walking order', () => {
    expect(normalizeProcessionalOrder(null)).toEqual({ ok: true, order: [] })
    const ok = normalizeProcessionalOrder(['Grandparents', '  ', 'Bridesmaids'])
    expect(ok).toEqual({ ok: true, order: ['Grandparents', 'Bridesmaids'] })
    const tooMany = Array.from({ length: PLANNER_MAX_PROCESSIONAL + 1 }, (_, i) => `P${i}`)
    expect(normalizeProcessionalOrder(tooMany).ok).toBe(false)
  })
})

// --- what the client is shown --------------------------------------------------

describe('lanes follow what was actually booked', () => {
  it('gives a ceremony booking the ceremony lanes', () => {
    expect(sectionsForEventType('Ceremony')).toEqual([
      'prelude', 'ceremony', 'recessional', 'postlude',
    ])
  })

  it('gives a cocktail-hour booking exactly one lane', () => {
    expect(sectionsForEventType('Cocktail Hour')).toEqual(['cocktail_hour'])
  })

  it('falls back to one generic lane, never the full wedding set', () => {
    // A "recessional" lane on a corporate gig is how a form starts feeling like
    // paperwork — and an unknown event type must fail quiet, not noisy.
    expect(sectionsForEventType('Corporate Event')).toEqual(['other'])
    expect(sectionsForEventType(null)).toEqual(['other'])
    expect(sectionsForEventType('something new')).toEqual(['other'])
  })

  it('only offers a walking order when there is a ceremony to walk into', () => {
    expect(showsProcessionalOrder(sectionsForEventType('Ceremony'))).toBe(true)
    expect(showsProcessionalOrder(sectionsForEventType('Reception'))).toBe(false)
  })
})

describe('the due date', () => {
  it('is the event date minus a month, at end of day', () => {
    // End of day, deliberately: a client filing "on the due date" must never be
    // late by a timezone.
    const due = plannerDueAt('2026-06-20T00:00:00Z')
    expect(due).not.toBeNull()
    expect(due!.slice(0, 10)).toBe('2026-05-21')
    expect(due!).toContain('23:59:59')

    const eventDay = new Date('2026-06-20T00:00:00Z')
    const dueDay = new Date(`${due!.slice(0, 10)}T00:00:00Z`)
    expect((eventDay.getTime() - dueDay.getTime()) / 86_400_000).toBe(PLANNER_DUE_DAYS_BEFORE_EVENT)
  })

  it('is nothing at all when the project has no date', () => {
    // Better silent than inventing a deadline the client gets chased about.
    expect(plannerDueAt(null)).toBeNull()
    expect(plannerDueAt('not a date')).toBeNull()
  })
})

describe('planner state is derived, never stored', () => {
  const now = new Date('2026-01-01T00:00:00Z')

  it('reads the five states off the timestamps', () => {
    expect(plannerState({ client_token: null }, now)).toBe('not-sent')
    expect(plannerState({ client_token: 't' }, now)).toBe('sent')
    expect(plannerState({ client_token: 't', client_opened_at: '2025-12-01' }, now)).toBe('in-progress')
    expect(plannerState({ client_token: 't', client_submitted_at: '2025-12-02' }, now)).toBe('submitted')
    expect(plannerState({ client_token: 't', client_token_expires_at: '2025-12-31' }, now)).toBe('expired')
  })

  it('does not un-submit a list because its link later went stale', () => {
    expect(
      plannerState(
        { client_token: 't', client_token_expires_at: '2025-12-31', client_submitted_at: '2025-12-02' },
        now
      )
    ).toBe('submitted')
  })
})

// --- rate limiting ---------------------------------------------------------------

describe('the public endpoints are bounded', () => {
  beforeEach(() => __resetRateLimits())

  it('allows a burst up to the limit, then refuses', () => {
    for (let i = 0; i < 5; i++) expect(rateLimit('k', 5, 60_000).allowed).toBe(true)
    const blocked = rateLimit('k', 5, 60_000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfter).toBeGreaterThan(0)
  })

  it('keys separately, so one client cannot lock another out', () => {
    for (let i = 0; i < 5; i++) rateLimit('token-a', 5, 60_000)
    expect(rateLimit('token-a', 5, 60_000).allowed).toBe(false)
    expect(rateLimit('token-b', 5, 60_000).allowed).toBe(true)
  })

  it('lets the window expire', () => {
    expect(rateLimit('short', 1, 1).allowed).toBe(true)
    return new Promise<void>((done) =>
      setTimeout(() => {
        expect(rateLimit('short', 1, 1).allowed).toBe(true)
        done()
      }, 5)
    )
  })
})

// --- the invariant with no runtime seam -------------------------------------------

describe('no repertoire data can reach the client (criterion 4)', () => {
  it('the page never even selects the match columns', () => {
    const src = read(PAGE)
    const select = /\.select\(([\s\S]*?)\)/g
    const selects = [...src.matchAll(select)].map((m) => m[1]).join(' ')
    expect(selects).not.toContain('matched_repertoire_id')
    expect(selects).not.toContain('match_status')
    expect(selects).not.toContain('repertoire')
  })

  it('the save endpoint answers with nothing but ok and a timestamp', () => {
    const src = read(SAVE_ROUTE)
    // Every success body in this file, extracted. The matcher runs here, so this
    // is the one place a "we have this one!" could plausibly slip out.
    expect(src).toContain('return json({ ok: true, savedAt: new Date().toISOString() })')
    const successBodies = [...src.matchAll(/return json\(\{ ok: true[^}]*\}/g)].map((m) => m[0]).join(' ')
    expect(successBodies).not.toContain('match')
    expect(successBodies).not.toContain('repertoire')
    expect(successBodies).not.toContain('title')
  })

  it('the client UI has no repertoire lookup at all', () => {
    const src = read(CLIENT_UI)
    // No autocomplete, no search, no candidate list — the free-text box is the
    // whole design (spec §4). A picker here would publish the catalogue.
    expect(src).not.toContain('/api/library')
    expect(src).not.toContain('/api/intake/repertoire')
    expect(src).not.toContain('matchStatus')
    expect(src).not.toContain('candidates')
  })

  it('matching still happens — server-side — on every save', () => {
    const src = read(SAVE_ROUTE)
    expect(src).toContain('matchSong(')
    expect(src).toContain('match_status')
    // and the result is written, not returned
    expect(src).toContain('matched_repertoire_id:')
  })
})

describe('the token is the whole credential', () => {
  const src = read(RESOLVER)

  it('rejects anything that is not one of our tokens before touching the database', () => {
    expect(src).toContain('/^[a-f0-9]{64}$/')
  })

  it('gives one indistinguishable answer to every kind of bad token (criterion 8)', () => {
    // Unknown, expired, revoked, cancelled, feature-off — all `return null`, and
    // every caller turns null into the same 404. A distinct "expired" message
    // would confirm the token was once real.
    expect(src).not.toMatch(/return\s+\{\s*expired/)
    const returns = [...src.matchAll(/^\s*(?:if [^\n]*)?return null/gm)]
    expect(returns.length).toBeGreaterThanOrEqual(5)
  })

  it('refuses a link whose org has the feature switched off', () => {
    expect(src).toContain('intake_enabled')
  })

  it('refuses a link on a cancelled booking', () => {
    expect(src).toContain("project.status === 'cancelled'")
  })
})

describe('a submitted list is locked (criteria 5 and 6)', () => {
  it('the save endpoint refuses with 409 once submitted', () => {
    const src = read(SAVE_ROUTE)
    expect(src).toMatch(/if \(ctx\.submittedAt\)[\s\S]{0,400}409/)
  })

  it('submitting twice is not an error, and does not email twice', () => {
    const src = read(SUBMIT_ROUTE)
    expect(src).toContain('alreadySubmitted: true')
    // The conditional update is what makes a double-tap race safe.
    expect(src).toContain(".is('client_submitted_at', null)")
  })

  it('only the operator can reopen it', () => {
    // The client page has no route to unlocking itself: the operator-only
    // endpoint is not reachable from it at all.
    const client = read(CLIENT_UI)
    expect(client).not.toContain('planner-link')
    expect(client).not.toContain('client_submitted_at')
    const operator = read(LINK_ROUTE)
    expect(operator).toContain('requireIntakeEnabled')
    expect(operator).toContain('update.client_submitted_at = null')
  })

  it('the locked page offers to ask us, not to unlock itself', () => {
    const src = read(CHANGES_ROUTE)
    expect(src).toContain('getOrgAdminEmails')
    expect(src).not.toContain('client_submitted_at')
  })

  it('escapes the client\'s own words before they reach an HTML email', () => {
    expect(read(CHANGES_ROUTE)).toContain('escapeHtml(message)')
    expect(read(SUBMIT_ROUTE)).toContain('escapeHtml(')
  })
})

describe('a client edit invalidates every sign-off it would have bypassed', () => {
  it('clears book approval and the operator confirm', () => {
    // 071's approval and the confirm gate each bless ONE exact list. A client
    // edit under either would put unreviewed songs into a book.
    const src = read(SAVE_ROUTE)
    expect(src).toContain('books_approved_at: null')
    expect(src).toContain("status: 'draft'")
    expect(src).toContain('confirmed_at: null')
  })

  it('does not throw away a decision a human already made', () => {
    const src = read(SAVE_ROUTE)
    expect(src).toContain("p.match_status !== 'manual'")
    expect(src).toContain('special_request: kept.special_request')
  })
})

describe('the operator half stays behind the same gates as the rest of intake', () => {
  const src = read(LINK_ROUTE)

  it('needs an intake-enabled org admin', () => {
    expect(src).toContain('requireIntakeEnabled')
  })

  it('never trusts the project id in the path', () => {
    expect(src).toContain('organization_id !== orgId')
  })

  it('mints 256 bits, and a fresh token on every resend', () => {
    expect(src).toContain("randomBytes(32).toString('hex')")
  })

  it('keeps the songs when a link is revoked', () => {
    expect(src).toMatch(/client_token: null[\s\S]{0,300}\.eq\('project_id', projectId\)/)
    expect(src).not.toMatch(/from\('intake_songs'\)[\s\S]{0,120}\.delete\(\)/)
  })
})

describe('the reminder job cannot become a mass mailer', () => {
  const src = read(CRON_ROUTE)

  it('fails closed on auth and honours the kill switch', () => {
    expect(src).toContain('requireCronAuth')
    expect(src).toContain('cronDisabledResponse')
  })

  it('skips anyone who already sent their list', () => {
    expect(src).toContain(".is('client_submitted_at', null)")
  })

  it('sends at most one nudge per intake per day', () => {
    expect(src).toContain('sameUtcDay')
  })

  it('re-applies every gate the client page applies', () => {
    expect(src).toContain('intake_enabled')
    expect(src).toContain("project.status === 'cancelled'")
    expect(src).toContain('client_token_expires_at')
  })

  it('stamps the reminder only after the send succeeds', () => {
    expect(src).toMatch(/sendSongPlannerEmail\([\s\S]{0,900}client_last_reminder_at/)
  })
})

describe('migration 082 is additive', () => {
  const sql = read(MIGRATION)
  // Comments in this file discuss the things we're asserting are absent (RLS,
  // USING (true), the status CHECK), so the statement assertions run against
  // the executable SQL only.
  const statements = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')

  it('adds columns and an index, and drops nothing', () => {
    expect(statements).toContain('ADD COLUMN IF NOT EXISTS client_token')
    expect(statements).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_intakes_client_token')
    expect(statements).not.toMatch(/^\s*DROP /m)
  })

  it('leaves the status CHECK alone', () => {
    // The book route gates on status; a third value would have to be taught to
    // that gate. Client progress rides on timestamps instead.
    expect(statements).not.toMatch(/CHECK \(status/)
    expect(statements).not.toMatch(/ALTER COLUMN status/)
  })

  it('adds no policy for anon', () => {
    // 076 removed the last USING (true) policies from this database. None come
    // back here: the public page reads through the service client.
    expect(statements).not.toMatch(/CREATE POLICY/i)
    expect(statements).not.toMatch(/TO anon/i)
    expect(statements).not.toMatch(/USING \(true\)/i)
    expect(statements).not.toMatch(/^\s*GRANT /mi)
  })

  it('keeps the token index partial so the NULLs do not collide', () => {
    expect(statements).toMatch(/idx_intakes_client_token[\s\S]{0,200}WHERE client_token IS NOT NULL/)
  })
})

// --- the outbound-mail switch ------------------------------------------------

describe('the planner cannot email anyone until it is switched on', () => {
  const original = process.env.SONG_PLANNER_EMAILS

  afterEach(() => {
    if (original === undefined) delete process.env.SONG_PLANNER_EMAILS
    else process.env.SONG_PLANNER_EMAILS = original
    vi.resetModules()
  })

  async function enabledWith(value: string | undefined): Promise<boolean> {
    if (value === undefined) delete process.env.SONG_PLANNER_EMAILS
    else process.env.SONG_PLANNER_EMAILS = value
    vi.resetModules()
    const mod = await import('@/lib/intake/planner-email')
    return mod.plannerEmailsEnabled()
  }

  it('is OFF when unset — a missing env var never sends mail', async () => {
    expect(await enabledWith(undefined)).toBe(false)
  })

  it('is OFF for blank, false, and anything unrecognized', async () => {
    for (const value of ['', '   ', 'false', '0', 'off', 'no', 'maybe', 'TRUEish']) {
      expect(await enabledWith(value)).toBe(false)
    }
  })

  it('is ON only for an explicit yes', async () => {
    for (const value of ['true', 'TRUE', '1', 'on', 'yes']) {
      expect(await enabledWith(value)).toBe(true)
    }
  })

  it('gates all four senders — invite, reminders, submitted, change request', () => {
    // Every path in this feature that can put mail in someone's inbox. If a
    // fifth is ever added, this list is where it has to be accounted for.
    for (const route of [LINK_ROUTE, CRON_ROUTE, SUBMIT_ROUTE, CHANGES_ROUTE]) {
      expect(read(route)).toContain('plannerEmailsEnabled')
    }
  })

  it('stops the unattended sender before it even reads the table', () => {
    // The cron is the only sender nobody clicks, so its gate comes first.
    const src = read(CRON_ROUTE)
    const gate = src.indexOf('plannerEmailsEnabled()')
    const query = src.indexOf(".from('intakes')")
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(query)
  })

  it('still mints a working link with sending off', () => {
    // The feature has to keep working: the operator copies the link instead.
    const src = read(LINK_ROUTE)
    expect(src).toContain('sendingDisabled: true')
    expect(src).toMatch(/sendingDisabled: true[\s\S]{0,120}\)/)
    // and the URL goes back in that same response
    expect(src).toMatch(/return apiSuccess\(\{ url, dueAt, expiresAt, sent: false, sendingDisabled: true \}\)/)
  })

  it('never tells a client their change request was passed on when it was not', () => {
    const src = read(CHANGES_ROUTE)
    const gate = src.indexOf('!plannerEmailsEnabled()')
    const ok = src.indexOf('return json({ ok: true })')
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(ok)
  })

  it('says so in the operator UI rather than looking broken', () => {
    const src = read('src/components/intake/client-planner-card.tsx')
    expect(src).toContain('emailsEnabled')
    expect(src).toContain('Emailing is switched off')
  })
})
