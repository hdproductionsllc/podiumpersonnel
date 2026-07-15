/**
 * Cloudflare R2 storage adapter (S3-compatible, SigV4 via aws4fetch).
 *
 * Minimal, typed, and dependency-light: used by both the repertoire upload
 * script (scripts/repertoire-upload.js, plain Node CJS — Node >=22 strips the
 * types at require time) and, later, API routes.
 *
 * Fidelity rules this module upholds:
 *  - Binary bodies only. No base64, no string coercion, no re-encoding. A body
 *    may be a Uint8Array/Buffer OR a stream (web ReadableStream or Node Readable);
 *    streams are sent through untouched (aws4fetch signs S3 with UNSIGNED-PAYLOAD
 *    and adds duplex:'half' automatically), so bytes reach R2 identical.
 *  - putObject verifies the write with a HEAD (and an optional size assertion)
 *    before returning.
 *
 * Written in erasable TypeScript (interfaces + plain functions/classes, no enums,
 * namespaces or parameter-properties) so Node's native type-stripping can load it
 * from a CommonJS script without a build step.
 */
import { AwsClient } from 'aws4fetch'

export const DEFAULT_BUCKET = 'podium-repertoire'

/** Env var names this adapter reads. Exported for friendly error messages. */
export const R2_ENV_VARS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
] as const

export interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  /** Bucket name (env R2_BUCKET overrides; defaults to podium-repertoire). */
  bucket: string
  /** https://<accountId>.r2.cloudflarestorage.com */
  endpoint: string
}

export interface HeadResult {
  key: string
  /** Object size in bytes (Content-Length). */
  size: number
  etag: string | null
  contentType: string | null
}

export interface PutOptions {
  /**
   * Byte length of the body. REQUIRED when body is a stream (so R2 gets a
   * Content-Length instead of chunked transfer). Also enables the post-put
   * size assertion for buffered bodies.
   */
  contentLength?: number
  /** Skip the HEAD-after-put verification. Default false (verification on). */
  skipVerify?: boolean
}

export type R2Body = Uint8Array | ArrayBuffer | ReadableStream | NodeReadableLike | string

/** Structural match for a Node stream.Readable without importing node types here. */
export interface NodeReadableLike {
  pipe: unknown
  on: unknown
  read: unknown
}

/** Thrown when required R2 environment variables are absent. Message is user-facing. */
export class R2ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'R2ConfigError'
  }
}

type EnvLike = Record<string, string | undefined>

/** True when all required R2 credentials are present. Never throws. */
export function isR2Configured(env: EnvLike = process.env): boolean {
  return R2_ENV_VARS.every((k) => {
    const v = env[k]
    return typeof v === 'string' && v.trim().length > 0
  })
}

/**
 * Read + validate R2 config from the environment.
 * Throws R2ConfigError (with a friendly, actionable message) when creds are missing.
 */
export function readR2Config(env: EnvLike = process.env): R2Config {
  const missing = R2_ENV_VARS.filter((k) => {
    const v = env[k]
    return !(typeof v === 'string' && v.trim().length > 0)
  })
  if (missing.length > 0) {
    throw new R2ConfigError(
      `R2 is not configured — missing ${missing.join(', ')}. ` +
        `Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY to .env.local ` +
        `(from the Cloudflare dashboard: R2 → Manage R2 API Tokens). ` +
        `Optionally set R2_BUCKET (defaults to "${DEFAULT_BUCKET}").`,
    )
  }
  const accountId = env.R2_ACCOUNT_ID!.trim()
  return {
    accountId,
    accessKeyId: env.R2_ACCESS_KEY_ID!.trim(),
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!.trim(),
    bucket: (env.R2_BUCKET && env.R2_BUCKET.trim()) || DEFAULT_BUCKET,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  }
}

/** Encode an object key for use in a URL path, preserving "/" separators. */
function encodeKey(key: string): string {
  return key
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

function isBufferLike(body: R2Body): boolean {
  return (
    typeof body === 'string' ||
    body instanceof Uint8Array ||
    body instanceof ArrayBuffer
  )
}

export interface R2Client {
  config: R2Config
  /** Full URL for an object key (path-style). */
  objectUrl(key: string): string
  /** PUT bytes/stream, then verify with HEAD (unless opts.skipVerify). */
  putObject(key: string, body: R2Body, contentType: string, opts?: PutOptions): Promise<HeadResult>
  /** HEAD an object. Returns null when it does not exist (404). */
  headObject(key: string): Promise<HeadResult | null>
  /** GET the first `length` bytes of an object (Range request). */
  getRange(key: string, length: number): Promise<Uint8Array>
  /** Presigned GET URL valid for `expiresSeconds`. */
  getSignedUrl(key: string, expiresSeconds: number): Promise<string>
  /** Presigned PUT URL valid for `expiresSeconds` (browser-direct upload). */
  getSignedPutUrl(key: string, expiresSeconds: number): Promise<string>
  /** DELETE an object (idempotent — a missing object is not an error). */
  deleteObject(key: string): Promise<void>
  /** Create the bucket if it does not already exist. Returns whether it was created. */
  createBucketIfMissing(): Promise<{ created: boolean }>
}

/**
 * Build an R2 client from the environment.
 * Throws R2ConfigError when credentials are missing — call isR2Configured() first
 * if you want to branch without catching.
 */
export function getR2Client(env: EnvLike = process.env): R2Client {
  const config = readR2Config(env)
  return makeR2Client(config)
}

/** Build an R2 client from an explicit config (handy for tests). */
export function makeR2Client(config: R2Config): R2Client {
  const aws = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
  })

  const bucketUrl = `${config.endpoint}/${encodeURIComponent(config.bucket)}`
  const objectUrl = (key: string): string => `${bucketUrl}/${encodeKey(key)}`

  async function headObject(key: string): Promise<HeadResult | null> {
    const res = await aws.fetch(objectUrl(key), { method: 'HEAD' })
    if (res.status === 404) return null
    if (!res.ok) {
      throw new Error(`R2 HEAD ${key} failed: ${res.status} ${res.statusText}`)
    }
    const len = res.headers.get('content-length')
    return {
      key,
      size: len != null ? Number(len) : NaN,
      etag: res.headers.get('etag'),
      contentType: res.headers.get('content-type'),
    }
  }

  async function putObject(
    key: string,
    body: R2Body,
    contentType: string,
    opts: PutOptions = {},
  ): Promise<HeadResult> {
    const buffered = isBufferLike(body)
    if (!buffered && opts.contentLength == null) {
      throw new Error(
        `putObject(${key}): a stream body requires opts.contentLength so R2 gets a Content-Length.`,
      )
    }
    const headers: Record<string, string> = { 'content-type': contentType }
    if (opts.contentLength != null) {
      headers['content-length'] = String(opts.contentLength)
    }
    // aws4fetch: URL input (not a Request) => body is passed through untouched,
    // S3 gets x-amz-content-sha256: UNSIGNED-PAYLOAD, and duplex:'half' is added
    // automatically for stream bodies. No buffering, no base64.
    const res = await aws.fetch(objectUrl(key), {
      method: 'PUT',
      body: body as BodyInit,
      headers,
    })
    if (!res.ok) {
      const detail = await safeText(res)
      throw new Error(`R2 PUT ${key} failed: ${res.status} ${res.statusText}${detail}`)
    }

    if (opts.skipVerify) {
      return {
        key,
        size: opts.contentLength ?? NaN,
        etag: res.headers.get('etag'),
        contentType,
      }
    }

    const head = await headObject(key)
    if (!head) {
      throw new Error(`R2 PUT ${key} verify failed: object not found on HEAD after put`)
    }
    if (opts.contentLength != null && Number.isFinite(head.size) && head.size !== opts.contentLength) {
      throw new Error(
        `R2 PUT ${key} verify failed: expected ${opts.contentLength} bytes, HEAD reports ${head.size}`,
      )
    }
    return head
  }

  async function getRange(key: string, length: number): Promise<Uint8Array> {
    const res = await aws.fetch(objectUrl(key), {
      method: 'GET',
      headers: { range: `bytes=0-${Math.max(0, length - 1)}` },
    })
    if (!res.ok && res.status !== 206) {
      throw new Error(`R2 GET(range) ${key} failed: ${res.status} ${res.statusText}`)
    }
    return new Uint8Array(await res.arrayBuffer())
  }

  async function getSignedUrl(key: string, expiresSeconds: number): Promise<string> {
    const url = `${objectUrl(key)}?X-Amz-Expires=${encodeURIComponent(String(expiresSeconds))}`
    const signed = await aws.sign(url, {
      method: 'GET',
      aws: { signQuery: true },
    })
    return signed.url
  }

  async function getSignedPutUrl(key: string, expiresSeconds: number): Promise<string> {
    // Browser-direct upload: bytes go straight to R2, never through a serverless
    // route (the 4.5MB Vercel body cap lesson). Signed query, UNSIGNED-PAYLOAD.
    const url = `${objectUrl(key)}?X-Amz-Expires=${encodeURIComponent(String(expiresSeconds))}`
    const signed = await aws.sign(url, {
      method: 'PUT',
      aws: { signQuery: true },
    })
    return signed.url
  }

  async function deleteObject(key: string): Promise<void> {
    const res = await aws.fetch(objectUrl(key), { method: 'DELETE' })
    // S3/R2 return 204 on delete; 404 is fine (idempotent).
    if (!res.ok && res.status !== 404) {
      throw new Error(`R2 DELETE ${key} failed: ${res.status} ${res.statusText}`)
    }
  }

  async function createBucketIfMissing(): Promise<{ created: boolean }> {
    const head = await aws.fetch(bucketUrl, { method: 'HEAD' })
    if (head.ok) return { created: false }
    if (head.status !== 404) {
      throw new Error(`R2 HEAD bucket "${config.bucket}" failed: ${head.status} ${head.statusText}`)
    }
    const put = await aws.fetch(bucketUrl, { method: 'PUT' })
    if (!put.ok) {
      const detail = await safeText(put)
      throw new Error(`R2 CreateBucket "${config.bucket}" failed: ${put.status} ${put.statusText}${detail}`)
    }
    return { created: true }
  }

  return {
    config,
    objectUrl,
    putObject,
    headObject,
    getRange,
    getSignedUrl,
    getSignedPutUrl,
    deleteObject,
    createBucketIfMissing,
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    const t = await res.text()
    return t ? ` — ${t.slice(0, 500)}` : ''
  } catch {
    return ''
  }
}
