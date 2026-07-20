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
