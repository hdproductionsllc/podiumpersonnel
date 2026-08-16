# Adding New Music to the Library

Two ways to get new sheet-music PDFs into Podium. Pick whichever fits the moment.

---

## Option A — A stack of new PDFs at once (the easy button)

Use this when you've got a folder of new charts on your computer.

### 1. Name the files correctly (this is everything)

Podium reads the **title, artist, and part straight from the filename**. Name each part:

```
Title - Artist - part.pdf
```

- Parts: `vln1`  `vln2`  `vla`  `vc`  (also `bass`, `score`)
- Trios use `vln1` / `vln2` / `vc` — **no viola**
- Examples:
  - `A Thousand Years - Christina Perri - vln1.pdf`
  - `Canon in D - Pachelbel - vc.pdf`

A clean name registers perfectly. A messy name (no artist, or `scan_047.pdf`) still imports, but won't be searchable by artist until renamed — the tool warns you about these before anything goes live.

### 2. Drop them in the right folder

```
Music Compiler Local System/Reorganized Music Library/<Ensemble>/
```

Ensemble folders: `Quartet Quintet`, `Trio`, `VC Duo`, `Solo Violin`, `Solo Cello`, `Viola Trio`.
(A string quartet piece goes in **Quartet Quintet**.)

### 3. Run the updater

- **Windows:** double-click **`Update Music Library.cmd`** in the project folder.
- **Mac:** double-click **`Update Music Library.command`**.
- **Terminal (either):** `node scripts/update-library.js`

It will:
1. Scan the library
2. Show you a table of **only the new songs** (title, artist, parts) and flag anything with a bad name
3. Ask **"Add N songs? [y/N]"**
4. On `y` — upload the PDFs and make them live in the shared library

Preview without writing anything: `node scripts/update-library.js --dry-run`

### Why it's safe

- "New" is decided by the PDF's **content fingerprint (sha256)**, not its guessed artist. Re-running with nothing added reports **0 new** and can never create duplicates.
- It uploads into **Project String Quartet's** library, which every brand (Subito, Meridian, Lonestar…) shares — so you import once and everyone sees it.
- If the upload fails partway, nothing is half-done — just run it again to resume.

---

## Option B — One song while building a book (on the fly)

When you're in a project and a requested song isn't in the library, use the **"Add to library…"** button in the intake/book-builder flow. It uploads that song's part PDFs right there in the browser and adds them permanently. Best for one-offs; Option A is better for a batch.

---

## Option C — a missing part on a song that's already there (Music Library page)

**Dashboard → Music Library.** This is the one to use when a work is on the shelf
but incomplete — the classic case being a **score that turns up after the parts**.

- **Add one part to an existing work:** find the song, click **Manage** (compact
  view) or switch to Detailed view, then **+ Add part** under its part list.
  Choose the PDFs, confirm the part role in the dropdown, **Add**.
  The dropdown only offers roles that work is missing, and the line above it
  spells out which those are — so you can't create a second Violin 1.
- **Add a whole new work:** the **Add work** button at the top right of the page.
  Same dialog as Option B: title, artist, arrangement, and the part PDFs. If a
  work with that exact title/artist/arrangement already exists, it extends that
  one instead of creating a twin.

Notes:

- To **swap** a file the work already has, that's **Replace** on the part row, not
  Add — Add is append-only and will refuse a role that's already filled (it tells
  you to use Replace). Replace keeps the old file under **History**.
- Adding a part to an **archived** work works, but the work stays archived and so
  still matches nothing. Restore it if you want it back in play — the success
  message says so.
- Every file is re-downloaded and re-hashed on the server before it becomes a
  library row, the same check Options A and B run. A file that doesn't match what
  the browser sent is rejected, not saved.

---

## Under the hood

`update-library.js` is a thin wrapper over three idempotent scripts:

| Step | Script | What it does |
|------|--------|--------------|
| scan | `repertoire-index.js` | classify every PDF (title/artist/part from filename) |
| plan | `repertoire-db-import.js --dry-run` | work out which songs are genuinely new (by sha256) |
| upload | `repertoire-upload.js` | push new PDF bytes to R2 (content-addressed, auto-dedup) |
| catalog | `repertoire-db-import.js` | write the `repertoire` / `repertoire_parts` rows |

Library org: **Project String Quartet** `6edbf230-e43a-42c0-a60d-8cd67be87276`.
Override with `--org <uuid>` if you ever need a different library.

## Score-only works ("conductor only")

Some works exist only as a **conductor score** — one document with every line on
it — and have no individual part files. These are playable: the players read the
score off a tablet and turn pages with a foot pedal.

To add one, name the file with the `score` part:

```
Harry's Wondrous World - John Williams - score.pdf
```

The importer will flag it `⚠ missing some parts`. **That warning is expected and
safe to accept** for a score-only work — it just means no individual parts exist.

What the system then does:

- Every player's book gets the score (`pickFileForPart` falls back to it).
- The intake screen shows *"reading from score (no individual parts)"* rather than
  *"missing vln1, vln2, vla, vc"* — nothing is actually missing.
- It's published to the website catalog like any other song.

**The rule is deliberately narrow.** A work that has *some* real parts is NOT
score-only: one absent line is never quietly papered over with the score. That
case still shows a real gap, exactly as before. If you want the score to cover a
partial work, add the missing part properly instead.

Caveat worth checking before relying on one: a score written for a different
lineup may not contain a line for every player. *Harry's Wondrous World*, for
example, is a school-orchestra chart (Vln I / Vla / Cello / String Bass / Piano)
with **no Violin II staff at all** — so a second violinist has nothing to read
even though the book builds. Open a score-only work once before booking it.
