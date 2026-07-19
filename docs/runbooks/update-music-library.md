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
