/**
 * Small in-process rate limiter for public, unauthenticated endpoints.
 *
 * HONEST ABOUT WHAT THIS IS: the counters live in the memory of one serverless
 * instance. Two instances mean two buckets, and a cold start forgets everything.
 * It is not a defense against a distributed attacker and is not sold as one.
 *
 * What it IS good for is the realistic failure on the client planner: a retry
 * loop, a stuck autosave, or one person hammering one token — where a single
 * instance sees the whole burst and stops it costing us a matcher run per
 * keystroke. The real access control is the 256-bit token; this only bounds the
 * damage a holder of one can do by accident.
 *
 * If this ever needs to be real, the shape below is the same one a Redis/Upstash
 * INCR+EXPIRE implementation takes — swap the Map, keep the call sites.
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/** Keep the Map from growing without bound on a long-lived instance. */
const MAX_TRACKED_KEYS = 10_000

function sweep(now: number): void {
  if (buckets.size < MAX_TRACKED_KEYS) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
  // Still full of live buckets: drop the oldest rather than grow forever. Under
  // this much pressure the limiter is already not the thing holding the line.
  if (buckets.size >= MAX_TRACKED_KEYS) {
    const oldest = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt)
    for (const [key] of oldest.slice(0, Math.floor(MAX_TRACKED_KEYS / 4))) buckets.delete(key)
  }
}

export interface RateLimitResult {
  allowed: boolean
  /** Seconds until the window resets — for a Retry-After header. */
  retryAfter: number
}

/**
 * Consume one unit against `key`. Returns whether the caller is within budget.
 *
 * @param key      bucket identity, e.g. `plan-save:${token}`
 * @param limit    requests allowed per window
 * @param windowMs window length
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfter: 0 }
  }

  existing.count += 1
  if (existing.count > limit) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) }
  }
  return { allowed: true, retryAfter: 0 }
}

/** Test seam. Never called by request paths. */
export function __resetRateLimits(): void {
  buckets.clear()
}
