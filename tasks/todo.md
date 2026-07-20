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
