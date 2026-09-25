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
- [x] Windows test baseline: org-membership sqlCode() split on /?
/ (CRLF kept comments alive → 3 false failures)
- [x] Gate: tsc clean, 911/911 tests, `next build` green, `next start` smoke (/login 200, bad W-9 link 404, unsigned webhook 400) → one push
- [ ] Later: 328 lint errors / CI lint non-blocking; marketing site's own Next 14 audit
