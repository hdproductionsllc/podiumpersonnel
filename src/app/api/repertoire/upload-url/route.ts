/**
 * POST /api/repertoire/upload-url — mint a presigned R2 PUT URL for one part PDF.
 *
 * The browser hashes the file (sha256) FIRST, then asks for an upload URL. The
 * object key is content-addressed — repertoire/<orgId>/<sha256>.pdf — exactly
 * the Phase A importer's scheme, so uploads are idempotent (same bytes → same
 * key) and the hash is baked into the address. If the object already exists
 * with the right size, no upload is needed at all.
 *
 * Bytes go browser → R2 directly (presigned PUT); they never pass through a
 * serverless route (the 4.5MB Vercel body cap lesson from project files).
 *
 * Security: org from the admin's membership; the key prefix is derived
 * server-side from that org — the client never chooses where bytes land.
 */

import { requireIntakeEnabled, apiError, apiSuccess, serverError } from '@/lib/api-helpers'
import { getR2Client, isR2Configured } from '@/lib/storage/r2'

const MAX_PDF_BYTES = 100 * 1024 * 1024 // 100MB — far above any real part/score
const UPLOAD_URL_TTL_SECONDS = 600

export async function POST(request: Request) {
  const { membership, libraryOrgId, error } = await requireIntakeEnabled()
  if (error || !membership || !libraryOrgId) return error ?? apiError('Not found', 404)
  // Part bytes are content-addressed under the LIBRARY org's prefix
  // (repertoire/<libraryOrgId>/<sha>.pdf) so a brand sharing another org's
  // library uploads into that library's own storage namespace — matching where
  // add-work will look and keeping one physical copy per unique file.
  const orgId = libraryOrgId

  if (!isR2Configured()) {
    return apiError('File storage is not configured on this server.', 503)
  }

  let body: { sha256?: unknown; bytes?: unknown; filename?: unknown }
  try {
    body = await request.json()
  } catch {
    return apiError('Invalid JSON body', 400)
  }

  const sha256 = typeof body.sha256 === 'string' ? body.sha256.toLowerCase() : ''
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    return apiError('sha256 must be 64 lowercase hex characters.', 400)
  }
  const bytes = typeof body.bytes === 'number' ? body.bytes : NaN
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > MAX_PDF_BYTES) {
    return apiError(`bytes must be a positive integer up to ${MAX_PDF_BYTES}.`, 400)
  }
  const filename = typeof body.filename === 'string' ? body.filename : ''
  if (!/\.pdf$/i.test(filename)) {
    return apiError('Only PDF files can be added to the library.', 400)
  }

  const storagePath = `repertoire/${orgId}/${sha256}.pdf`

  try {
    const r2 = getR2Client()
    // Content-addressed: if these exact bytes are already stored, skip the upload.
    const head = await r2.headObject(storagePath)
    if (head && head.size === bytes) {
      return apiSuccess({ storagePath, alreadyUploaded: true })
    }
    const uploadUrl = await r2.getSignedPutUrl(storagePath, UPLOAD_URL_TTL_SECONDS)
    return apiSuccess({ storagePath, uploadUrl, alreadyUploaded: false })
  } catch (e) {
    return serverError('repertoire: mint upload url', e)
  }
}
