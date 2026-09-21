# Lessons Learned

## Resend Rate Limit: the throttle lives in the email client, never in loops
**Date:** 2026-02-10, rewritten 2026-09-01
**Bug:** "1 failed" when sending music reminders to 3 musicians. Third email hit Resend's 2 requests/second rate limit.
**Root cause:** Sending emails in a tight `for` loop with no delay between iterations.
**First fix (wrong lesson):** a 600ms sleep pasted into every send loop, with a rule to "remember it in every loop". By 2026-09 there were ten copies, and a rule that has to be remembered N times gets forgotten once.
**Real fix (2026-09-01):** `awaitResendSlot()` in `src/lib/email/client.ts`, called by both send sites in `send.ts`. It reserves the next free 600ms slot, so sequential and concurrent sends are paced in one place. `resend-throttle.test.ts` fails the build if any route grows its own sleep.
**Rule:** Never add per-loop sleeps around email sends. If a provider limit changes, change `RESEND_MIN_INTERVAL_MS`. More broadly: when a lesson says "do X in every Y", the right fix is to make Y do X itself.

## logEmail() can throw — don't let it kill the count
**Date:** 2026-02-10
**Bug:** Email sent successfully but counted as "failed" because `logEmail()` threw and `sentCount++` was after it in the same try block.
**Fix:** Always increment `sentCount` immediately after the email send succeeds. Wrap `logEmail()` in its own try/catch so a logging failure doesn't affect the send count.
**Rule:** In send loops: `sendEmail()` → `sentCount++` → `try { logEmail() } catch {}`. Never put sentCount after logEmail.

## Musicians aren't org members — use serviceClient for their queries
**Date:** 2026-02-10
**Bug:** Musician portal showed "No music shared yet" even though files were uploaded. RLS policies on `project_files` require `organization_members` membership, but musicians aren't org members.
**Fix:** Use `createServiceClient()` (bypasses RLS) instead of `createClient()` for all musician portal API queries that touch org-owned tables (project_files, project_positions, etc.).
**Rule:** Any API route under `/api/musician/` that reads org data must use serviceClient. Musicians only exist in the `musicians` table, not `organization_members`.

## Supabase RLS blocks server components — use serviceClient for cross-table reads
**Date:** 2026-03-27
**Bug:** Venue links on the projects page always showed name-only Google Maps search URLs (e.g. "Our Lady of Solitude Church" → wrong city) even though venues had correct `google_maps_url` with `query_place_id` stored in the database.
**Root cause:** Three layers of RLS failures:
1. **Client-side venue INSERT** — `createBrowserClient()` uses the anon key. The RLS policy requires `auth.uid()` to match an admin/owner, but the client-side insert returned `{ data: null, error: {...} }` without throwing, so the catch block never ran. Venue creation silently failed.
2. **Server-side venue SELECT in page.tsx** — `createClient()` (session-based server client) couldn't reliably resolve `auth.uid()` in the Next.js server component context, so the RLS policy returned zero rows. The venue URL map was empty.
3. **Client-side Geocoding API not enabled** — The Google Maps Geocoding API wasn't activated in the Cloud project, so `geocoder.geocode()` returned `REQUEST_DENIED`. The `googlePlaceData` was always null, meaning the venue creation path never had the address data to pass along.
**Fix:**
- Venue creation moved to a dedicated `/api/venues` server-side API route using `createServiceClient()` (service role key, bypasses RLS). Auth verified manually first.
- Venue URL map in `page.tsx` fetched via `createServiceClient()` instead of session client.
- Server-side Places API enrichment when client geocoding is unavailable — the API route looks up place details by `place_id` using the server-side Google Places API.
**Rule:** Never rely on the session-based Supabase client (`createClient()`) for cross-table reads in Next.js server components. If the data is needed for rendering and the user is already authenticated, use `createServiceClient()`. Also: Supabase `.insert()` does NOT throw on failure — always check the `error` return value. And: never silently swallow errors with empty `catch {}` blocks.

## "Fixed" means fixed LIVE — never claim a fix before it's deployed
**Date:** 2026-06-09
**Bug (process, not code):** Told the user the music-upload bug was fixed and even suggested they test it — but the change was only committed locally, never pushed/deployed. They retried on production (old code) and hit the same error. Wasted their time and broke trust.
**Root cause:** Conflated "I wrote the fix and tsc passes" with "it works for the user." For this user, the only state that matters is what's live on production.
**Rule:** Do NOT tell this user something is "fixed" until it is deployed to production (committed → pushed to `master` → Vercel deploy landed) AND ideally verified there. Until then, say exactly what state it's in: "written locally, not deployed," or "pushed, deploying now — don't test yet." When code is done but not live, the honest status is "not fixed yet." Never invite them to test against code that isn't deployed. Vercel auto-deploys on push to `master`, so "make it live" = commit + push to master.

## Use the right here-string syntax for the tool you're calling
**Date:** 2026-06-09
**Bug:** Ran `git commit -m @'...'@` (PowerShell here-string) inside the **Bash** tool. Bash treats `@'...'@` as a literal `@` + single-quoted string + literal `@`, so a stray `@` leaked into the commit subject line.
**Rule:** `@'...'@` here-strings are PowerShell-only. In the Bash tool use a normal single-quoted `-m 'subject\n\nbody'` or `-F`/stdin. Match quoting syntax to the shell the tool actually runs.

## Google Maps URLs: always include address + query_place_id
**Date:** 2026-03-27
**Bug:** Google Maps links resolved to wrong locations (e.g. "Our Lady of Solitude Church" in Soledad, CA instead of Palm Springs, CA).
**Root cause:** URLs were generated from just the venue name (`query=Our+Lady+of+Solitude+Church`) without address context or place_id. Multiple places had fallback code generating name-only URLs.
**Fix:** All Maps URLs now use the official format: `https://www.google.com/maps/search/?api=1&query=NAME,+ADDRESS,+CITY,+STATE,+ZIP&query_place_id=PLACE_ID`. The `query` text provides a human-readable fallback; the `query_place_id` provides precision.
**Rule:** Never generate a Google Maps URL from just a place name. Always include the full address in the `query` param, and `query_place_id` when available. The old format (`/maps/place/?q=place_id:XXXX`) is undocumented — use the official Maps URLs API format.

## Feature-flag columns: flip the data BEFORE deploying the code that reads it
**Date:** 2026-07-17
**Bug (process):** Launch plan for the `intake_enabled` gate proposed apply-migration → deploy → then UPDATE the flag for internal orgs — leaving a window where the owner's own org lost the feature. David caught it in review.
**Root cause:** Defaulted to "migrate, deploy, backfill" without noticing the additive column is invisible to old code, so there's no reason to sequence the UPDATE after deploy.
**Rule:** For an additive flag column with a fail-closed default, the zero-downtime order is: apply migration → immediately set the flag for the orgs that need it → then deploy the code that reads it. Nothing reads the column until the new code ships, so flipping early is always safe. Never accept an avoidable downtime window in a deploy plan.

## "Sole consumer" claims need a runtime path trace, not just an import grep
**Date:** 2026-07-17
**Bug (process):** Plan justified gating `/api/repertoire/upload-url` + `add-work` on "only the intake dialog imports them" from a grep. David required tracing the actual admin upload-a-PDF flow before approving, since a miss would silently break music distribution for every customer org.
**Root cause:** A grep finds imports; it doesn't prove the user-visible flows that matter route elsewhere.
**Rule:** Before gating/removing an endpoint because it "has one consumer," manually trace the adjacent user flows that could plausibly hit it (here: admin gig-file upload → `/api/projects/[projectId]/files/upload-url`, musician music → `send-music`/`musician/files`) and record the trace in the plan. Grep is evidence, not proof.

## Verify a work's parts are DISTINCT files, not just present (2026-07-20)
Importing the Fazio folder, "Harry's Wondrous World" arrived as four identically-named
part files that were byte-identical copies of ONE PDF — a conductor score, not quartet
parts. The importer happily created a work with 4 part rows, all pointing at the same
sha256. Filename checks, part-label checks and "all 4 parts present" checks ALL passed.
What caught it: asserting the part rows have 4 DISTINCT sha256s.
Then confirmed by extracting the embedded page images and actually looking at them
(pdf text extraction returned nothing — it was a scan).
=> When importing parts: check part COUNT, part LABELS, and part DISTINCTNESS.
   Scanned PDFs need the images extracted + viewed; text extraction silently returns
   nothing and reads as "no problem found".

## Filename part-detection collisions are a bug FAMILY, not one-offs (2026-07-20)
Three separate unbookable works all traced to the indexer misreading a filename:
- `v2` read as "violin 2" — it was an engraver's VERSION suffix. Filed the CELLO of
  "Welcome To the Jungle" as vln2 and set the artist to "Cello". FIXED at source:
  `v\d+` is now a trailing annotation so the real instrument token wins.
- A bare `vln` claims the vln1 slot, so "Romeo - vln.pdf" took vln1 and the REAL
  "- vln1.pdf" was bumped to `other`. Still open — only bit one work.
- Inconsistent renaming split one arrangement across two rows (one file renamed to
  `Title - Artist - part.pdf`, siblings left alone). Hit Lay Lady Lay, Say You Know,
  Carol of the Drum, Skyfall.
**Rule:** when a work looks "incomplete", check whether the music is actually MISSING
before hunting for it. Usually it is on disk under a wrong label or a sibling row.
Symptoms to grep for: a part typed `other`, an artist that is an instrument name, two
rows whose parts complement each other exactly.

## PDF print provenance verifies a merge when the PDF has no readable text
Engraved PDFs are often vector-drawn: no text, no embedded image, so neither text
extraction nor image viewing can confirm what a file is. Title-token matching alone
was previously measured at ~6% wrong merges, so it is not good enough to move live parts.
**Use the PDF metadata instead** — `/CreationDate`, `/Producer`. Parts of one
arrangement get printed in a single sitting, seconds apart:
    Lay Lady Lay  2021-08-23 11:16:51 / 11:17:08 / 11:17:25 / 11:17:45
    Say You Know  2021-10-06 09:00:19 / 09:00:34 / 09:00:44 / 09:00:56
That is objective evidence two rows are the same arrangement. When even this is
unavailable, DON'T GUESS — ask David to open the file (he confirmed Romeo in seconds).

## Applying a confirmed fix: re-check the whole work, not just the one file
David confirmed "Romeo's bare vln is the violin 2 part". Relabelling only that file
would have produced TWO violin 2 parts and NO violin 1 — because the real vln1 file
had been bumped to `other` by the collision. A confirmation about one file is not a
confirmation about the work; re-read every part row before writing.

## The project's own context is the answer — don't ask the human what the record knows
David, on the Book Builder mismatches: "we should be matching whatever the project is —
your builder should grab that context, in this case it's quartet."

The plumbing was already right (`projects.ensemble_type` = "String Quartet" →
`canonicalEnsemble` → `'quartet'` → `matchSong`). The failure was that the matcher
treated the ensemble as a mere tiebreaker, so an exact title hit on a SOLO cello chart
outranked the quartet arrangement sitting in the library under a slightly different
title. The reviewer got a confident green match plus "missing vln1, vln2, vla".

Two patterns to carry forward:
1. **Before proposing new plumbing, trace whether the context already arrives.** It
   usually does. The bug is nearly always in how a downstream rule *weighs* it.
2. **Not every mismatch is equally bad — model the asymmetry.** A quartet chart on a
   trio gig is fine (drop a part). A solo chart on a quartet gig leaves three players
   holding nothing. My first fix escalated on any ensemble mismatch and broke an
   existing test that correctly asserted "ensemble is only a tiebreaker". The test was
   right; the rule needed to be one-directional (arrangement SMALLER than the gig only).
   When a fix breaks an old test, read what the test was defending before rewriting it.

## Parsers built from one source format will silently mangle a hand-typed one
The intake parser was a faithful port of the 17hats questionnaire machine, where every
field carries an explicit label. Fed a hand-typed list it produced phantom songs from
section headers ("CEREMONY"), phantom songs from people ("Bridal party 5 pairs"), and —
worst — the 17hats "Officiant (Name)" handler ate the FOLLOWING line as a name, so
"Parents, 2 pairs" vanished with no song, no walking-order step and no warning. That
broke the parser's own documented never-drop-a-line contract.

When adding a looser input mode, re-run the traced parse (`parseQuestionnaireTraced`
exposes a per-line disposition) and assert every line is accounted for — a `meta`
disposition looks just as clean as a correct one, so line-accounting alone is not
enough; check WHERE the content landed.

## A whitelist of words will always be one real-world input behind
The walking-order check shipped with a vocabulary of wedding roles. The very next
list broke it twice: "Bridemaids" (a typo) and "Incense carrier" (a Persian ceremony
role no list would have enumerated). Vocabulary is a losing game against free text.

What actually worked was a STRUCTURAL tell — a headcount. "Officiants, 2",
"Grandparents, 2 pairs", "Incense carrier, 1" are counts of people, and songs do not
carry counts. It needs no vocabulary at all, so it survives typos, other languages,
and traditions nobody thought of.

When a classifier needs a list of words to work, look for the shape instead. Keep the
vocabulary as a second signal, not the only one.

## Write the negative tests before shipping the pattern — they find the real damage
The "no music" regex started with bare `silent` and `nothing` alternatives. A test
asserting ordinary songs are NOT swallowed caught that it ate **Silent Night** and
**Nothing Else Matters** — both real works in the library, both would have been
silently marked "we don't play this" on a real gig.

For any new pattern that CLASSIFIES text, the test that matters is the one listing
things it must NOT match, drawn from actual library titles. The positive cases are
the ones you already had in mind; they prove nothing.

## Test failures are evidence — read them before assuming the test is wrong
A test I wrote failed because the line contained "please". The reflex is to fix the
test. Investigating instead uncovered a live bug: INSTRUCTION_MARKERS was matched
with `includes()` against the whole line, so ANY song line containing "please" was
dropped with no warning — and "Canon in D - please start at bar 8" is exactly how
clients write. Two songs vanished in a three-line fixture.

## Delegate the clicking; keep the judgement (2026-09-13)
Spent the top model's context driving Supabase dashboard pages one screenshot at a
time (each page takes 10-20 s to load). David's standing rule already says to use
Sonnet/Haiku subagents for exploration and mechanical work. Log-reading, page-scraping
and "go look at X and report the numbers" belong in a cheap subagent with a precise
brief; the main thread should only see the conclusions and decide what they mean.

## A verified fix for a live fault ships; do not wait for a second "push" (2026-09-13)
Held a tested cron-retry fix on a local branch for ~40 minutes waiting for David to
say "push", while the 7:00 run failed again. He had already said "you do this" and
"same failure check it". The push rule ("one push per verified change set") is about
batching, not about withholding a finished repair of production. When David has told
me to fix a live failure, verify (tests, tsc, lint delta) and push once, then report.
Ask first only for things he has not asked for, or for spend/plan changes.

## Focus the input before typing on someone's dashboard (2026-09-14)

While reading the Vercel logs I typed a search term without clicking into the
search box first. Vercel took the keystrokes as its global command palette,
and Enter navigated the account into the "Set Up Authenticator App" 2FA flow —
a security setting, on David's real account, that I had no business touching.
I backed out without completing it, but the near miss was mine.

**Pattern:** on any third-party dashboard, click the field (or target it by
element ref) and confirm focus before typing, and never press Enter blind.
Single-letter and bare-word shortcuts are everywhere in these UIs. If a page
lands somewhere unexpected, navigate away immediately and say so rather than
poking at it to see what it does.

## Measure whether the last fix worked before writing the next one (2026-09-14)

Two more cron alert emails looked like "the retry didn't work". The Vercel log
filtered to `level:warn` over Last day showed the opposite: 11 of ~18 runs were
rescued by the retry and only 2 failed. That reframed the job from "the fix was
wrong" to "the fix was undersized", and the per-attempt timestamps showed why —
each 504 now costs 5-7s, so three attempts only covered 22s.

**Pattern:** when an alert recurs after a fix, first count how often it fires
now versus before. A fix that cut failures by 80% needs widening, not replacing.
The alert email proves a failure happened; only the logs show the rate.

## Don't ship UI I couldn't watch run — and never round-trip a normalised value (2026-09-17)

I rewrote the venue picker to stop gigs losing their address, verified it hard on
every axis I *could* reach — 768 unit tests, typecheck, clean build, zero new lint
errors, an adversarial review that caught three real breakages — and shipped it
without ever seeing the field work, because the Chrome extension wasn't connected.
David lost Google Places autosuggest, which is how venues actually get added. I had
named that exact risk and shipped anyway when he said go.

The defect: `resolveVenue()` returned `typedName.trim()`, and `VenueField` fed that
back into `VenueSearch`'s controlled `value` prop on every keystroke. The sync effect
then wrote the trimmed text back into the input, so a trailing space was deleted as it
was typed. Multi-word venue names became untypeable, which starved the Places lookup
and left the "not linked" warning stuck on. No unit test could have caught it; it only
exists in the round trip between a component and its parent.

**Pattern — two separate things:**
1. Never write a transformed copy of an input's value back into its own `value` prop.
   Keep user text verbatim; derive links, ids and normalised forms alongside it, never
   in place of it.
2. Passing every check I can run is not the same as verifying. For a component on a
   path the user touches daily, "I couldn't test it in a browser" is a blocker, not a
   caveat to note in the summary. Offer to hold the push, or build the harness — do
   not let the strength of the other evidence stand in for the one test that mattered.

## Prove the permission before blaming the plumbing (2026-09-17)

For months the missing venue address was filed as a "PostgREST nested-embed quirk" and
patched around in three places (page.tsx venueUrlMap, venue-attach.ts, the offer routes).
A two-minute probe with a real user session — `GET /rest/v1/venues` — returned 0 rows
while the admin key returned 16. Admins could not read venues at all; the "quirk" was an
ordinary RLS policy failing. Every workaround was built on a misdiagnosis nobody tested.

**Pattern:** when a join "mysteriously" comes back null, query the joined table DIRECTLY
under the same credentials before theorising about the join. Mint a throwaway session
(admin generate_link → verify) and read the table; a zero-row answer ends the debate.
And write the diagnosis in David's words: "your login can't see the venues list", not
"nested embed RLS".

**Also:** verifying in the browser found a second real bug (dialog state leaking between
projects) that no unit test or typecheck could see. The browser pass is where the bugs
are, not a formality after the tests.

## A multi-commit push can skip a Vercel build; a fixture can look like a key (2026-09-18)

- The marketing project's ignore rule was `git diff --quiet HEAD^ HEAD -- .`. It only
  looks at the LAST commit of a push. The pricing fix sat six commits back, so
  Vercel reported "success" and built nothing; the live page kept the old copy.
  Rule now compares against `VERCEL_GIT_PREVIOUS_SHA` (the last deployed commit)
  with `HEAD^` as fallback. Pattern: after any push, curl the page you changed,
  not just the deploy status. "success" from an ignore rule means "skipped".
- A test fixture spelled `whsec_<base64>` tripped GitHub secret scanning within
  minutes of the push. Build secret-shaped fixtures at runtime
  (`'whsec_' + Buffer.from('...').toString('base64')`) so no literal that matches
  a vendor's key pattern ever lands in the repo.

## A vocabulary gate has to speak the client's language, not the template's (2026-09-21)

- The walking-order check was built from 17hats-style fragments ("Parents, 2 pairs")
  and could not read a hand-typed sentence ("Officiant, groom, and best man walk in
  from the side"), a count noun it didn't list ("5 groups") or an abbreviation
  ("Jr."). Every miss became a red "not in library" row. Pattern: when a heuristic
  is gated on an ANCHOR that songs never carry, widen the words allowed after it
  freely (movement, grouping); the anchor is the safety, not the vocabulary.
- A label the section patterns don't know ("Presentation to Mary:") fell through to
  the generic title/artist split and became an ARTIST under the previous role. In a
  ceremony, "Label: Song" is always a moment. Read structure before credits.
- Quoted words in a trailing parenthetical are someone's speech (the officiant's
  cue), never a title. Strip them before section detection and keep them verbatim.

## Inspect the file YOU produced, and keep the working tab in front (2026-09-21)

- I analysed "Books.zip" from Downloads and concluded the fix hadn't taken. It was
  David's own download from before the fix; mine had landed as "Books (1).zip".
  Pattern: when a browser action produces a file, identify it by timestamp (or a
  unique name) before drawing any conclusion from its contents.
- The in-browser book build (pdf-lib merge + upload) stalled for four minutes while
  the app tab sat behind a PDF viewer tab, and finished in a minute once the tab was
  in front. Pattern: for long client-side work driven through Chrome, keep that tab
  foregrounded and poll the page's progress text rather than waiting blind.
- A whole class of library files ("other") was invisible to the book builder for two
  months; the first duo gig to build books found it. Pattern: after an import,
  audit "works whose files can reach nobody" — the query is in this session's
  todo — not just "works with no files".
