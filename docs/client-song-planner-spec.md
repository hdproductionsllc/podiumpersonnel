# Client Song Planner — build spec

**Status:** built (migration 082 + routes + UI + reminder cron). The open
questions in §12 are answered and the answers are folded into the sections
above; §12 records what was decided and why.

Replaces the 17hats *questionnaire* with a tokenized page where the client builds
their own song list — drag to order, save, come back, submit when due. Matching
runs against the library as they go, invisibly, so by the time they submit the
operator is reviewing a mostly-resolved list instead of transcribing one.

---

## 1. Why this is small

The data model already fits. `intakes.source` has a CHECK constraint that
already permits `'client-form'`; the table was designed with this in mind.

| What the feature needs | What already exists |
|---|---|
| Ordered songs, grouped | `intake_songs.section` + `position`, `UNIQUE (intake_id, section, position)` |
| The seven groups | `BOOK_SECTION_ORDER` — prelude, ceremony, recessional, postlude, cocktail_hour, reception, other |
| Save and resume | `intakes.status = 'draft'` |
| Walk order | `intakes.processional_order` (JSONB array of strings) |
| Free-text song entry | `title_raw`, `artist_raw`, `role`, `notes` |
| "Can you play X?" | `intake_songs.special_request` (070) |
| Fuzzy matching | `matchSong()` — exact norm_title → token → dice similarity |
| Operator review | the existing intake panel, unchanged |
| Books | the existing book builder, unchanged |
| Public tokenized pages | `/gig/[token]`, `/w9/[token]`, `/confirm-details/[token]` |
| Reminder scheduling | the existing cron jobs |

**What is genuinely new:** a token on `intakes`, one public page, three public
endpoints (save, submit, request-changes), the operator's link controls, and a
reminder job.

---

## 2. Scope

### In scope
- A tokenized, client-facing page to build and reorder a song list
- Autosave, resume, and a deliberate submit
- Server-side matching on save, never shown to the client
- A due date and reminder emails
- Lock on submit, with an operator reopen

### Explicitly NOT in scope
- Contracts, e-signature, invoicing, payment
- Any view of the organization's repertoire (see §4)
- Client accounts, passwords, or login
- Editing anything but the song list and its own contact fields

Same discipline as the invoicing spec: this replaces the questionnaire. If a
request touches contracts or money, stop and ask.

---

## 3. The flow

```
OPERATOR                        CLIENT                          OPERATOR
--------                        ------                          --------
Create planner link      →      Opens link (no login)
  (creates intake,              Adds songs, free text
   mints token)                 Drags to order
                                Autosaves  ──────────────→  matched server-side
                                Leaves, comes back                on every save
                                ...
                                Submits           ─────────→  Notified
                                (list locks)                  Reviews matches
                                                              Resolves gaps
                                                              Confirms intake
                                                              Builds books
```

The operator's half — review, resolve, confirm, build — is **unchanged**. This
feature ends where the existing intake panel begins.

---

## 4. The central design decision: no library browsing

**The client gets a free-text box, not a picker.**

1. **A picker publishes the catalogue.** Autocomplete over `repertoire` hands
   every client a browsable list of the arrangements. Tokens limit *who* can
   look, but a real client can still capture the whole list.
2. **A list makes the operation look small.** Every song not in the picker reads
   as "they can't do that." "We'll get it arranged" is a selling point, and
   special requests are revenue.
3. **The matcher already solves the hard part.** "Canon in D", "Pachelbel
   Canon", and "Cannon in D" all land on the same work today.

So the client types `Perfect — Ed Sheeran` and sees only their own list. The
match happens on the server and is visible only to the operator.

**Corollary:** match results are never returned to the client. Not as a badge,
not as a count, not as a "we have this one!" No response body from the save
endpoint may contain a repertoire id, title, or match status.

---

## 5. Schema — migration 082

Additive only. No existing column changes, so every current flow is untouched.

```sql
ALTER TABLE intakes
  ADD COLUMN IF NOT EXISTS client_token            TEXT,
  ADD COLUMN IF NOT EXISTS client_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_link_sent_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_due_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_opened_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_submitted_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_last_reminder_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_intakes_client_token
  ON intakes(client_token) WHERE client_token IS NOT NULL;
```

Token generation mirrors 078: 256 bits from `randomBytes(32)` in the app, minted
only when a link is actually created and re-minted on every resend (so a
forwarded old email stops working), partial unique index so many NULLs are fine.

### Why `status` is left alone

`intakes.status` is CHECK-constrained to `('draft','confirmed')` and the book
route gates on `status !== 'confirmed'`. Adding a third value would risk that
gate. Client progress is therefore carried by timestamps, which compose cleanly:

| State | Condition |
|---|---|
| Not sent | `client_token IS NULL` |
| Sent, untouched | token set, `client_opened_at IS NULL` |
| In progress | `client_opened_at` set, `client_submitted_at IS NULL` |
| Submitted (locked) | `client_submitted_at` set |
| Reopened | operator clears `client_submitted_at` |

`status` continues to mean exactly what it means today: the operator's
book-readiness gate.

### RLS

**Unchanged.** `intakes` and `intake_songs` keep their org-scoped policies from
069. The public page reaches them through the **service client** after validating
the token, exactly as `/gig/[token]` and `/w9/[token]` do.

No policy is added for `anon`. Migration 076 removed the last `USING (true)`
policies from this database and none come back.

---

## 6. Routes

### `GET /plan/[token]` — the client page

Server component. Service client. Resolves the token, 404s on anything unknown,
expired, or belonging to a cancelled project — never distinguishing between them
in the response.

Headers, matching the library page: `noindex, nofollow, noarchive, nosnippet`,
`no-store`, `Referrer-Policy: no-referrer`.

Renders only: the couple's names, event date, venue, the section lanes for this
event type, and whatever the client has already entered. **No org repertoire, no
pricing, no musician names, no internal notes.**

### `POST /api/plan/[token]/save` — autosave

Debounced (~1.5s idle). Accepts the whole list; replaces `intake_songs` for that
intake inside a transaction.

Server-side, per save:
- Reject if `client_submitted_at` is set (locked) → 409
- Bound the list: **max 120 songs** (owner's number), 200 chars per title /
  artist / role, 500 per note
- Renumber `position` densely per section — never trust client positions
- Reject any section not in `BOOK_SECTION_ORDER`
- Run `matchSong()` for each row and write `matched_repertoire_id` /
  `match_status` **server-side only**
- Set `client_opened_at` on first save if null

The client may never set `matched_repertoire_id`, `match_status`,
`organization_id`, or `intake_id`. Those come from the token.

**Response: `{ ok: true, savedAt }`. Nothing else.** See §4.

### `POST /api/plan/[token]/submit`

Sets `client_submitted_at`, locks the list, emails the operator. Idempotent —
submitting twice is not an error.

### Operator actions (existing authenticated API)
- Create planner link (mints token, sets `client_due_at`)
- Copy / re-send link
- Reopen (clears `client_submitted_at`)
- Revoke (clears the token)

---

## 7. The page itself

**Sections are driven by `projects.event_type`.** A wedding gets prelude,
ceremony, recessional, postlude, cocktail hour, reception. A corporate or private
booking gets far fewer. Showing a "recessional" lane on a corporate gig is how
the form starts feeling like paperwork.

Each lane is a drop target; each row is a drag handle, title, artist, and an
optional note. Ceremony rows also get `role` (Processional, Bride's Entrance,
Unity, …).

**A second, smaller list for `processional_order`** — who walks in, in order.
Plain string rows, dragged. This is the thing clients most want to fiddle with
and it already has a home in the schema.

Requirements:
- Works on a phone. Half of these will be filled in on a sofa.
- Keyboard-accessible reordering (move up / move down), not drag-only.
- Autosave with a visible "Saved" state and an explicit "everything is saved"
  indicator before submit.
- Submit asks for confirmation and states plainly that the list locks.

---

## 8. Reminders

A cron job, following the existing pattern (`requireCronAuth`, fails closed,
respects `CRON_ENABLED` and `EMAIL_SAFE_MODE`).

Nudge at **T-30, T-14, T-3** days before `client_due_at`, and once on the due
date. Skip if `client_submitted_at` is set. `client_last_reminder_at` prevents
double-sends if the job runs twice.

---

## 9. Security requirements

1. The token is the only credential. 256 bits, unguessable, single-purpose.
2. The page is `noindex` and `no-referrer`.
3. The save endpoint is **write-only with respect to the library** — no repertoire
   data in any response.
4. Everything the client submits is untrusted text. It reaches the book only as
   `title_raw` / `artist_raw`, and it is already rendered as text, never HTML.
5. Bounded input: song count, field lengths, request body size.
6. Rate-limit save and submit per token.
7. A revoked or expired token 404s exactly like a wrong one.
8. Tokens live 12–18 months by design (weddings book far out). Acceptable because
   the page guards a song list, not money — which is also why the page must carry
   no PII beyond what the client entered themselves.

---

## 10. Acceptance criteria

1. A client with a valid token can add, reorder, and remove songs, close the tab,
   return a week later, and see their list exactly as they left it.
2. Reordering within a section survives a reload in the same order.
3. Section order in the built book matches the client's ordering, via the
   existing `orderForBook`.
4. No response to any `/plan/*` or `/api/plan/*` request contains a repertoire
   id, work title, or match status.
5. After submit, a save attempt returns 409 and changes nothing.
6. An operator reopen makes the list editable again.
7. A submitted list appears in the existing intake panel with matches already
   resolved where the library had them — the operator types nothing.
8. An expired, revoked, and never-existed token are indistinguishable: all 404.
9. A 120-song list saves; a 121-song list is rejected.
10. Books built from a client-submitted intake are byte-identical to books built
    from the same list entered by hand today.

---

## 11. Build order (all six shipped)

1. Migration 082 + token minting + the operator's "create link" action.
2. `/plan/[token]` read-only: renders an existing list, proves token resolution
   and the 404 behaviour.
3. Save endpoint with bounds, renumbering, and server-side matching. **Verify
   criterion 4 before building any UI on top of it.**
4. The drag-and-drop UI, phone-first.
5. Submit, lock, reopen, operator notification.
6. Reminder cron.

Criterion 10 is the regression test for the whole feature: the same list, entered
either way, must produce the same books.

---

## 12. The open questions, answered

Answered by the owner before the build; each one is now a constant or a route,
not a guess.

1. **Song count cap: 120.** `PLANNER_MAX_SONGS`. A big wedding runs 60–80, so
   this is headroom rather than a target, and the save endpoint rejects 121.
2. **Due date: event date minus 30 days.** `PLANNER_DUE_DAYS_BEFORE_EVENT`,
   stamped at end of that day so a client filing "on the due date" is never late
   by a timezone. A project with no date gets no deadline and no reminders —
   better silent than chased against a date we invented.
3. **The client edits their own contact details too**, not only songs: contact
   name, phone, the walking order, the recessional cue (stored verbatim, as 069
   requires) and a free "anything else" note. Nothing else on the intake is
   reachable from the client's page.
4. **"Request changes" emails the operator.** A locked list stays locked — the
   client cannot unlock their own — but the button on the locked page sends the
   operator their message and the operator reopens it in one click.
   *Assumption, flagged:* "all editable" was read as **all editable while the
   list is unlocked**, with the lock still real after submit. That is the reading
   Q4 implies (a change request has nothing to request if the page is already
   editable). Flipping it is a one-line change in the save route's 409 gate.
5. **No Spotify.** Owner's reasoning: playlists are unreliable and popular songs
   have too many versions to seed rows from safely. `intakes.spotify_url` and the
   existing ranking helper are untouched — this feature neither reads nor writes
   them.
