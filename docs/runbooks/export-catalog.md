# Runbook — export the song catalog for the websites

Turns the live music library into paste-ready song lists for the brand sites
(podiumpersonnel.com, subitostrings.com/music, etc.).

```bash
node scripts/export-catalog.js
```

Everything lands in `scripts/repertoire-out/catalog/`:

| File | Use it for |
|---|---|
| `catalog.html` | Open in a browser. Styled + searchable. Drop straight into a page, or just preview. |
| `catalog.md` | Paste into a CMS that takes Markdown. Grouped A–Z. |
| `catalog.txt` | `Title - Artist`, one per line. Simple list blocks. |
| `catalog.csv` | Spreadsheets, Squarespace/Wix list imports. Has an Ensembles column. |
| `NEEDS-REVIEW.md` | **Read this.** Everything held back, and why. |

Re-run it any time you add music — it always reads the live library.

## What gets published

The library is an internal working index, not a customer-facing list. Some titles
are raw filenames (`Enchanted_-_Taylor_Swift_Easy`), some rows are fragments with
no playable parts, some have no artist. None of that belongs on a website.

A song is published only if **both** are true:

1. **It's bookable** — every core part for its ensemble is present
   (quartet/quintet = vln1+vln2+vla+vc, trio = vln1+vln2+vc), **or** it's a
   score-only work (a conductor score and no individual parts), which the players
   read off a tablet. See "Score-only works" in `update-music-library.md`.
2. **The title reads like a song title** — no filename underscores, page counts,
   working annotations ("copy", "old", "v2"), or part names.

Anything failing either test goes to `NEEDS-REVIEW.md` — **never dropped silently.**

## Cleanups it applies (cosmetic only — it never invents information)

- Filename underscores → spaces; strips `- 47 pages`, `for string quartet`, `print`.
- Strips a part name that leaked into the end of a title:
  `Air in F Viola` → `Air in F`.
- Recovers an artist embedded in the title, but **only** on an explicit ` - `
  separator: `Enchanted - Taylor Swift Easy` → `Enchanted` / `Taylor Swift`.
  It will not guess (`Catch Me Demi Lovato` is held back instead).
- Drops junk artist values (`Copy`, `Score`, `String Trio`, `Violin Cello`) and
  ensemble suffixes (`Queen - String Trio` → `Queen`).
- Merges one song listed under two spellings of the same name
  (`Bach` + `J.S. Bach`) — only when one name contains the other, so two genuinely
  different artists sharing a title are never merged.

## Things it deliberately leaves to you

- **Same title, two different artist names** (composer vs performer — e.g.
  *What a Wonderful World* under both Louis Armstrong and Weiss/Thiele). Both
  publish; `NEEDS-REVIEW.md` lists them so you can pick one.
- **Duo arrangements with no artist.** Most are held back, but the song usually
  still appears in the list via its quartet row — check before "fixing" one.
- **Genre/category grouping.** The library has no genre field, so the export is
  alphabetical. If the site groups by Classical / Pop / Wedding, that grouping has
  to be applied by hand (or we add a genre column to `repertoire` — see V2 below).

## Fixing a held-back song properly

Don't patch the export — fix the source, so it's right in Podium too:

1. Rename the PDFs to `Title - Artist - part.pdf` in
   `Music Compiler Local System/Reorganized Music Library/<Ensemble>/`
2. `node scripts/update-library.js` (see `update-music-library.md`)
3. Re-run the export.

## V2 ideas

- A `genre` column on `repertoire` so the export can group like the websites do.
- Publish `catalog.json` to an API route so the marketing site reads the library
  live and the manual paste step disappears entirely.
