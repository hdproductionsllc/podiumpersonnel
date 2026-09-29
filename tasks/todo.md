# Create a project from a pasted contract (2026-09-29)

David: paste a 17hats contract (whole page, menus and all) and get the project:
client, date, venue, times, fee. First real one: Monica Traupmann, Subito Strings.

## What is true today (verified 2026-09-29)
- A project is created in two halves: `project-form-dialog.tsx` inserts the
  `projects` row, then `projects-client.tsx handleProjectSuccess` adds one
  performance (call/start/end + venue) and the empty chairs for the template.
- The contract's facts all have a home already: projects.client_name,
  event_type, contract_amount, deposit_amount, payment_notes, ensemble_type,
  description; services.call_time/start_time/end_time/venue/venue_id.
  => NO migration, NO new API route, NO new write path.
- Subito Strings (acd446d8): America/Los_Angeles, naming habit is
  "<Client> String Quartet Gig". No Traupmann project and no "Invisible House"
  venue exist yet (read-only query).
- Creating a project with empty chairs emails nobody (offers/reminders/after-gig
  all key off assigned musicians).

## Design
The contract is just another way to fill in the Add Project form. The reader
only PROPOSES (same rule as the questionnaire parser): every value lands in a
visible, editable box and anything odd is listed as a warning before Create.

## Plan
- [x] `src/lib/projects/contract-parser.ts`: pure text -> fields + warnings
      (labels, date, times out of the "Performance Time" sentence, money,
      balance-due date, company, signed-or-not)
- [x] Tests `src/lib/__tests__/contract-parser.test.ts` (41, fictional client)
- [x] Dialog: "Paste a Contract" in the template picker -> paste -> prefilled form
      with a "check this" banner; saved-venue match by name; wrong-org warning
- [x] Unknown ensemble (e.g. quintet): custom project that still keeps the
      contract's times + venue
- [x] Verify: 41 new tests; full suite 960/960 (first run, alongside the build, the
      2 known-flaky timing tests failed, then passed alone and in a clean full
      run); tsc clean; build OK; lint count unchanged on the two edited files
      (pre-existing errors only), new files clean
- [x] Real gig added to Subito Strings with the SAME reader and read back:
      project a86a40fc-973e-457c-aa65-e78175a795cc, Sat Apr 3 2027, call 8:00 /
      start 8:30 / end 11:00 AM PDT, venue "The Invisible House" 8198 Uphill Rd,
      Joshua Tree CA 92252 (new venue ad4ffcb1), 4 vacant chairs, 0 offers,
      $5,890 / $2,990, payment pending (deposit corrected to $2,945 same day, see below)
- [x] Docs: docs/contract-import.md
- [ ] NOT DONE: nobody has looked at the new dialog on screen. Local login needs
      David's password, so it is verified by types + build only. First look
      happens on the live site after the push.
- [ ] David says go, then ONE commit + ONE push to master (expected pushes: 1)

## For David to decide
- RESOLVED 2026-09-29: contract said "50% Deposit: $2,990" but half of $5,890 is
  $2,945. David fixed the contract; Podium gig updated to deposit $2,945, balance
  $2,945 due Mar 20, 2027 (read back from the database).
- Event Type saved as "Ceremony" (there is no "Coffee Hour" type).
- Venue is Google's one match for "Invisible House" in California. Confirm it is
  the Joshua Tree one.

## Version 2 ideas
- Look the venue's address up automatically when the contract's venue is new
- Read client email / phone from the 17hats contact page
- "Coffee Hour" (or free-text) event type
- Keep the contract text or PDF attached to the project
- Warn when a gig for the same client and date already exists
- Mark deposit paid / contract signed from 17hats instead of by hand

# Gig page trim + Violin 1 lead + contrast (2026-09-27)
- [x] Gig lead = admin pick > confirmed Violin 1 (lowest chair) > nobody. Roster "Leader" flag no longer used AT ALL for the lead (David, twice). Preview shown: Oct 4 Shelly Ren, Oct 12 + Oct 25 Rebecca Chung, Nov 7 Ruzanna Sargsyan (was Boryana under the flag rule).
- [x] Music / Parts hidden until it holds a file or a past send (it is where Prepare Gig Music's books land and Send Music goes out: 15 files, 2 sends in 90 days, so NOT deleted). "Upload sheet music (PDF) yourself" link in Send to musicians; book publish now refreshes the page so the panel appears.
- [x] Manage Payments shortcut removed (Payments is in the sidebar and the pay email).
- [x] Contrast: darker --border/--muted-foreground (light theme), colored stripe per gig panel on a darker backdrop, stronger status chips.
- [x] Verify: after-gig 29 tests; full suite 919 (2 known-flaky timing tests, payment-failed-email + resend-webhook, failed once under load then passed twice: fix their timeouts in v2); tsc clean; build OK; no new lint.

# Readability pass: Projects list + gig page (2026-09-27)
David: "a lot of info... it can be done better". Scope chosen: gig page + Projects list.
Seen live (PSQ, Lori Stone Wedding, 4/4 filled): ~12 declined/expired offers each
followed by a "Next in line / Send Offer" bar for chairs that are ALREADY FILLED;
Prepare Gig Music below all of it; "Unassign" twice per staffing row; unlabeled "+";
list has 12 columns incl. always-"Active" Status and always-"1" Services, red Delete per row.
- [x] List: name + client/venue as two lines; date with weekday + "in N days"; staffing pill; money in one cell; Edit/Complete/Delete in a menu; drop Status (badge only if not active) and Services columns
- [x] Gig page: summary strip at top; order = Staffing -> Prepare Gig Music -> Music/Parts -> Send to musicians -> After the gig (payments + gig report)
- [x] Offers: show open offers; history folded ("Offer history (N)")
- [x] Next-in-line suggestions only for chairs that still need someone (David: yes)
- [x] Staffing row: one Unassign, labeled actions, consistent pay
- [x] Spacing/type: section spacing, readable table text
- [x] Verify: 919 tests, tsc clean, build OK, no new lint in the 3 files. David said "make your edits live": pushed without the screenshot-approval step; live screenshots taken after deploy.

# One lead per gig (2026-09-27, follow-up)
David's correction: roster "Leader" = CAN lead; every gig has exactly ONE lead. The
089 rule (ask every confirmed flagged leader) emailed Kathleen AND Jiyoung for the
Sean McDonald wedding on its first run (11:34 UTC). Leader fee: do not touch.
- [x] Migration 090 `projects.gig_lead_musician_id` + scripts/gig-lead-2026-09-27.sql (body diffed identical)
- [x] gigLead(): admin's pick > the only confirmed flagged leader > needs-pick (nobody asked)
- [x] Cron + "Send now" ask only the gig lead; pay summary says when no lead is set
- [x] Gig report panel: "Gig lead" picker, amber prompt when 2+ or 0 flagged, earlier reports still shown
- [x] Tests: after-gig 29 (incl. the two-flagged wedding case -> nobody asked); full suite 919 pass; tsc clean; build OK
- [x] Preview shown to David BEFORE deploy (next 60 days): Oct 4 Shelly Ren; Oct 12 Lori Stone Wedding = YOU PICK (Sooah Jung / Rebecca Chung); Oct 25 Rebecca Chung; Nov 7 Boryana Popova
- [ ] David pastes scripts/gig-lead-2026-09-27.sql; verify column over REST
- [ ] One push to master; verify deploy

# After-the-gig workflow + gig-music layout + roster duplicate warning (2026-09-27)

David's asks: (1) don't archive a gig the moment it ends, wait a day; (2) email the
org admins "here's how much to pay each person"; (3) get a timely report from the
lead musician (on time? hiccups? client follow-ups? arrangements to rework?);
(4) the gig-music section should be the obvious thing to click, sit above Music /
Parts, with payments below; retire "Let the client choose"; (5) warn when adding a
musician who may already be on the roster.

## What is true today (verified 2026-09-27 by three code sweeps + one read-only DB query)
- "Archived" = status completed/cancelled, hidden by a UI toggle. Two places flip
  active -> completed when end_date < today **in UTC**: cron
  `api/cron/complete-projects` (00:37 UTC) and the Projects page load itself.
  UTC means a Saturday evening gig in Chicago/LA can vanish before Sunday starts.
  Orgs already carry `organizations.timezone`.
- Pay math lives only in `api/payments/generate/route.ts` (accepted offer custom_pay
  > service base_pay; leader_fee added only on the default path). No payout email
  exists. No post-gig job exists.
- "Leader" is `musicians.is_leader`, global to the musician, not per gig.
- Project detail = expanded row in `projects-client.tsx`. Order today: ... Manage
  Payments (button to /dashboard/payments) -> Music / Parts -> Client Selections
  (`IntakePanel`, only for orgs with intake_enabled).
- "Let the client choose" (migration 082): card inside IntakePanel + planner-link API
  + public /plan/[token] + 3 public APIs + reminder cron + email template + lib + test.
  **Zero links have ever been minted in prod** (query 2026-09-27), so retiring it
  breaks no client. Client Selections itself does not depend on it.
- Musicians are created in 5 places (main dialog, bulk import, inline add in Send
  Offer and in Assign Musician, sub approval). No DB uniqueness, no pre-insert check
  except sub approval (exact email). The merge script has no matching rules (pairs
  were hand-picked), so matching rules are new. Admins already hold the full roster
  in the browser (RLS: members can read), so the check needs no new query.

## Decisions (David, 2026-09-27)
- Gig lead = every musician CONFIRMED on the gig whose roster record is flagged leader (musicians.is_leader). No per-gig picker. None flagged -> no request, the row says so.
- Pay email + report request go out 30 min after the gig's END TIME (services.end_time, timestamptz; all 29 past gigs have one). Multi-service gigs: after the LAST service. New cron every 15 min -> lands 30-45 min after. Only gigs that ended in the last 48h (first deploy cannot blast the back catalogue).
- Pay email recipients: org owners + admins ONLY. NEVER musicians. Enforced by building recipients solely from organization_members, with a test.
- Section title: "Prepare Gig Music". Archive still waits one day (org time zone).

## Plan
### Phase 0 - database first (paste-ready SQL, run BEFORE the deploy)
- [x] Migration 089: `gig_reports` (project, lead musician, 256-bit token, sent/opened/submitted, answers) unique per (project, musician); `projects.pay_summary_sent_at`. Additive only; RLS: org members read, writes via service role (public form uses service client, like /gig/[token]).
- [x] scripts/after-gig-2026-09-27.sql written (body diffed identical to 089)
- [ ] David pastes it; verify columns over REST before pushing code
### Phase 1 - archive a day later, in the org's time zone
- [x] One shared rule (`src/lib/projects/archive.ts` isReadyToComplete): end_date < (org's today - 1 day)
- [x] Use it in BOTH the cron and the page-load fallback (the two enforcement points)
### Phase 2 - after-the-gig job (new cron every 15 min, off minute 0)
- [x] Extract pay math into `src/lib/payments/compute.ts`; generate route uses it (no behavior change, test proves same numbers)
- [x] Pay summary email to owner + admins: each person, instrument, base, leader fee, total, grand total, link to Payments. Once per project (`pay_summary_sent_at`)
- [x] Gig report request email to the lead musician with a no-login link
- [x] Both fire once the project's LAST service end_time + 30 min has passed, within 48h; idempotent (pay_summary_sent_at, gig_reports rows); EMAIL_SAFE_MODE respected
### Phase 3 - lead musician gig report
- [x] Project row: "Gig report" panel: who the lead(s) are, "Send report request now / resend", and the submitted report
- [x] Public /report/[token] form (resolver returns one plain 404 on every failure, like /gig/[token])
- [x] On submit: save, email the answers to owner + admins
### Phase 4 - gig music layout
- [x] Rename "Client Selections" -> new title; make it a prominent call-to-action
- [x] Order: gig music -> Music / Parts -> Manage Payments
- [x] Retire planner: card, planner-link API, /plan/[token] page + 3 APIs, reminder cron + vercel.json entry, email template + sender, planner lib, its test. DB columns stay (harmless). UI sweep for dangling links.
### Phase 5 - possible-duplicate warning
- [x] `src/lib/musicians/duplicates.ts`: same org only; email (trim, lowercase), phone (last 10 digits), name (lowercase, accents/punctuation stripped)
- [x] Amber, non-blocking warning with "open existing" / "add anyway" in: main Add dialog, Send Offer inline add, Assign Musician inline add
- [x] Bulk import: rows whose email is already on the roster are skipped and listed; name-only matches imported but listed
### Verification (log results here)
- 2026-09-27: vitest 58 files / 911 tests pass (new: project-archive 7, after-gig 21; schedule test now checks every listed minute); tsc clean; next build OK (/report/[token] present, /plan gone); eslint adds no new errors in touched files (CI lint is advisory, ~700 pre-existing).
- Read-only prod checks: 0 planner links ever minted; all 29 past services have end_time; no active/completed project lacks end_date; 41 musicians flagged leader; 088 live, 089 not yet.
- Duplicate warning (built by a Sonnet helper, reviewed): 20 tests; main Add dialog ("Open existing" flips the dialog to edit that person), Send Offer + Assign quick-add (email/name only: those forms have no phone), bulk import skips same-email rows and lists name/phone matches. Largest roster 180 (<1,000 PostgREST cap). Full run after merge: 911 tests, tsc clean, build OK.
- Also: complete-projects cron moved 00:37 -> 09:37 UTC (Monday-morning archive for Chicago + LA); vercel.json gained ignoreCommand (only master builds).
- [ ] Unit tests: archive date rule across time zones, pay math parity, duplicate rules, report token resolver, cron selection + idempotency
- [ ] npm test, npm run build, local run with screenshots of the project row and forms
- [ ] ONE push to master after all phases verified (Vercel build discipline)

# Music / Parts downloads had no extension (2026-09-22)

Clicking a book in Music / Parts saved "Madelyn Intagliata Violin " — no ".pdf".
Cause: the storage client's `download` option encodes the filename with encodeURI,
which leaves "&" alone, so "Violin & Cello Duo" split the query string. Fix
(c8c2b92b, live 10:21Z): both signing routes (admin download + musician
/api/music-download) go through `src/lib/storage/signed-download.ts`, which signs
without the option and appends the name with encodeURIComponent. Verified by
clicking the cello book after the deploy: "… - CELLO Book.pdf", 3,031,766 bytes,
matches the stored file.

- [x] helper + 5 tests, both routes, tsc clean, ONE push
- [x] live click test in Chrome
- Note: the three "Madelyn Intagliata Violin_" files in Downloads are the broken
  downloads from before the fix — safe to delete.

# Duo books: "no file" for The Swan and Gooey (2026-09-21, same day as the parser fix)

Madelyn Intagliata's confirmed list built books with "no file for vln1, vc" on The
Swan and Gooey. Cause: every violin-and-cello duo in the library is ONE two-line
score, and the July import filed each as part "other", which neither the review
screen nor the book builder hands out. 96 active works (75 duos) were unreachable.
David: "the two line scores are readable by our duos" — so a lone "other" file IS
the score. Ave Maria: David chose the Schubert quartet arrangement (vln1 + vc);
the duo files in the library are Bach-Gounod (arr. Latham), verified by eye.

## Tasks
- [x] isScoreOnly + pickFileForPart: a work whose only file is "other" is score-only (67b25e0d, live 17:30Z)
- [x] guessPartFromFilename: "Duo"/"Duet" → score; underscores are separators
- [x] Tests (score-only.test.ts +6, part-guess.test.ts +2); tsc clean
- [x] Chrome: Reopen as Draft → Ave Maria → Schubert quartet → Confirm
- [x] Chrome: Download all books → reviewed (Swan two-line score p27–28, Schubert Ave Maria p29, Gooey p14–19) → Approve → Send to Music / Parts
- [x] Verified: project_files has VIOLIN Book (Violin 1) + CELLO Book (Cello), 17:41Z
- [ ] David: email the players from Music / Parts → Send Music (not done — sending is your call)

## Notes
- The first Publish attempt sat on "Combining VIOLIN…" for 4 minutes while the tab was
  in the background; a reload + retry in the foreground finished in ~60s. Not
  reproduced in the foreground, so no code change; watch for it.
- Library has a real Schubert violin-cello duo under the raw title
  "vln-vc_schubert--ave-maria" (duo, active). Rename it "Ave Maria — Franz Schubert" in
  the Music Library and the matcher will offer it next time.
- Cosmetic: the Books panel lists score-only notes under "won't have files" and
  repeats them per player. David said it's fine as is.

# Library: rename a work (2026-09-21)

Source: "Glass Animals" by Glass Animals in the library is really "Gooey" by
Glass Animals (quartet + duo rows). The library page can Archive, Replace,
Remove and Add parts, but never edit a work's title or artist, so a filename
typo is permanent once imported.

## Tasks
- [x] Data: rename both rows now (title "Gooey", norm_title "gooey"; artist unchanged)
- [x] Pure validator `src/lib/repertoire/work-patch.ts` (title/artist/archived → column patch)
- [x] PATCH /api/library/works/[workId] accepts title + artist; unique-index clash → 409
- [x] Library page: Rename action → inline title/artist editor (table + card views)
- [x] Tests: validator + route/client lock-ins
- [x] `npx tsc --noEmit`, `npm test`, `npm run build`
- [x] ONE push to master

# Intake parser: ceremony lines read as songs (2026-09-21)

Source: Madelyn Intagliata duo questionnaire. Four misreads on one list, all in
`src/lib/intake/parser.ts`; the review screen showed them as red "not in library"
rows and an empty cue/contact.

1. Walking-order lines became songs ("Officiant, groom, and best man walk in from
   the side", "Wedding party, 5 groups", "Jr. groomsmen and flower girl") while
   "Family, 4 pairs" was routed correctly. Cause: the participant check only allows
   role words + counts after an anchor; movement words ("walk in from the side"),
   "groups" and "Jr." are not in its vocabulary.
2. "Presentation to Mary: Ave Maria" → artist "Presentation to Mary", role "Bride
   Entrance" (leaked from the line above). Cause: the "Role: Song" form is only
   understood on the dash ("Unity soil pour- Unchained melody") and only when no
   role is active.
3. "Recessional: New York, New York (“Go in Peace” “Thanks be to God”)" kept the
   officiant's words inside the title (and title-cased them). Cause: nothing reads
   a quoted parenthetical as a cue.
4. "PSQ Duo - Madelyn Intagliata" warned as unrecognized preamble. Cause: the event
   header rule only knows "date - name"; PSQ's template opens "ensemble - name".

## Tasks
- [x] Walking order: add staging/movement vocabulary + "groups/sets/rows" headcount nouns
- [x] Ceremony "Role: Song" (colon) → custom role, regardless of the active role
- [x] Quoted trailing parenthetical → recessional cue (verbatim) or row note
- [x] "Ensemble - Name" header → contact name, not a warning
- [x] Tests: full Madelyn fixture + narrow guards (song titles stay songs)
- [x] `npm test`, `npx tsc --noEmit`
- [x] ONE push to master; verify with Re-parse on the live project
- [x] Lessons entry

# Launch hardening (2026-09-18)

Source of truth: `tasks/launch-assessment-2026-09-18.md` (committed on master before
any code changed). Every item below maps to a section-A / A8 finding there. Work on
branch `launch-hardening-2026-09-18`; ONE push to master at the end, after David has
pasted the migrations (data before code).

## W1 — Security migrations (Opus)
- [x] 084 drop `Users can insert their own membership` policy (A1); staging-replay.sql updated
- [x] 085 org-scoped storage policies on `project-files` bucket (A2); shared-library access verified unaffected
- [x] 086 venues policies as a numbered migration (A9)
- [x] `scripts/launch-hardening-2026-09-18.sql` paste script with RESULTS table
- [x] policy-safety tests extended

## W2 — Offer engine integrity (Opus)
- [x] rescind-offer: status-conditioned update, 0 rows = already answered (A3)
- [x] unassign: preserve contract_offers history via status, no DELETE (A4)
- [x] substitutions approve/decline: conditional update before side effects, retry-safe (A5)
- [x] tests for all three (none existed)

## W3 — Honest email results (Sonnet)
- [x] `sendTransactional` returns a distinct suppressed result (A6)
- [x] send-email route logs `email_logs.status='suppressed'`, returns `emailSent:false`
- [x] send-offer dialog shows a warning, not "Call sent!"
- [x] tests

## W4 — Ops alerting (Sonnet)
- [x] all 7 crons report job-level failure via notifyOps + Sentry (A8)
- [x] payment-failed email on `invoice.payment_failed` (A8)
- [x] Resend bounce/complaint webhook + migration 087 `musicians.email_status` + roster badge (A8)
- [x] tests

## W5 — Small (main thread)
- [x] vitest hookTimeout so cron tests stop timing out under load
- [x] marketing: remove "Multi-ensemble management", fix calendar "auto-sync" copy

## Verification gate (before push)
- [x] `npx tsc --noEmit`, `npm test`, `npm run build` green
- [x] polish pass: each finding in the assessment marked fixed / deferred with evidence
- [x] David pastes `scripts/launch-hardening-2026-09-18.sql`, all RESULTS rows PASS (2026-09-18)
- [x] merged, pushed 02fe51b2 + 9b692b40 (marketing build had been skipped by the HEAD^ ignore rule; fixed), both projects live, pricing page verified

## On David (not code)
- [ ] Supabase PITR (A7) — DECLINED for now ($125/mo on free plan). Next: free GitHub Actions backup job to R2, Pro at first paying customer
- [x] `NEXT_PUBLIC_SENTRY_DSN` set in Vercel Production, verified in deployed bundle (A8)
- [x] `RESEND_WEBHOOK_SECRET` set + Resend webhook created (A8); route verified 401 on unsigned calls
- [ ] `select * from app_settings;` → confirm billing_enforced (section B)

---

# Gig-details preview shows bare venue name (2026-09-17)

## Diagnosis (verified with a real user session, not a grep)
- Admin login sees 0 rows in `venues` (admin key sees 16 in PSQ). Projects, members,
  musicians all read fine → the `venues` RLS policy from migration 003 is the fault.
- Preview dialog reads venue through the user session → null → bare text.
- Email itself uses the admin key → includes address + map link when the gig is linked.
- Sept 15 Johann Kurtz batch went out bare because the gig was unlinked at the time.

## Tasks
- [x] `scripts/venue-policies-2026-09-17.sql` — audit + recreate venues policies via
      is_org_member / is_org_admin; RESULTS table (David pastes into SQL editor)
- [x] `page.tsx` — replace venueUrlMap builder with `attachVenueDetails()`
- [x] `projects-client.tsx` — drop VenueUrlMap; use venue-helpers on `venue_details`
- [x] `send-gig-details-dialog.tsx` — preview renders linked name + address + venue 2
      via the same helpers the email uses
- [x] Test: preview formatting for linked vs unlinked venue
- [x] `npm test`, `npx tsc --noEmit`, `npm run build`
- [x] Browser check on Johann Kurtz project (preview + project card), screenshots
- [x] ONE push to master (0a93f213, live 19:41Z) + one follow-up for the dialog state leak found in the browser check
- [x] Update memory `project_venue_join_rls_bug.md` with the real cause
- [x] Lessons entry

## Open for David
- Resend gig details to the 4 Johann Kurtz players (gig Sept 18)?
- Whittemore House (Oct 11) still has no venue record.

## Verified live (2026-09-17, production, PSQ login)
- Iavor → Send Gig Details preview: "Venue: Jewel Box" with "St. Louis, MO, 63110" beneath,
  matching the project row. Nothing was sent (Cancel).
- Found while checking: opening the dialog for an unsent project after a sent one kept the
  previous project's "everyone confirmed" list. Fixed (state reset in checkExistingSends).

## Still on David
- Paste `scripts/venue-policies-2026-09-17.sql` into the Supabase SQL editor (unlocks
  Saved Venues in the picker + the Venues page). All RESULTS rows should say PASS.

## 2026-09-25 — Books/Spotify/parser fixes + custom first page
- [x] Books panel loads the manifest on open; missing-parts warning sits above step 1
- [x] Spotify: search by matched library title/artist; title agreement gates ranking + auto-pick; retry 502/429; per-search isolation. Dry run on the reported intake: 29/29 correct (was 18/29)
- [x] Parser: bare "Groom" beside walking-order steps → processional order; quoted "Play just after Officiant: “…”" → recessional cue (tests with the exact questionnaire)
- [x] Custom first page for every book (migration 088 + /api/intake/[id]/book-cover + Books panel upload)
- [ ] David: paste supabase/migrations/088_intake_book_cover.sql in Supabase SQL editor (feature shows an error until then; everything else works without it)
- [ ] David: Rebuild the Spotify playlist on the Lonestar/Subito Strings intake (0gYJ3a…) — the existing one still has the 11 wrong tracks
- [ ] v2: "Ordinary (Alex Warren) - Must Play!" — parenthetical artist not split out and "Must Play!" dropped rather than kept as a note
- [ ] Pre-existing: 3 failing org-membership (084) tests

## 2026-09-25 (b) — Married Life + first-page upload
- [x] Taught aliases outrank exact-title hits (unless the alias target is too small for the gig → amber). Dry run over every colliding alias in the library: all resolve to the taught work; 3 small-arrangement aliases go amber on bigger gigs.
- [x] Blank project ensemble → derived from positions (review screen + book route)
- [x] Books panel: shows "needs migration 088" instead of a dead upload button; upload failures stay on screen
- [x] David: paste 088 — confirmed live 2026-09-25 (intakes.book_cover_path answers over REST) — then re-upload the first page (two earlier attempts reached storage but weren't saved)

## 2026-09-25 (c) — Codex audit fixes
- [x] DB protections: 084–087 PASS on 2026-09-18 (David pasted); 088 confirmed live via REST. No paste needed.
- [x] Next.js 16.1.3 → 16.3.6 (+ eslint-config-next); ws/@babel/browserslist bumped in range. Audit: 12 → 3 moderate (uuid inside svix/resend — only v3/v5/v6 with a buffer, not used) + xlsx
- [x] W-9 upload: final save guarded on the token; the loser removes its own file, gets 409 "already been used" (w9-upload-race.test.ts)
- [x] Billing `invoice.paid`: reads parent.subscription_details / line pricing.price_details, falls back to legacy fields (3 new tests; basil test fails on old code)
- [ ] Spreadsheet import: size cap + move xlsx 0.18.5 → 0.20.3 (only published on cdn.sheetjs.com, not npm) — WAITING on David's OK to take a non-npm dependency
- [x] Windows test baseline: org-membership sqlCode() split on /
?
/ (CRLF kept comments alive → 3 false failures)
- [x] Gate: tsc clean, 911/911 tests, `next build` green, `next start` smoke (/login 200, bad W-9 link 404, unsigned webhook 400) → one push
- [ ] Later: 328 lint errors / CI lint non-blocking; marketing site's own Next 14 audit

## 2026-09-25 (d) — Tell admins when a musician downloads their music
Decisions (David): email, all admins, once per musician; the first download COUNTS AS "received" (one email total, not download + confirm).
No migration: `music_confirmations.confirmed_at` already exists; a download just stamps it.
- [x] `src/lib/music/confirm-receipt.ts` — one shared "mark received + tell admins": atomic claim (`UPDATE … WHERE confirmed_at IS NULL RETURNING`), so a double-click / several simultaneous file downloads send exactly ONE email. Wording varies by how: "downloaded their music" vs "confirmed receipt"; keeps the "All N musicians now have their music" line
- [x] Enforcement point 1: `/api/music-download/[fileId]` — after the access checks pass, claim via `after()` so the PDF redirect is never slowed or failed by email
- [x] Enforcement point 2: `/api/confirm-music/[token]` — the button uses the same helper (also fixes its check-then-update double-email race)
- [x] Readers traced: music-status dashboard, projects list, project-files-section, send-music-reminder (now skips downloaders — intended), confirm-music page (shows received on revisit)
- [x] Tests: first download emails once; second download/button emails nothing; race (claim returns 0 rows) emails nothing; failed access check never marks received; email failure never blocks the download. No real emails (all mocked)
- [x] Gate: tsc, full suite, build → one push
