/**
 * Repertoire uploader — pushes the indexed sheet-music PDFs to Cloudflare R2.
 *
 * Reads the indexer output (scripts/repertoire-out/index.json), uploads every
 * file whose classification === "confident" to R2 under a CONTENT-ADDRESSED key:
 *
 *     repertoire/<orgId>/<sha256>.pdf
 *
 * Content-addressing gives free dedupe (the ~64 duplicate PDFs collapse to one
 * object) and makes the whole run idempotent/resumable: an object that already
 * exists with the right size is skipped.
 *
 * FIDELITY: PDF bytes are streamed straight from disk to R2 (fs.createReadStream
 * -> web ReadableStream). No base64, no full-file string reads, no re-encoding.
 * Each upload is verified: local size must match the index, HEAD-after-put must
 * report the same size, and a first-1KB re-GET is byte-compared to disk. With
 * --verify-hash the whole file is re-hashed and checked against its sha256 (and
 * therefore its key) before upload.
 *
 * This script UPLOADS ONLY. It writes no database rows — DB import is Phase A2,
 * after David reviews the decision batches.
 *
 * Usage:
 *   PODIUM_ORG_ID=<uuid> node scripts/repertoire-upload.js [options]
 *
 * Options:
 *   --index <path>       Index JSON (default scripts/repertoire-out/index.json,
 *                        or env REPERTOIRE_INDEX).
 *   --org <uuid>         Org id (default env PODIUM_ORG_ID).
 *   --concurrency <n>    Parallel uploads (default 4).
 *   --limit <n>          Upload at most n files (smoke test).
 *   --verify-hash        Re-hash each local file and assert it matches its sha256.
 *   --no-range-check     Skip the first-1KB re-GET byte comparison.
 *   --no-create-bucket   Do not attempt to create the bucket if missing.
 *   --dry-run            Report what would happen; contact R2 for HEADs only, no PUTs.
 *
 * Credentials: reads R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY
 * (and optional R2_BUCKET) from .env.local. If they are absent the script exits
 * cleanly with a friendly message — everything else is testable without them.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { Readable } = require('stream')

const ROOT = path.join(__dirname, '..')
const DEFAULT_INDEX = path.join(ROOT, 'scripts', 'repertoire-out', 'index.json')
const REPORT_PATH = path.join(ROOT, 'scripts', 'repertoire-out', 'upload-report.json')

// Single source of truth for the R2 API — the same typed adapter API routes use.
// Node (>=22) strips the TypeScript at require time; no build step needed.
const { getR2Client, isR2Configured, R2_ENV_VARS } = require(
  path.join(ROOT, 'src', 'lib', 'storage', 'r2.ts'),
)

// ---------------------------------------------------------------------------
// env + args
// ---------------------------------------------------------------------------

/** Load .env.local into process.env without clobbering already-set vars. */
function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local')
  if (!fs.existsSync(file)) return
  const text = fs.readFileSync(file, 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

function parseArgs(argv) {
  const opts = {
    index: process.env.REPERTOIRE_INDEX || DEFAULT_INDEX,
    org: process.env.PODIUM_ORG_ID || '',
    concurrency: 4,
    limit: Infinity,
    verifyHash: false,
    rangeCheck: true,
    createBucket: true,
    dryRun: false,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '--index': opts.index = argv[++i]; break
      case '--org': opts.org = argv[++i]; break
      case '--concurrency': opts.concurrency = Math.max(1, parseInt(argv[++i], 10) || 4); break
      case '--limit': opts.limit = Math.max(0, parseInt(argv[++i], 10) || 0); break
      case '--verify-hash': opts.verifyHash = true; break
      case '--no-range-check': opts.rangeCheck = false; break
      case '--no-create-bucket': opts.createBucket = false; break
      case '--dry-run': opts.dryRun = true; break
      case '--help': case '-h': printHelpAndExit(); break
      default:
        console.error(`Unknown option: ${a}`)
        printHelpAndExit(1)
    }
  }
  return opts
}

function printHelpAndExit(code = 0) {
  console.log(
    'Usage: PODIUM_ORG_ID=<uuid> node scripts/repertoire-upload.js\n' +
      '  [--index <path>] [--org <uuid>] [--concurrency <n>] [--limit <n>]\n' +
      '  [--verify-hash] [--no-range-check] [--no-create-bucket] [--dry-run]',
  )
  throw new ExitSignal(code)
}

// ---------------------------------------------------------------------------
// index helpers
// ---------------------------------------------------------------------------

/** Normalize one index entry to the fields the uploader needs. */
function normalizeEntry(raw, libraryRoot) {
  let filePath = raw.absPath || raw.path || raw.filePath
  // Indexer writes library-relative relPath + a libraryRoot in the index meta.
  if (!filePath && raw.relPath && libraryRoot) filePath = path.join(libraryRoot, raw.relPath)
  const size = raw.size != null ? raw.size : raw.bytes
  return {
    filePath,
    sha256: raw.sha256,
    size: typeof size === 'number' ? size : Number(size),
    contentType: raw.contentType || 'application/pdf',
    originalFilename: raw.originalFilename || (filePath ? path.basename(filePath) : '(unknown)'),
    classification: raw.classification,
  }
}

function loadConfidentEntries(indexPath) {
  if (!fs.existsSync(indexPath)) {
    throw new UserError(
      `Index not found: ${indexPath}\n` +
        `Run the repertoire indexer first (it writes scripts/repertoire-out/index.json), ` +
        `or pass --index <path>.`,
    )
  }
  let data
  try {
    data = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
  } catch (e) {
    throw new UserError(`Index is not valid JSON (${indexPath}): ${e.message}`)
  }
  const files = Array.isArray(data) ? data : data.files
  const libraryRoot = Array.isArray(data) ? null : data.libraryRoot || null
  if (!Array.isArray(files)) {
    throw new UserError(`Index has no "files" array (${indexPath}).`)
  }
  const confident = []
  for (const raw of files) {
    const wanted = new Set((process.env.UPLOAD_CLASSIFICATIONS || 'confident').split(','))
    if (raw && wanted.has(raw.classification)) confident.push(normalizeEntry(raw, libraryRoot))
  }
  return confident
}

/** Validate an entry has everything we need to upload it. Returns error string or null. */
function validateEntry(e) {
  if (!e.filePath) return 'missing file path (absPath)'
  if (!e.sha256 || !/^[0-9a-f]{64}$/i.test(e.sha256)) return `invalid sha256 "${e.sha256}"`
  if (!Number.isFinite(e.size) || e.size < 0) return `invalid size "${e.size}"`
  return null
}

// ---------------------------------------------------------------------------
// hashing / verification
// ---------------------------------------------------------------------------

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function md5File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5')
    const stream = fs.createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function readFirstBytes(filePath, length) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let got = 0
    const stream = fs.createReadStream(filePath, { start: 0, end: Math.max(0, length - 1) })
    stream.on('error', reject)
    stream.on('data', (chunk) => {
      chunks.push(chunk)
      got += chunk.length
    })
    stream.on('end', () => resolve(Buffer.concat(chunks, got)))
  })
}

// ---------------------------------------------------------------------------
// upload
// ---------------------------------------------------------------------------

const RANGE_CHECK_BYTES = 1024

async function uploadOne(client, entry, opts, key) {
  // Local file must exist and match the recorded size (stale-index guard).
  let stat
  try {
    stat = fs.statSync(entry.filePath)
  } catch {
    return { status: 'failed', reason: `local file missing: ${entry.filePath}` }
  }
  if (stat.size !== entry.size) {
    return {
      status: 'failed',
      reason: `local size ${stat.size} != index size ${entry.size} (stale index): ${entry.filePath}`,
    }
  }

  // Idempotent skip: object already present with matching size.
  const existing = await client.headObject(key)
  if (existing && existing.size === entry.size) {
    return { status: 'skipped', bytes: entry.size }
  }

  // Optional full-file integrity check against the content-addressed key.
  if (opts.verifyHash) {
    const actual = await sha256File(entry.filePath)
    if (actual.toLowerCase() !== entry.sha256.toLowerCase()) {
      return {
        status: 'failed',
        reason: `sha256 mismatch: file is ${actual}, index/key says ${entry.sha256}`,
      }
    }
  }

  if (opts.dryRun) {
    return { status: 'would-upload', bytes: entry.size }
  }

  // Stream bytes straight from disk. Node Readable -> web ReadableStream so
  // undici/aws4fetch sends it with duplex:'half'. Content-Length is set from the
  // known size, so R2 gets a length instead of chunked transfer.
  const nodeStream = fs.createReadStream(entry.filePath)
  const webStream = Readable.toWeb(nodeStream)
  await client.putObject(key, webStream, entry.contentType, { contentLength: entry.size })

  // FULL transit-integrity proof (review finding F1): for a single-part S3 PUT,
  // the object's ETag is the MD5 of the stored bytes. Compare it to the local
  // file's MD5 so a corrupted transfer can't pass on size alone.
  const head = await client.headObject(key)
  const etag = head && head.etag ? String(head.etag).replace(/"/g, '').toLowerCase() : null
  if (etag && !etag.includes('-')) {
    const localMd5 = await md5File(entry.filePath)
    if (etag !== localMd5) {
      await client.deleteObject(key).catch(() => {})
      return {
        status: 'failed',
        reason: `etag/md5 mismatch after upload (remote ${etag} != local ${localMd5}) — object deleted, will retry on re-run`,
      }
    }
  }

  // First-1KB re-GET byte comparison (cheap tamper/corruption spot-check).
  if (opts.rangeCheck && entry.size > 0) {
    const want = await readFirstBytes(entry.filePath, RANGE_CHECK_BYTES)
    const got = Buffer.from(await client.getRange(key, want.length))
    if (!want.equals(got)) {
      return {
        status: 'failed',
        reason: `range-check mismatch on first ${want.length} bytes after upload`,
      }
    }
  }

  return { status: 'uploaded', bytes: entry.size }
}

/** Simple fixed-size worker pool. */
async function runPool(items, concurrency, worker) {
  let next = 0
  const workers = []
  for (let w = 0; w < Math.min(concurrency, items.length); w++) {
    workers.push(
      (async () => {
        while (true) {
          const i = next++
          if (i >= items.length) return
          await worker(items[i], i)
        }
      })(),
    )
  }
  await Promise.all(workers)
}

class UserError extends Error {}

/** Thrown to unwind to a clean exit with a specific code (e.g. --help). */
class ExitSignal extends Error {
  constructor(code) {
    super('exit')
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  loadEnvLocal()
  const opts = parseArgs(process.argv)

  // Friendly, expected pre-credentials exit.
  if (!isR2Configured(process.env)) {
    console.log(
      `\nR2 credentials not found — nothing uploaded.\n` +
        `This is expected until the Cloudflare keys land. Add these to .env.local:\n` +
        R2_ENV_VARS.map((v) => `  ${v}=...`).join('\n') +
        `\n  (optional) R2_BUCKET=podium-repertoire\n`,
    )
    return 0
  }

  if (!opts.org) {
    throw new UserError(
      'No org id. Set PODIUM_ORG_ID=<uuid> in .env.local or pass --org <uuid>.',
    )
  }

  const entries = loadConfidentEntries(opts.index)
  console.log(`Loaded ${entries.length} confident file(s) from ${opts.index}`)

  // Split out entries we cannot upload (bad/missing metadata) up front.
  const uploadable = []
  const preFailed = []
  const seenKeys = new Set()
  let dedupedInIndex = 0
  for (const e of entries) {
    const err = validateEntry(e)
    if (err) {
      preFailed.push({ entry: e, reason: err })
      continue
    }
    const key = `repertoire/${opts.org}/${e.sha256.toLowerCase()}.pdf`
    if (seenKeys.has(key)) {
      // Duplicate sha within the index: content-addressing means one upload.
      dedupedInIndex++
      continue
    }
    seenKeys.add(key)
    uploadable.push({ entry: e, key })
  }
  if (dedupedInIndex > 0) {
    console.log(`Collapsed ${dedupedInIndex} in-index duplicate(s) by sha256.`)
  }

  const client = getR2Client(process.env)
  console.log(
    `R2 endpoint ${client.config.endpoint} bucket "${client.config.bucket}"` +
      (opts.dryRun ? '  [DRY RUN]' : ''),
  )

  if (opts.createBucket && !opts.dryRun) {
    try {
      const { created } = await client.createBucketIfMissing()
      console.log(created ? `Created bucket "${client.config.bucket}".` : `Bucket "${client.config.bucket}" ready.`)
    } catch (e) {
      console.warn(`Warning: could not ensure bucket exists (${e.message}). Continuing.`)
    }
  }

  const queue = uploadable.slice(0, opts.limit)
  console.log(
    `Uploading up to ${queue.length} object(s), concurrency ${opts.concurrency}` +
      `${opts.verifyHash ? ', re-hash verify ON' : ''}` +
      `${opts.rangeCheck ? '' : ', range-check OFF'}...`,
  )

  const stats = { uploaded: 0, skipped: 0, wouldUpload: 0, failed: 0, bytesUploaded: 0 }
  const failures = preFailed.map((f) => ({
    file: f.entry.originalFilename,
    path: f.entry.filePath,
    reason: f.reason,
  }))
  stats.failed += preFailed.length
  let processed = 0

  await runPool(queue, opts.concurrency, async ({ entry, key }) => {
    let result
    try {
      result = await uploadOne(client, entry, opts, key)
    } catch (e) {
      result = { status: 'failed', reason: e.message }
    }
    switch (result.status) {
      case 'uploaded': stats.uploaded++; stats.bytesUploaded += result.bytes || 0; break
      case 'skipped': stats.skipped++; break
      case 'would-upload': stats.wouldUpload++; break
      default:
        stats.failed++
        failures.push({ file: entry.originalFilename, path: entry.filePath, reason: result.reason })
        console.error(`  FAIL ${entry.originalFilename}: ${result.reason}`)
    }
    processed++
    if (processed % 50 === 0) {
      console.log(
        `  ...${processed}/${queue.length}  ` +
          `up:${stats.uploaded} skip:${stats.skipped} fail:${stats.failed}` +
          `${opts.dryRun ? ` would:${stats.wouldUpload}` : ''}`,
      )
    }
  })

  const report = {
    generatedAt: new Date().toISOString(),
    index: opts.index,
    org: opts.org,
    bucket: client.config.bucket,
    dryRun: opts.dryRun,
    confidentInIndex: entries.length,
    dedupedInIndex,
    attempted: queue.length,
    ...stats,
    failures,
  }
  try {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2))
  } catch { /* report file is best-effort */ }

  console.log('\n=== Repertoire upload report ===')
  console.log(`  confident in index : ${entries.length}`)
  console.log(`  in-index dupes     : ${dedupedInIndex}`)
  console.log(`  attempted          : ${queue.length}`)
  if (opts.dryRun) console.log(`  would upload       : ${stats.wouldUpload}`)
  console.log(`  uploaded           : ${stats.uploaded}`)
  console.log(`  skipped (existing) : ${stats.skipped}`)
  console.log(`  failed             : ${stats.failed}`)
  console.log(`  bytes uploaded     : ${stats.bytesUploaded.toLocaleString()} (${(stats.bytesUploaded / 1e6).toFixed(1)} MB)`)
  console.log(`  report written     : ${REPORT_PATH}`)

  return stats.failed > 0 ? 1 : 0
}

// Use process.exitCode + natural drain rather than process.exit(): on Windows,
// forcing exit while undici keep-alive sockets are still closing trips a libuv
// assertion (async.c). Letting the loop drain avoids it and still flushes output.
main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((e) => {
    if (e instanceof ExitSignal) {
      process.exitCode = e.code
      return
    }
    if (e instanceof UserError) {
      console.error(`\n${e.message}`)
    } else {
      console.error('\nUnexpected error:', e)
    }
    process.exitCode = 1
  })
