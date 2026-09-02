# Hardening pass (2026-09-01) — branch hardening-2026-09

No deletions, no core-behaviour changes. Only failure paths change: errors that vanished now get logged / toasted / returned.
Plan: C:\Users\david\.claude\plans\majestic-wibbling-possum.md

- [x] 1. Check every discarded DB write (server ~29 sites, client ~26). PRIMARY → serverError/toast; SECONDARY → console.error. Stripe webhook: undo dedup row + 500 so Stripe retries.
- [x] 2. Comment-only catch blocks: warn in 13, toast in project-offers.tsx:287, leave request.json() parses alone.
- [x] 3. Resend throttle once in email client (awaitResendSlot) + remove the 10 copied sleeps + unit test + lessons.md update.
- [x] 4. Sentry wiring, inert without NEXT_PUBLIC_SENTRY_DSN; serverError() + notifyOps() capture.
- [x] 5. GitHub Actions CI (tsc, lint, vitest) + fix the 2 pre-existing failing tests.
- [x] 6. .gitignore additions, real README, PR template.
- [x] Verify locally: tsc clean, vitest 714/714, npm run build OK, greps clean (lint = 712 pre-existing errors, advisory in CI)
- [ ] PR opened → CI green → merged → Vercel deploy live → smoke test
- [x] docs/hardening-2026-09.md written.

---

# Music Library Cleanup (2026-07-19)

Shared library = Project String Quartet (6edbf230). All ops reversible (is_active flag / undo maps).
Musical rule: vc (cello) = quartet+quintet; bass = QUINTET ONLY. Naughtin arr = quintet, usable as quartet.

## DONE
- [x] Built update-library.js (batch PDF import) + sha256 idempotency fix (was creating dup works)
- [x] Built library-audit.js (find dup/fragment, archive via is_active, reversible)
- [x] Diagnosed "song not showing in book" — matcher OK; causes = forgot-had-it / artist-amber / wrong-arrangement
- [x] Security audit: title special-chars safe (no SQL injection; escapeLike guards the one .or() search)
- [x] PDF-text reconciliation of 129 "fragments" (read title/composer/arranger inside each PDF)
- [x] BIG FINDING: fragments = split halves of Naughtin QUINTET arrangements, not duplicates
- [x] Built library-merge.js (stitch split arrangements; reversible undo; book-safety guard)
- [x] MERGED 87 split arrangements (162 parts moved, 81 restored a bass). Now 908 active / 97 archived.

## NOW (David: "definitely do 1-2, then move into 3-5")
- [x] 0. VERIFIED all 87 merges against each PDF's printed title (pdf-parse). Caught 5 WRONG matches:
        Summer=Vivaldi(→Summer Four Seasons) not Cruel Summer; Rhapsody=Rachmaninoff(→Paganini) not Bohemian;
        Flower Song=Bizet(→Flower Song Carmen) not Flower; Lover=Taylor Swift not Lover's Carvings; The
        Beatitudes uncertain. Reversed all 5; re-merged Summer/Flower Song/Rhapsody to correct targets;
        left Lover + Beatitudes as active stubs for review. => 85 correct merges.
- [x] 1. ALIASES: scripts/library-aliases.js. Most short names already aliased correctly by original import;
        added 12 missing (Pachelbel Canon, radioactive paradise, etc.). --undo available.
- [x] 2. THE 10: merged all 10 earlier-archived stubs into completes (Despacito, Going to California,
        Concerto in E Major, Entr'acte III → quintet). Library now 910 active / 95 archived.
- [x] 3. THE 31 "needs review": verified each by PDF. Merged 7 confirmed-clean (Adagio for Strings/Barber,
        Bridal Chorus/Wagner, Tales from Vienna Woods, Birthday Variations, Rondeau/Mouret, Cardigan v2,
        Shake It Off). SKIPPED ~24 (verified false positives + trio/duo different-ensemble arrangements).
- [x] 4. DEEP AUDIT via 14 Opus subagent workflow (scripts/audit-consistency.js reads every part PDF):
        checked all 752 multi-part works / 3596 PDFs for cross-piece consistency, adversarially verified.
        RESULT: only 1 genuine inconsistency in the whole library → "Minuet" bundled Handel Water Music
        Minuet (4 parts) + Boccherini Minuet (4 'other' parts, different composer, share only "minuet").
        FIXED: split Boccherini parts into own work; renamed "Minuet (Water Music)"/Handel + "Boccherini
        Minuet"/Boccherini (David: rename accurately so book-making syncs); merged the Handel Minuet stub
        into Minuet (Water Music) → quintet. Both keep "minuet" keyword so a search surfaces both to pick.
        => PROOF: my merges introduced 0 problems; the 1 issue was pre-existing. Library 903 active / 103 archived.
- [ ] 5. THE 11 orphans + leftovers (Lover TS duo, The Beatitudes DSH quintet, Handel Hornpipe stub +
        Hornpipe family with 2 completes, trio/duo score-only arrangements) — no clean auto-merge; keep /
        review individually.

## Audit workflow reusable: Workflow library-consistency-audit + scripts/audit-consistency.js.

## KEY LESSON: title-token matching alone gives ~6% wrong merges. ALWAYS verify against the PDF's printed
## title/composer/arranger before moving live parts. pdf-parse (--no-save) at node_modules/pdf-parse.

## Verification log
- Merge verified: Autumn (Four Seasons), Belle, Hungarian #5, Bohemian Rhapsody all → full quintet {vln1,vln2,vla,vc,bass,score}. Stubs archived. Book routes bass only for quintet.

---

# Susan Fazio import (2026-07-20) — 18 new quartets

Source: `Music Compiler Local System/Susan Fazio - Violin2/` (152 files = 38 works x 4 parts)
Target: shared library org 6edbf230 (PSQ) — every brand reads it.

## Findings
- 38 works dropped; **20 already in the library** — SKIPPED. Fazio's are different engravings,
  so the sha-based dedupe would NOT catch them; importing would create duplicate rows.
- **18 genuinely new**, all complete 4-part quartets (vln1/vln2/vla/vc).

## Verification done BEFORE any writes
- [x] Matched all 38 titles vs the full library (exact normalized + token fallback), then per-title
      `ilike` spot-checks to kill false positives ("As" ~ "Texas Hold 'Em", "Bad"+"Romance").
      Spot-checks recovered 1 real duplicate my normalizer missed (Can't Take My Eyes Off You).
- [x] Confirmed library is exactly 1000 rows (886 active + 114 archived); offset>1000 returns 0.
      So the dedupe scan saw everything — no silent 1000-row cap.
- [x] Read page 1 of all 72 new PDFs: each carries its own correct part label, or the correct
      clef glyph (bass `?`/`>` = vc, alto `B`/`A` = vla, treble `&`/`%` = vln) where untexted.
- [x] Cleared 3 false alarms — Home / Harry Potter Medley / Rainbow medley each showed a foreign
      part name; all are stale running headers + cue lines in the source engraving. All 4 parts
      distinct by sha256 in every group.

## Steps
- [ ] Copy + rename 72 PDFs -> `Reorganized Music Library/Quartet Quintet/` as `Title - Artist - part.pdf`
- [ ] `update-library.js --dry-run` — expect exactly 18 new, 0 warnings
- [ ] Go live; verify 1000 -> 1018 rows, 72 parts uploaded
- [ ] Prove book-builder matcher finds them
- [ ] Commit + docs + memory

## Naming (matched to existing library conventions)
- "The" prefix kept: The Killers, The Cranberries (library already has The Verve / The Cure)
- `Beyonce` plain ASCII (library's existing form)
- `Umbrella (ft. Jay-Z)` -> `Umbrella` / Rihanna
- `Lava (from Disney Pixar's Lava)` -> `Lava` / James Ford Murphy
- `Harry's Wondrous World (from Harry Potter)` -> `Harry's Wondrous World` / John Williams
- Rainbow medley -> title patched to `Somewhere Over the Rainbow / What a Wonderful World` after
  import (Windows filenames can't hold "/"), matching the existing mashup convention. Kept
  distinct from the library's separate "Somewhere Over The Rainbow from Wizard of Oz".

## EXCLUDED
- `Can't Take My Eyes Off of You` — library already has Frankie Valli quartet + trio + duo.

## RESULT (live 2026-07-20)
- [x] Copied+renamed 72 PDFs into Quartet Quintet (byte-verified after each write)
- [x] Dry-run showed exactly 18, zero warnings -> went live
- [x] **Harry's Wondrous World REJECTED after import.** Its 4 "parts" were 4 copies of ONE
      file (caught by a distinct-sha256 check on the part rows). Extracted + viewed the
      scanned pages: it is a CONDUCTOR SCORE (Vln I / Vla / Cello / Str. Bass / Piano —
      no Violin II staff at all), a school-orchestra chart, not a string quartet. A cellist
      would have been handed the full score. Deleted the work + its 4 part rows (snapshot:
      scripts/repertoire-out/harrys-wondrous-world-removed.json); source PDFs set aside in
      the session scratchpad. NEEDS REAL PARTS SOURCED if David wants this piece.
- [x] **17 imported and verified**: 1000 -> 1017 rows, 886 -> 903 active, each with 4
      distinct part PDFs. Re-run of the importer finds 0 new (idempotent).
- [x] Medley title patched to "Somewhere Over the Rainbow / What a Wonderful World"
      (norm_title left unchanged so filename rescans stay idempotent).
- [x] PROVED bookable: throwaway vitest ran the real matchSong against the LIVE library with
      messy client-typed names ("Mr Brightside", "Good Luck Babe", "Texas Hold Em") — all 17
      matched, all complete quartets (partGap empty), no artist-mismatch ambers, and the
      rejected score confirmed unbookable. 18/18 passed. Test deleted after.
- NOTE the 3 import "errors" are PRE-EXISTING Brandenburg alias targets, unrelated.

---

# Catalog export for the brand websites (2026-07-20)

Built `scripts/export-catalog.js` + `docs/runbooks/export-catalog.md`.
`node scripts/export-catalog.js` -> scripts/repertoire-out/catalog/{md,txt,csv,html} + NEEDS-REVIEW.md

- **702 songs published** of 903 active works; 166 held back, 0 dropped silently.
- Gate: must be BOOKABLE (core parts present) AND have a presentable title.
- The library is an internal index — a raw dump would have put `Enchanted_-_Taylor_Swift_Easy`,
  `Duets CUBED 2V (B) - 47 pages` and `debussy-golliwogs-cakewalk-for-string- print` on a
  customer-facing page. Hence the quality gate.
- Cleanups: filename underscores, leaked part names in titles ("Air in F Viola" -> "Air in F"),
  junk artists (Copy / Score / String Trio / Violin Cello), ensemble suffixes ("Queen - String
  Trio" -> "Queen"), and Bach/J.S. Bach style duplicate merges (substring-safe only).
- Held back is mostly duo arrangements whose quartet twin still publishes — song not lost.
- [ ] DAVID'S CALL: "What a Wonderful World" + "The Four Seasons" each publish twice under
      two artist spellings (composer vs performer). See NEEDS-REVIEW.md.
- [ ] Site grouping (Classical/Pop/Wedding) is manual — library has no genre column.
      V2: add `genre` to repertoire, or serve catalog.json from an API route so the
      marketing site reads the library live and the paste step disappears.

---

# Score-only works ("conductor only") — 2026-07-20

David's players read from scores on iPads with page-turn pedals, so a work that
only has a conductor score is genuinely playable. Today those works reach nobody:
`matchInstrumentForPart` maps parts to players by instrument name and `score`
isn't in that map, so the book builder silently skips them.

## Data (measured before coding)
- 702 complete works — unaffected.
- **22 score-only** works (a score, no individual core parts) — currently unbookable.
  Real repertoire: Something Just Like This, Morning Mood, Oceans, 7 by Beatles,
  Levitating, Che Gelida, Fireworks Overture, Rumanian (Bartok), Largo Bach Double...
- 4 partial works that also have a score; 58 partial with no score.

## DAVID'S DECISIONS
1. Fallback scope = **score-only works ONLY** (not "any missing part").
   The 4 partial-with-score works keep behaving exactly as they do today.
   => zero behavior change for any existing work. Unlocks 22.
2. Score-read songs **DO** go on the public website catalog.

## Design — a score is a delivery format, not a missing part
A "score-only work" = has a `score` file AND no individual core part files.
For those, every player reads the score. Concept lives in ONE predicate so the
matcher, the book builder and the export can't drift apart.

- [ ] `matcher.ts`: add `isScoreOnly(parts)`. `partGap` returns [] for score-only
      works — nothing is *missing*; the music is all there, in one document.
      (Do NOT report 4 gaps each "covered by score" — that reads as broken.)
- [ ] `book-builder.ts`: `pickFileForPart` gains rung 4 — score-only works return
      the score file, labelled `score`, with a warning so the admin sees it.
      Rungs 1-3 untouched, so no existing work changes.
- [ ] `intake-song-row.tsx`: show an honest "reading from score" note instead of
      the (now empty) missing-parts note.
- [ ] `export-catalog.js`: score-only works count as bookable → website list.
- [ ] Tests for the predicate + both call sites.
- [ ] Re-add Harry's Wondrous World as ONE work + ONE `score` part (honest model,
      NOT four copies of the same file).

## CAVEAT to re-raise after shipping
Harry's Wondrous World is a 4-page EXCERPT (Conductor pp. 4-7, opens at bar 38)
of a school-orchestra chart with staves Vln I / Vla / Cello / Str. Bass / Piano —
**no Violin II line at all**. Score-reading does not fix that; a 2nd violinist has
nothing to play. Reinstating per David's call, but it needs real parts sourced.

## RESULT (live 2026-07-20)
- [x] `isScoreOnly(parts)` in matcher.ts — ONE definition shared by matcher, book
      builder and the website export so they can't drift.
- [x] `partGap` returns [] for score-only works (not 4 bogus "missing" entries).
- [x] `pickFileForPart` rung 4: score-only works give every player the score, with
      a warning. Rungs 1-3 untouched.
- [x] Intake row shows "reading from score (no individual parts)".
- [x] export-catalog.js counts score-only works as bookable.
- [x] 13 unit tests + typecheck clean; **378 existing tests still pass**, including
      all 23 book-builder tests unchanged => no regression.
- [x] Live throwaway test vs the real library: **29 score-only works, every one
      bookable by every player**; regression check proved the score NEVER leaks
      into a work that has real parts. Deleted after.
- [x] Harry's Wondrous World re-added as ONE work + ONE `score` part.
- [x] Website catalog 702 -> **719 songs** (Something Just Like This, Morning Mood,
      Oceans, 7 by Beatles, Levitating, Che Gelida, Fireworks Overture, Rumanian...)
- [x] Both runbooks updated (update-music-library.md gains a "Score-only works"
      section; export-catalog.md notes the new inclusion rule).
- STILL TRUE: Harry's Wondrous World has no Violin II staff. The book now builds
  and every player gets the score, but a 2nd violinist still has nothing to read.
  Real parts should be sourced. Documented in the runbook caveat.

---

# Catalog data repair (2026-07-20) — live

Found by diffing our catalog against what's live on the brand sites.

## THE SAFETY RULE David set
"I don't want the issue where we type in a song we used to have and now the system
says missing and doesn't compile either."

Matching runs on `norm_title` + `title_aliases`, NEVER on the display title. So
renames changed ONLY `title`/`artist` and left `norm_title` untouched — every old
spelling keeps working — and an ALIAS was added for each new spelling. Strictly
more matchable than before, never less.

## Fixed (scripts/fix-catalog-data.js, reversible: --undo)
- [x] Mojibake x3: DvoraÌ€k -> Dvořák Waltz, FaureÌ -> Fauré Pavane,
      SchoÌˆn -> Schön Rosmarin (double-encoded UTF-8 baked into the DB).
- [x] Lost apostrophes x4: Anna's Minuet, Entr'acte IV, Rodger's Waltzes,
      The Lord's Prayer.
- [x] Swapped columns: "Four Seasons" / artist "Spring Movement 1"
      -> "Spring (The Four Seasons)" / Antonio Vivaldi.
- [x] SPLIT WORK: Skyfall existed as FOUR one-part works ("Skyfall Cello pdf"...)
      each with an `other` part, so it could not be booked at all. Merged into ONE
      quartet: 4 parts relabelled vln1/vln2/vla/vc from their explicit filenames
      (verified 4 distinct sha256 first), stubs ARCHIVED not deleted, and every
      stub's old name kept as an alias.
- [x] 14 aliases added.

## Proof
- [x] Before/after matcher snapshot over 25 names: **0 regressions, 8 newly
      matching** (typing "Anna's Minuet" or "Skyfall" used to MISS entirely).
- [x] Live throwaway test, 12 cases: every repaired name matches AND compiles a
      full 4-part book (Skyfall delivers 4 DIFFERENT files, not one score x4).
      Deleted after.
- Undo map: scripts/repertoire-out/fix-catalog-data-undo.json

## Also
- [x] Stronger (Kanye West) imported — complete quartet + score.
- [x] export-catalog gate fixes: "Grow Old With You"/"The Old Refrain" were being
      REJECTED (the annotation rule matched "old" anywhere); placeholder rows
      ("Glass Animals - Glass Animals", "Jungleland - PSQ", "Jessica Pena Wedding
      Set", "Recessional", "By Beatles") were being PUBLISHED. Both fixed.

## STILL OPEN — the real gap
~166 songs live on the brand websites are ABSENT from the Podium library
(verified: Chanukah Medley, Hine Ma Tov, Dodi Li, Klezmer Medley, Deck the Halls,
Silver Bells, Winter Wonderland, O Come O Come Emmanuel, Thank U Next, Diamonds,
Luck Be a Lady...). The sites advertise music Podium cannot build books for.
=> Any website import must be ADDITIVE. Finding those PDFs is the next project.

---

# The "18 incomplete works" — 2026-07-20

Diagnosed all 18. **Almost none were missing music.** The files were on disk; they
were filed wrong. Four distinct faults:

## 1. SPLIT ARRANGEMENTS (3) — one song stored as two rows
Lay Lady Lay, Say You Know, Carol of the Drum. One file had been renamed to the
`Title - Artist - part.pdf` convention while its siblings kept their original
names, so the importer read them as different works and each row held half the parts.

**EVIDENCE (this is the bit that matters):** the last merge pass taught that title
matching alone gives ~6% wrong merges. These PDFs are vector-drawn with no text, so
no title could be read. Used **PDF print provenance** instead — each group was
printed to PDF in one sitting, seconds apart:
  Lay Lady Lay  2021-08-23 11:16:51 / 11:17:08 / 11:17:25 / 11:17:45  (54s)
  Say You Know  2021-10-06 09:00:19 / 09:00:34 / 09:00:44 / 09:00:56  (37s)
  Carol of Drum — vln1 PDF text reads "Violin I | The Carol of the Drum | Katherine
  K. Davis | arranged by Matthew Naughtin"; the same Naughtin set's Score was
  ALREADY on the target row.

## 2. MISLABELLED PARTS (1) — worse than "incomplete"
"Welcome To the Jungle" had the **CELLO file stored as `vln2`**, the viola as
`other`, Violin I as a substitute, and Violin II missing entirely. Artist: "Cello".

**ROOT CAUSE FIXED** in `scripts/repertoire-index.js`: the part detector treated
`v2` as "violin 2", but it is an engraver's *version* suffix. Every v-suffixed file
in the library is a version; none is a violin (measured: 5 files, 0 violins). `v\d+`
is now a trailing annotation, and `v1`/`v2` were removed from the violin rules — so
the instrument token behind the suffix wins. part-guess tests still pass.

## 3. WRONG PART TYPE (1)
"Erev Shel Shoshanim" is a full SCORE stored as `other`, so it counted as a
fragment. Relabelled `score` -> now bookable via the score-only feature. Retitled
from `Erev_Shel_Shoshanimfor_string_quartet`, artist Yosef Hadar.

## 4. NOT ACTUALLY BROKEN (the rest)
Duo/solo-only arrangements (The Final Countdown, This Must Be the Place, Al di la,
A Postcard to Henry Purcell) and rows where a COMPLETE sibling already existed
(This Will Be, Ave Maria, Married Life). Deliverable — just not as a quartet.

## NOT TOUCHED — deliberately
"Romeo and Juliet Theme" has vc/vla/vln1 plus a bare `vln`. Probably violin 2, but
the PDFs are vector-drawn with no text AND no embedded image, so it cannot be
verified here and no rasteriser is available. Guessing risks handing a violinist
the wrong line. **David: open `Romeo and Juliet Theme - Rieu - vln.pdf` and confirm
it says Violin II** — then it is a one-line relabel.

## Proof
- Live throwaway test, 8 cases: all recovered works match AND build a full 4-part
  book with 4 DIFFERENT files; Welcome To the Jungle now hands the Cello file to
  the cellist; Erev is score-only bookable; old names still resolve. Deleted after.
- 124 intake tests pass. Catalog 717 -> **722 songs**.
- Undo: fix-incomplete-works.js --undo, carol-merge-undo.json

## Romeo and Juliet Theme — RESOLVED 2026-07-20 (David confirmed by eye)
David opened the PDF: the bare "- vln.pdf" IS the violin 2 part.
Found the labels were CROSSED, not just missing one:
  "- vln.pdf"  was vln1  -> vln2   (the file David identified)
  "- vln1.pdf" was other -> vln1   (bumped to 'other' because the vln1 slot was taken)
Cause: the indexer's vln1 rule accepts a bare "vln", so "- vln.pdf" claimed the vln1
slot first and the real vln1 file collided out. Now a complete quartet.
Undo: scripts/repertoire-out/romeo-vln2-undo.json

## FINAL STATE — items 1-4 all confirmed live (9/9 tests)
- 1 SPLITS: Lay Lady Lay, Say You Know, Carol of the Drum — each builds 4 distinct parts
- 2 MISLABEL: Welcome To the Jungle — cellist gets the Cello file, artist Guns N' Roses
- 3 SCORE-ONLY: Erev Shel Shoshanim — every player reads the score (David's call)
- 4 ROMEO: complete, vln2 = the file David confirmed
- No old name stopped matching. Catalog now **723 songs**.

---

# Music library: add parts / add works from the library page (2026-08-16)

## The gap

The library page could Preview, Download, **Replace**, History, Remove and Archive —
but there was no way to ADD. If a work was missing a part (e.g. "Iris" has
vln1/vln2/vla/vc but no Score), the only door into the library was the intake
review screen's "Add to library" dialog, which needs an intake row to hang off.
So a score that arrived on its own had nowhere to go.

`POST /api/repertoire/add-work` already knew how to extend an existing work, but it
identifies the work by (title, artist, ensemble) because an intake row has no id
yet — from the library page, a typo in the title would silently create a SECOND work.

## Done

- [x] Extracted the upload fidelity gate (HEAD -> size check -> server-side re-hash ->
      delete corrupt object) into `src/lib/repertoire/uploaded-parts.ts`, so add-work
      and the new route clear the same bar from one implementation.
- [x] New route `POST /api/library/works/[workId]/parts` — attach uploaded PDFs to a
      work BY ID. Org-scoped through the resolved library org, append-only, refuses a
      filled role with a 409 naming Replace.
- [x] Library page: **+ Add part** under each work's part list (compact *and* detailed
      views — Replace once shipped detailed-only while the page defaults to compact,
      which hid it completely).
- [x] Library page: **Add work** button, reusing the intake AddWorkDialog unchanged.
- [x] Runbook: `docs/runbooks/update-music-library.md` Option C.

## Decisions

- Only roles the work is MISSING are offered. Not tidiness: (repertoire_id, part,
  substitute, coalesce(played_on,'')) is unique, so a second Violin 1 is a row the DB
  refuses. A substitute ("vla covering vc") is keyed separately and does not block the
  real viola role.
- Add never overwrites. Swapping a file is Replace's job, which keeps the old one under
  History. A silent skip is what the archived-work book bug felt like from outside.
- Adding to an ARCHIVED work is allowed but says the work is still archived — it still
  matches nothing until restored.
- No migration. This uses the 068 tables as they stand.

## Verification log

- 22 new tests in `src/lib/__tests__/library-add-parts.test.ts`: fidelity gate driven
  against a fake R2 (missing object, size mismatch, hash mismatch -> object deleted,
  good file passes), route gates, collision rules, both views wired.
- Full suite: 666 passed. 1 failure, `plan-limit-enforcement.test.ts`, PRE-EXISTING —
  confirmed failing with these changes stashed. Unrelated (it parses migration 080 SQL).
- `tsc --noEmit` clean; `npm run build` compiles and registers
  `/api/library/works/[workId]/parts`.
- NOT yet clicked through in a browser against real data.


---

# Book Builder — loose song-list parsing (Megan Graves 8/28)

## Problem
The parser was built against 17hats questionnaire output, where every field has an
explicit label ("Processional Walking Order", "Prelude Requests", "Officiant (Name)").
A hand-typed list uses bare ALL-CAPS headers and bare participant lines. Five defects
result, one of which SILENTLY LOSES DATA.

## Confirmed defects (traced, line by line)

### Parser
- [x] P1. **"CEREMONY" is not a section header.** SECTION_PATTERNS has no bare
      `\bceremony\b` rule, so the line falls through and becomes a phantom song
      "Ceremony" at Prelude #10. Must not hijack 17hats' "Ceremony Information"
      boilerplate -> gate section detection on `!hasSkipMarker()`.
- [x] P2. **"Officiant" swallows the NEXT line.** The bare-officiant branch treats the
      following line as the officiant's name, so "Parents, 2 pairs" was consumed as a
      name and DISAPPEARED - no song, no walking-order step, no warning. This breaks
      the parser's own foolproof contract ("never drop a line silently").
- [x] P3. **Walking-order participants become songs.** "Bridal party 5 pairs" and
      "Bride with FoB" were added as ceremony songs with role Processional. They must
      go to `processionalOrder` (the UI's "Processional walking order" field, which
      currently reads "None specified").
- [x] P4. **Event header line warns.** "August 28th - Megan Graves" -> red warning.
      A `<date> - <name>` preamble should be consumed and the name offered as the
      contact name (visible, editable field) rather than raised as an error.

### Matcher
- [x] M1. **"Everlasting Love" -> confident green match on the WRONG song.**
      Library has no "Everlasting Love"; it has "This Will Be (An Everlasting Love)".
      The keyword tier's subset test made the query a token-subset of a longer title
      and returned status='matched'. Fix: a keyword hit that lands ENTIRELY inside the
      library title's parenthetical is a subtitle-only match -> demote to 'ambiguous'.
      (Must NOT break "Canon in D" -> "Pachelbel - Canon in D - Score", which is right.)
- [x] M2. **"Married Life" -> matched the SOLO cello chart for a string quartet.**
      Library rows: "Married Life from UP" (quartet, has vln1/vln2/vla/vc/score),
      "Married Life" (solo, vc only). Exact title beats the correct arrangement, so
      the book builder would hand a quartet a cello-only chart. Fix: when the exact
      tier yields NO candidate in the gig's ensemble, keep searching the looser tiers
      and merge, so the real quartet arrangement is offered.

## Not bugs (leaving alone)
- "How Sweet It Is", "Teenage Dream", "Dancing On My Own", "Never Let You Go" are
  genuinely absent from the library. The flags are correct - this is repertoire to buy
  (see tasks/missing-repertoire.md).
- "What A Wonderful World" amber (quartet/WeissThiele vs duo/Louis Armstrong) is a
  real choice - same title, different credited artist. Auto-picking on ensemble alone
  would silently guess between same-titled different songs. Leave as one-click amber.
- "Recessional" as its own section (not a ceremony role) is the existing data model.

## Verification
- [x] V1. New regression test: this exact Megan Graves text -> 0 warnings,
      correct sections, walking order populated, no phantom songs.
- [x] V2. New matcher tests for M1 and M2 (and the "Canon in D" non-regression).
- [x] V3. Full suite green (baseline: 126 passing).
- [x] V4. Re-run the real text end to end and eyeball the review screen.

## Outcome (verified 2026-08-23, local — NOT yet deployed)

Re-ran the real Megan Graves text against the live PSQ library (908 works, 252
aliases) through the same functions the API route uses. Exactly four rows changed
and nothing else:

  - OK   Married Life -> Married Life [solo] (missing vln1, vln2, vla)
  + PICK Married Life -> Married Life from UP [quartet]
  - MISS Ceremony                  (phantom song, gone)
  - MISS Bridal Party 5 Pairs      (phantom song, now a walking-order step)
  - MISS Bride With Fob            (phantom song, now a walking-order step)
  - OK   Everlasting Love -> This Will Be (An Everlasting Love)
  + PICK Everlasting Love -> This Will Be (An Everlasting Love)  + subtitle warning

Before: 8 of 42 unmatched, 1 red parse warning, walking order empty.
After:  30 matched / 7 need a pick / 2 genuinely missing, 0 warnings,
        walking order = Officiant, Parents 2 pairs, Bridal party 5 pairs, Bride with FoB.

Tests: 145 pass in src/lib/intake (was 126 - added 19). Full suite 685/686; the
one failure (plan-limit-enforcement) is PRE-EXISTING and unrelated - it parses a
plan-limits SQL migration and fails identically with these changes stashed.
tsc --noEmit clean, eslint clean.

## Notes for v2
- "Mirrors" is filed as `trio` in the library but actually carries all four parts.
  The label is wrong, not the match - worth a data sweep for other mis-foldered works.
- The escalation only searches the keyword tier. A quartet arrangement titled with
  NO shared keyword (a translated or renamed title) still won't be found; that needs
  a title alias.
- "What A Wonderful World" stays a one-click pick on purpose: same title, different
  credited artist (WeissThiele composer credit vs Louis Armstrong performer credit).
  Auto-picking on ensemble alone would silently guess between same-titled songs.

---

# Hand-typed lists, round two (Kyle & Sara 8/29) — 2026-08-26

The vocabulary-based walking-order check from the Megan pass could not survive
real input. Four defects, plus one serious PRE-EXISTING bug found while testing.

## Confirmed defects

- [x] K1. **"Bridemaids, 3" and "Incense carrier, 1" became songs.** A whitelist of
      role words cannot cover a typo ("Bridemaids") or a role no list enumerates
      (an incense carrier, in a Persian ceremony). Fixed with a STRUCTURAL tell that
      needs no vocabulary: a headcount. "Officiants, 2" / "Grandparents, 2 pairs" /
      "Incense carrier, 1" are counts of people; songs do not carry counts.
      Guarded so a bare trailing digit does NOT qualify — "Spring 1" and
      "Christmas Medley 3" are real library works and must stay songs. The count
      must follow a comma, or be followed by a counting noun.
- [x] K2. **A performance direction was read as an artist.** "Soltane Ghalbha -
      START AT pickup to bar 8 (only violin 1 has pickup)" split like any
      "Title - Artist" line, so the direction became the artist and the matcher
      raised a bogus artist-disagreement against the real composer. Directions now
      go to intake_songs.notes and never reach the matcher. Decided at addSong —
      the single choke point every split funnels through.
- [x] K3. **"TACET - DJ will play" was hunted for in the library.** TACET means we
      do not play. New no_music state (migration 083): kept and marked, never
      dropped, because the players need to know the slot is the DJ's. Grey badge,
      no library search, no candidates, excluded from books, still on gig details.
- [x] K4. **Event header + walking order held up** from the Megan pass (contact name
      "Kyle and Sara" read correctly, 4 of 6 steps already captured).

## PRE-EXISTING bug found while testing (not from the Megan pass)

- [x] K5. **Any song line containing the word "please" was SILENTLY DROPPED.**
      INSTRUCTION_MARKERS was tested with `lower.includes(m)` against the whole
      line, so "Canon in D - please start at bar 8" and "Perfect - please play this
      one slowly" both vanished — no song, no warning. Clients ask for directions
      exactly that way, so this was live data loss. An instruction line must now
      BEGIN with the word, or be a wholly parenthesised aside.

## Caught by the new tests, before shipping
- A bare `silent` in the no-music pattern swallowed **Silent Night**; a bare
  `nothing` swallowed **Nothing Else Matters**. Both are real works. The pattern
  now only matches phrases that can never be a title.

## Verification (local — migration NOT yet run, code NOT yet deployed)
Kyle & Sara: 14 rows with 4 unmatched  ->  12 rows, 10 matched / 1 pick / 0 missing,
0 warnings, all 6 walking-order steps, the direction filed as a note, the recessional
marked "No music — DJ will play".
Megan Graves re-run: byte-identical to the deployed behaviour — no regression.
Tests 145 -> 159 in src/lib/intake. tsc clean, eslint clean (one pre-existing warning).
Full suite 699/700; the one failure (plan-limit-enforcement) is pre-existing.

## Notes for v2
- Walking order is still only detected inside the ceremony section. A list that
  puts the participants before any header would still read them as songs.
- The client planner's save route defaults no_music to false; only the paste path
  sets it. Fine today (the planner is a structured form), revisit if that changes.
