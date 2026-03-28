# Lessons Learned

## Resend Rate Limit: Always delay between email sends
**Date:** 2026-02-10
**Bug:** "1 failed" when sending music reminders to 3 musicians. Third email hit Resend's 2 requests/second rate limit.
**Root cause:** Sending emails in a tight `for` loop with no delay between iterations.
**Fix:** Add `if (i > 0) await new Promise((r) => setTimeout(r, 600))` at the start of every email-sending loop.
**Rule:** ANY time you write a loop that sends emails via Resend, add a 600ms delay between sends. No exceptions. This applies to all API routes — sends, reminders, cron jobs, invitations, etc.

## logEmail() can throw — don't let it kill the count
**Date:** 2026-02-10
**Bug:** Email sent successfully but counted as "failed" because `logEmail()` threw and `sentCount++` was after it in the same try block.
**Fix:** Always increment `sentCount` immediately after the email send succeeds. Wrap `logEmail()` in its own try/catch so a logging failure doesn't affect the send count.
**Rule:** In send loops: `sendEmail()` → `sentCount++` → `try { logEmail() } catch {}`. Never put sentCount after logEmail.

## Musicians aren't org members — use serviceClient for their queries
**Date:** 2026-02-10
**Bug:** Musician portal showed "No music shared yet" even though files were uploaded. RLS policies on `project_files` require `organization_members` membership, but musicians aren't org members.
**Fix:** Use `createServiceClient()` (bypasses RLS) instead of `createClient()` for all musician portal API queries that touch org-owned tables (project_files, project_positions, etc.).
**Rule:** Any API route under `/api/musician/` that reads org data must use serviceClient. Musicians only exist in the `musicians` table, not `organization_members`.

## Supabase RLS blocks server components — use serviceClient for cross-table reads
**Date:** 2026-03-27
**Bug:** Venue links on the projects page always showed name-only Google Maps search URLs (e.g. "Our Lady of Solitude Church" → wrong city) even though venues had correct `google_maps_url` with `query_place_id` stored in the database.
**Root cause:** Three layers of RLS failures:
1. **Client-side venue INSERT** — `createBrowserClient()` uses the anon key. The RLS policy requires `auth.uid()` to match an admin/owner, but the client-side insert returned `{ data: null, error: {...} }` without throwing, so the catch block never ran. Venue creation silently failed.
2. **Server-side venue SELECT in page.tsx** — `createClient()` (session-based server client) couldn't reliably resolve `auth.uid()` in the Next.js server component context, so the RLS policy returned zero rows. The venue URL map was empty.
3. **Client-side Geocoding API not enabled** — The Google Maps Geocoding API wasn't activated in the Cloud project, so `geocoder.geocode()` returned `REQUEST_DENIED`. The `googlePlaceData` was always null, meaning the venue creation path never had the address data to pass along.
**Fix:**
- Venue creation moved to a dedicated `/api/venues` server-side API route using `createServiceClient()` (service role key, bypasses RLS). Auth verified manually first.
- Venue URL map in `page.tsx` fetched via `createServiceClient()` instead of session client.
- Server-side Places API enrichment when client geocoding is unavailable — the API route looks up place details by `place_id` using the server-side Google Places API.
**Rule:** Never rely on the session-based Supabase client (`createClient()`) for cross-table reads in Next.js server components. If the data is needed for rendering and the user is already authenticated, use `createServiceClient()`. Also: Supabase `.insert()` does NOT throw on failure — always check the `error` return value. And: never silently swallow errors with empty `catch {}` blocks.

## Google Maps URLs: always include address + query_place_id
**Date:** 2026-03-27
**Bug:** Google Maps links resolved to wrong locations (e.g. "Our Lady of Solitude Church" in Soledad, CA instead of Palm Springs, CA).
**Root cause:** URLs were generated from just the venue name (`query=Our+Lady+of+Solitude+Church`) without address context or place_id. Multiple places had fallback code generating name-only URLs.
**Fix:** All Maps URLs now use the official format: `https://www.google.com/maps/search/?api=1&query=NAME,+ADDRESS,+CITY,+STATE,+ZIP&query_place_id=PLACE_ID`. The `query` text provides a human-readable fallback; the `query_place_id` provides precision.
**Rule:** Never generate a Google Maps URL from just a place name. Always include the full address in the `query` param, and `query_place_id` when available. The old format (`/maps/place/?q=place_id:XXXX`) is undocumented — use the official Maps URLs API format.
