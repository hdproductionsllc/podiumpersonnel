import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  isR2Configured,
  readR2Config,
  R2ConfigError,
  makeR2Client,
  getR2Client,
  DEFAULT_BUCKET,
  type R2Config,
} from '@/lib/storage/r2'

const CONFIG: R2Config = {
  accountId: 'acct123',
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'super-secret-key-value',
  bucket: 'podium-repertoire',
  endpoint: 'https://acct123.r2.cloudflarestorage.com',
}

afterEach(() => {
  vi.restoreAllMocks()
})

/** Stub global fetch with a router keyed by method. Returns the captured requests. */
function stubFetch(handler: (req: Request) => Response | Promise<Response>) {
  const calls: Request[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: Request) => {
    calls.push(input)
    return handler(input)
  }))
  return calls
}

describe('R2 config', () => {
  it('isR2Configured is false when creds missing, true when present', () => {
    expect(isR2Configured({})).toBe(false)
    expect(isR2Configured({ R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'b' })).toBe(false)
    expect(
      isR2Configured({ R2_ACCOUNT_ID: 'a', R2_ACCESS_KEY_ID: 'b', R2_SECRET_ACCESS_KEY: 'c' }),
    ).toBe(true)
    // whitespace-only does not count
    expect(
      isR2Configured({ R2_ACCOUNT_ID: '  ', R2_ACCESS_KEY_ID: 'b', R2_SECRET_ACCESS_KEY: 'c' }),
    ).toBe(false)
  })

  it('readR2Config throws a friendly R2ConfigError naming the missing vars', () => {
    try {
      readR2Config({ R2_ACCOUNT_ID: 'a' })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(R2ConfigError)
      // the "missing …" list names only the absent vars, not the present account id
      expect((e as Error).message).toContain('missing R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.')
    }
  })

  it('builds the endpoint from the account id and defaults the bucket', () => {
    const cfg = readR2Config({
      R2_ACCOUNT_ID: 'xyz',
      R2_ACCESS_KEY_ID: 'k',
      R2_SECRET_ACCESS_KEY: 's',
    })
    expect(cfg.endpoint).toBe('https://xyz.r2.cloudflarestorage.com')
    expect(cfg.bucket).toBe(DEFAULT_BUCKET)
  })

  it('honors R2_BUCKET override', () => {
    const cfg = readR2Config({
      R2_ACCOUNT_ID: 'xyz',
      R2_ACCESS_KEY_ID: 'k',
      R2_SECRET_ACCESS_KEY: 's',
      R2_BUCKET: 'other-bucket',
    })
    expect(cfg.bucket).toBe('other-bucket')
  })

  it('getR2Client throws when unconfigured', () => {
    expect(() => getR2Client({})).toThrow(R2ConfigError)
  })
})

describe('R2 client — URL + key building', () => {
  it('builds path-style object URLs and encodes key segments (keeping slashes)', () => {
    const c = makeR2Client(CONFIG)
    expect(c.objectUrl('repertoire/org-1/abc.pdf')).toBe(
      'https://acct123.r2.cloudflarestorage.com/podium-repertoire/repertoire/org-1/abc.pdf',
    )
    // a space in a segment is percent-encoded, the separators survive
    expect(c.objectUrl('a/b c/d')).toBe(
      'https://acct123.r2.cloudflarestorage.com/podium-repertoire/a/b%20c/d',
    )
  })
})

describe('R2 client — presigned GET', () => {
  it('produces a query-signed URL with expiry and no secret leaked', async () => {
    const c = makeR2Client(CONFIG)
    const url = await c.getSignedUrl('repertoire/org-1/abc.pdf', 3600)
    expect(url).toContain('X-Amz-Signature=')
    expect(url).toContain('X-Amz-Expires=3600')
    expect(url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256')
    expect(url).toContain(`X-Amz-Credential=${CONFIG.accessKeyId}`)
    expect(url).toContain('%2Fauto%2Fs3%2Faws4_request')
    // the secret must never appear in a presigned URL
    expect(url).not.toContain(CONFIG.secretAccessKey)
  })
})

describe('R2 client — putObject', () => {
  it('rejects a stream body without a contentLength', async () => {
    const c = makeR2Client(CONFIG)
    const stream = new ReadableStream()
    await expect(c.putObject('k', stream, 'application/pdf')).rejects.toThrow(/contentLength/)
  })

  it('PUTs bytes with UNSIGNED-PAYLOAD then verifies via HEAD', async () => {
    const c = makeR2Client(CONFIG)
    const calls = stubFetch((req) => {
      if (req.method === 'PUT') return new Response(null, { status: 200, headers: { etag: '"e"' } })
      if (req.method === 'HEAD') {
        return new Response(null, { status: 200, headers: { 'content-length': '5', etag: '"e"' } })
      }
      return new Response(null, { status: 500 })
    })
    const body = new Uint8Array([1, 2, 3, 4, 5])
    const head = await c.putObject('repertoire/o/x.pdf', body, 'application/pdf', {
      contentLength: 5,
    })
    expect(head.size).toBe(5)
    const put = calls.find((r) => r.method === 'PUT')!
    expect(put.headers.get('x-amz-content-sha256')).toBe('UNSIGNED-PAYLOAD')
    expect(put.headers.get('content-type')).toBe('application/pdf')
    expect(put.headers.get('authorization')).toContain('AWS4-HMAC-SHA256')
    // both PUT and the verifying HEAD happened
    expect(calls.map((r) => r.method).sort()).toEqual(['HEAD', 'PUT'])
  })

  it('throws when HEAD-after-put reports a different size', async () => {
    const c = makeR2Client(CONFIG)
    stubFetch((req) => {
      if (req.method === 'PUT') return new Response(null, { status: 200 })
      return new Response(null, { status: 200, headers: { 'content-length': '99' } })
    })
    await expect(
      c.putObject('k', new Uint8Array([1, 2, 3]), 'application/pdf', { contentLength: 3 }),
    ).rejects.toThrow(/verify failed/)
  })

  it('throws with body detail on a non-ok PUT', async () => {
    const c = makeR2Client(CONFIG)
    stubFetch(() => new Response('AccessDenied', { status: 403 }))
    await expect(
      c.putObject('k', new Uint8Array([1]), 'application/pdf', { contentLength: 1 }),
    ).rejects.toThrow(/403.*AccessDenied/)
  })
})

describe('R2 client — head/get/delete/bucket', () => {
  it('headObject returns null on 404 and parses size on 200', async () => {
    const c = makeR2Client(CONFIG)
    stubFetch(() => new Response(null, { status: 404 }))
    expect(await c.headObject('missing')).toBeNull()

    stubFetch(() => new Response(null, { status: 200, headers: { 'content-length': '42', etag: '"z"' } }))
    const h = await c.headObject('present')
    expect(h).not.toBeNull()
    expect(h!.size).toBe(42)
    expect(h!.etag).toBe('"z"')
  })

  it('getRange sends a Range header and returns the bytes', async () => {
    const c = makeR2Client(CONFIG)
    const calls = stubFetch(() => new Response(new Uint8Array([9, 8, 7]), { status: 206 }))
    const bytes = await c.getRange('k', 3)
    expect(Array.from(bytes)).toEqual([9, 8, 7])
    expect(calls[0].headers.get('range')).toBe('bytes=0-2')
  })

  it('deleteObject tolerates a 404 (idempotent)', async () => {
    const c = makeR2Client(CONFIG)
    stubFetch(() => new Response(null, { status: 404 }))
    await expect(c.deleteObject('gone')).resolves.toBeUndefined()
  })

  it('createBucketIfMissing PUTs when the bucket is absent, no-ops when present', async () => {
    const c = makeR2Client(CONFIG)

    const calls404 = stubFetch((req) => {
      if (req.method === 'HEAD') return new Response(null, { status: 404 })
      return new Response(null, { status: 200 }) // PUT create
    })
    expect(await c.createBucketIfMissing()).toEqual({ created: true })
    expect(calls404.map((r) => r.method)).toEqual(['HEAD', 'PUT'])

    stubFetch(() => new Response(null, { status: 200 })) // HEAD ok
    expect(await c.createBucketIfMissing()).toEqual({ created: false })
  })
})
