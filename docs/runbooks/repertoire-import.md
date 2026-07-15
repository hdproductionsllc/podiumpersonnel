# Runbook — Repertoire import (sheet-music library → R2)

Imports David's local sheet-music library (the `Reorganized Music Library` folder,
~3,600 PDFs) into Podium: **files → Cloudflare R2**, metadata → Postgres (metadata
is a later phase). The PDFs are treated as the artist canon and are never renamed,
rewritten, or re-encoded — bytes reach storage identical, and every file is
verified by sha256.

The import is three steps: **index → review decisions → upload.** This runbook
covers running them, plus the one-time Cloudflare setup.

---

## The three steps

### 1. Index the library

Scan the read-only library, parse each filename, compute a sha256 + size for every
PDF, and classify each entry. Output is written to
`scripts/repertoire-out/index.json` (git-ignored — it is regenerated from the
local library and references local absolute paths).

```
node scripts/repertoire-index.js          # (indexer — Phase A1)
```

Each entry in `index.json` carries at least the fields the uploader needs:

| field              | meaning                                                        |
| ------------------ | ------------------------------------------------------------- |
| `absPath`          | absolute path to the PDF on disk (or `relPath` + top-level `libraryRoot`) |
| `originalFilename` | the real filename, preserved verbatim as metadata             |
| `sha256`           | lowercase hex sha256 of the file bytes (computed at index time) |
| `size`             | file size in bytes                                            |
| `contentType`      | `application/pdf`                                             |
| `classification`   | `confident` \| `review` \| … — only `confident` files upload |

The index may be either a bare array of entries or an object `{ libraryRoot, files: [...] }`.

### 2. Review the decisions

Only files classified `confident` are uploaded. Everything else (messy names,
no-part-detected, substitute parts, duplicates that need a human call) stays out
of the upload until David reviews the decision batches. **This step is manual and
is a hard gate — the uploader writes no database rows and imports nothing on its
own.**

### 3. Upload to R2

```
# Credentials + org come from .env.local (or flags). Then:
node scripts/repertoire-upload.js
```

What it does:

- Reads `scripts/repertoire-out/index.json` and takes every `classification === "confident"` entry.
- Uploads each to a **content-addressed key**: `repertoire/<orgId>/<sha256>.pdf`.
  Identical files (the ~64 cross-folder duplicates) share one key, so they upload
  once — free dedupe.
- **Idempotent / resumable:** an object that already exists with the right size is
  skipped, so re-running after an interruption only uploads what is missing.
- **Streams** each PDF straight from disk to R2 (no base64, no full-file string
  reads, no re-encoding). Content-Length is set from the indexed size.
- **Verifies** every upload: local size must match the index, the HEAD after PUT
  must report the same size, and the first 1 KB is re-fetched and byte-compared to
  disk. With `--verify-hash` the whole file is re-hashed and checked against its
  sha256 (and therefore its key) before upload.
- Logs progress every 50 files and prints a final report (uploaded / skipped /
  failed + total bytes). A machine-readable copy is written to
  `scripts/repertoire-out/upload-report.json`.

**It uploads only.** Writing DB rows is Phase A2, after the decision review.

#### Options

| flag                 | effect                                                         |
| -------------------- | ------------------------------------------------------------- |
| `--index <path>`     | index file (default `scripts/repertoire-out/index.json`, or env `REPERTOIRE_INDEX`) |
| `--org <uuid>`       | org id (default env `PODIUM_ORG_ID`)                          |
| `--concurrency <n>`  | parallel uploads (default 4)                                  |
| `--limit <n>`        | upload at most n files — good for a smoke test               |
| `--verify-hash`      | re-hash every local file and assert it matches its sha256     |
| `--no-range-check`   | skip the first-1 KB re-GET comparison                        |
| `--no-create-bucket` | do not try to create the bucket if it is missing            |
| `--dry-run`          | report what would happen; HEADs only, no PUTs               |

Recommended first real run: `node scripts/repertoire-upload.js --limit 20 --verify-hash`
to prove the pipeline on a small batch, then the full run without `--limit`.

If the R2 credentials are absent, the uploader prints a friendly message and exits
0 — nothing is uploaded. This is the expected state until the keys are in place.

---

## One-time Cloudflare setup (David)

1. **Create an R2 bucket.** Cloudflare dashboard → **R2** → **Create bucket**.
   Name it **`podium-repertoire`** (the default; override with `R2_BUCKET` if you
   pick another name). Region: Automatic is fine. The uploader will also create the
   bucket on first run if it is missing, but creating it in the dashboard is clearer.

2. **Create an S3 API token.** R2 → **Manage R2 API Tokens** → **Create API token**.
   - Permission: **Object Read & Write** (Admin Read & Write if you want the script
     to be able to create the bucket).
   - Scope it to the `podium-repertoire` bucket.
   - On the confirmation screen Cloudflare shows three values — copy all three.

3. **Put the credentials in `.env.local`** (never committed — `.env.local` is
   git-ignored):

   ```
   R2_ACCOUNT_ID=<your Cloudflare account id>
   R2_ACCESS_KEY_ID=<Access Key ID from the token>
   R2_SECRET_ACCESS_KEY=<Secret Access Key from the token>
   # optional, defaults to podium-repertoire:
   R2_BUCKET=podium-repertoire

   # which org these files belong to:
   PODIUM_ORG_ID=<org uuid>
   ```

   The endpoint is derived automatically:
   `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`.

4. **Verify** with a dry run:

   ```
   node scripts/repertoire-upload.js --dry-run
   ```

   It should print the endpoint + bucket and the count of confident files it would
   upload, without transferring anything.

---

## Where things live

| path                                   | what                                              |
| -------------------------------------- | ------------------------------------------------- |
| `src/lib/storage/r2.ts`                | typed R2 adapter (put/head/get/getSignedUrl/delete/createBucket) — used by scripts **and** API routes |
| `scripts/repertoire-upload.js`         | the uploader (this runbook, step 3)               |
| `scripts/repertoire-out/index.json`    | indexer output (git-ignored)                      |
| `scripts/repertoire-out/upload-report.json` | last upload run's report (git-ignored)       |

## Notes / gotchas

- **Fidelity:** the PDFs are never modified. The key is the file's own sha256, so
  the stored object is provably the exact bytes that were indexed.
- **Dedupe** happens twice: within the index (same sha appears in two folders → one
  upload) and against R2 (already-present objects are skipped).
- The uploader talks to R2 over `fetch` + SigV4 via the tiny **`aws4fetch`** package
  (no `@aws-sdk/*`). Node's native TypeScript type-stripping (Node ≥ 22) lets the
  plain-CJS script `require()` the `.ts` adapter directly — no build step.
- On Windows the script exits via `process.exitCode` (not `process.exit()`), so give
  it a moment to drain after the final report line.
