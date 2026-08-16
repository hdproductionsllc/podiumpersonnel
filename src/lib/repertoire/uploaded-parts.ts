/**
 * The fidelity gate every manually uploaded part PDF must pass before it can
 * become a library row.
 *
 * The library is the most valuable thing in the product and the owner has been
 * burned by a bad file before, so the rule is the same everywhere: the browser
 * says what it uploaded, and the server proves it. An object is trusted only
 * when it EXISTS, is the size the client claimed, and hashes back to the sha256
 * baked into its own content-addressed key. Anything else is rejected — and a
 * key whose bytes do not match its own hash is deleted, because that object is
 * wrong for every part that might ever point at it, not just this one.
 *
 * Lives here rather than in a route because two routes now add parts —
 * /api/repertoire/add-work (from an intake row) and
 * /api/library/works/[workId]/parts (from the library page) — and a second
 * implementation of this check is a second chance to get it wrong.
 */

import { createHash } from 'crypto'
import type { R2Client } from '@/lib/storage/r2'

/** A part the browser claims to have uploaded, with its server-derived key. */
export interface UploadedPartClaim {
  sha256: string
  bytes: number
  originalFilename: string
  /** Always derived server-side as repertoire/<orgId>/<sha256>.pdf. */
  storagePath: string
}

/**
 * Verify one claimed object. Returns null when it checks out, or the message to
 * hand back to the caller when it does not.
 */
export async function verifyUploadedPart(
  r2: R2Client,
  part: UploadedPartClaim
): Promise<string | null> {
  const head = await r2.headObject(part.storagePath)
  if (!head) {
    return `"${part.originalFilename}" was not found in storage — upload it first.`
  }
  if (head.size !== part.bytes) {
    return `"${part.originalFilename}": stored size (${head.size}) doesn't match the upload (${part.bytes}).`
  }

  const stored = await r2.getRange(part.storagePath, head.size)
  const actual = createHash('sha256').update(stored).digest('hex')
  if (actual !== part.sha256) {
    // The object at this key is corrupt for everyone — remove it.
    await r2.deleteObject(part.storagePath)
    return `"${part.originalFilename}" failed integrity verification and was removed. Please upload it again.`
  }

  return null
}

/** Verify a batch, stopping at the first failure. Returns null when all pass. */
export async function verifyUploadedParts(
  r2: R2Client,
  parts: UploadedPartClaim[]
): Promise<string | null> {
  for (const part of parts) {
    const problem = await verifyUploadedPart(r2, part)
    if (problem) return problem
  }
  return null
}
