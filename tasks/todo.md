# Easy Music Library Updates from Local PDFs (2026-07-19)

## The goal (plain English)
David has a stack of new sheet-music PDFs on his machine. He wants the EASIEST way to add
them to Podium's catalog so they register with the right Title + Artist and "function well"
in the system — without feeding them through the in-app "Add to library" button one at a time.
He wants BOTH paths available: batch (a pile at once) AND on-the-fly (in-app, one-off). Runs
on BOTH Windows and Mac.

## Key facts (traced from the real code, not guessed)
- Title/Artist/Part are parsed ENTIRELY from the FILENAME. Golden format:
  `Title - Artist - part.pdf`  (parts: vln1, vln2, vla, vc; trios = vln1/vln2/vc, no viola).
  A clean name → registers perfectly. A bad name → lands in "needs-review" with blank artist.
  => "Make sure they register well" = catch bad filenames BEFORE they hit the DB.
- Three existing scripts, all idempotent (re-run only adds what's new, can't dup/clobber):
  repertoire-index.js (scan+classify) → repertoire-upload.js (bytes→R2) → repertoire-db-import.js (rows).
- Library org = Project String Quartet 6edbf230-e43a-42c0-a60d-8cd67be87276 (every brand shares it).
- Gap: 3 separate commands + an env var, and no single "eyeball the new titles before committing" step.

## Plan
- [x] 1. Enhance `scripts/repertoire-db-import.js` — added `report.newWorks` list + `--report <path>` flag.
      PLUS root-cause fix (see below): content-presence (sha256) idempotency so re-runs never dup.
- [x] 2. Build `scripts/update-library.js` — ONE command, human-gated. Defaults org to PSQ. Flags: --yes, --dry-run, --org.
- [x] 3. Launchers at repo root: `Update Music Library.cmd` (Windows) + `Update Music Library.command` (Mac).
- [x] 4. In-app on-the-fly path untouched (Book Builder "Add to library…" — not modified).
- [x] 5. Proved end-to-end (see verification log).
- [x] 6. Doc: `docs/runbooks/update-music-library.md`. Memory updated.

## ROOT-CAUSE FIX found mid-build (important)
The original db-import matched existing songs by (norm_title, artist, ensemble). But the DB stores
richer artists (e.g. "The Beatles") than a fresh filename scan produces (blank). So a re-run saw
131 phantom "new" works and a LIVE run would have INSERTED 131 DUPLICATES into the shared library
(this is almost certainly the "dirty duplicate repertoire rows" open nit). FIXED: existence is now
decided by the PDF's sha256 (content-addressed, matching R2 storage) — a work whose every part sha
is already stored is skipped; parts are skipped by sha too. Additive, safe, empty-DB fallback intact.

## Verification log
- db-import --dry-run BEFORE fix: insert 131 works / 249 parts (phantom dups). AFTER fix: insert 0 / skip 996 works, skip 3558 parts, 0 errors. ✅
- update-library.js --dry-run, no new files → "✓ already up to date (996 already in library)". ✅
- Added 1 unique-bytes test quartet (Zzz Test Song - Test Composer, 4 parts) → detected as "1 new song", correct title/artist/parts. ✅
- Added 2 bad-name files (no-artist, unparseable) → both ⚠-flagged with reasons + rename instructions BEFORE commit. ✅
- All test files deleted, index restored, temp plans removed → back to "996, 0 new". ✅
- Only non-destructive live path is behind [y/N] confirm (or --yes). Upload→import order; resumable on failure.
- NOT YET RUN LIVE (no real new PDFs yet). First real batch: drop PDFs → double-click launcher → review → Y.

## V2 ideas
- Standalone web upload page (drag-drop PDFs in the browser, no local folder) — does NOT exist today;
  only the per-song in-book "Add to library…" exists. Would be a new admin route.
- Auto-suggest artist from a title lookup when the filename omits it.
