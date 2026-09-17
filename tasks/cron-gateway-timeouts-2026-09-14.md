# Cron Gateway Timeouts — round 2 (2026-09-14)

## What the logs actually say (Vercel, last 24h, level:warn)
The retry shipped on 09-13 IS live (deployment dpl_2eaJ7nM9cUUawe823A6vj6BRqsPh, master).
It is working — 11 of ~18 hourly runs needed a retry and were rescued.
Two runs still exhausted it and emailed: 02:00 and 06:00 CDT on 09-14.

Trace of the 06:00 failure:
  11:00:17.368  attempt 1 failed (504 Gateway Timeout), retrying in 2000ms
  11:00:24.400  attempt 2 failed (504 Gateway Timeout), retrying in 4000ms
  11:00:33.450  Failed to fetch expired offers: { message: 'Gateway Timeout' }
  duration 22.28s / 5m limit; External APIs shows three 504s to
  cyspguwdocseisjyjqmu.supabase.co/rest/v1/contract_offers

Two facts that change the fix:
1. The 504 is NO LONGER instant — each attempt burns 5-7s waiting. So the old
   "3 attempts over 6s" was really "3 attempts over 22s", and the fault outlived it.
2. EVERY observed 504, across every job, lands in the first minute of an hour
   (:00:11 expire-offers, :00:34 pre-gig-reminders). Every cron in vercel.json is
   scheduled at minute 0, so we have no counter-evidence from other minutes.
   David's own probes from his PC at 12:00:08/:19/:30 got 200 while Vercel's
   iad1 calls at the same seconds got 504 — so the fault is the Vercel(iad1) ->
   Supabase path at the top of the hour, not Supabase being down.

## Tasks
- [x] Confirm the retry is deployed and firing (Vercel runtime logs, not a grep)
- [x] Measure how much it helped (11 rescues vs 2 failures in 24h)
- [x] Widen the backoff: 5 attempts, 1s/2s/4s/8s (~45s worst case vs a 5m limit)
- [x] Move every cron off minute :00 to staggered minutes so they stop firing
      into the top-of-hour window
- [x] Update cron-retry tests for the new defaults; keep a test pinning that
      4xx is never retried
- [x] npm test + npm run build locally
- [x] ONE push to master

## If it still fails at the new minutes
Then it is idleness, not the top of the hour: the next move is a real keepalive
(every ~10 min) instead of the current `0 6 */3 * *`, which pings once every 3 days.
Do NOT touch Supabase compute or plan — the DB is idle when this happens.

## Verification log (local, 2026-09-14)
- `npm test` — 45 files, 752 tests, all pass (includes 13 cron-retry + 4 new cron-schedule tests)
- `npm run build` — Compiled successfully in 4.9s; only pre-existing Sentry deprecation warnings
- New guard: src/lib/__tests__/cron-schedules.test.ts fails the build if any job drifts back to minute 0

## What to watch after this deploys
expire-offers now runs at :17 past each hour. The next few runs are the experiment:
- No 504s at all at :17 -> the top-of-hour stampede was the cause; done.
- Still 504s at :17 but the widened backoff rescues them -> it is idleness on the
  Vercel->Supabase path; make keepalive run every ~10 min.
- Still failing outright -> reopen; capture the Supabase API Gateway log for :17.
