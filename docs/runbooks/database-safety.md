# Database Safety Runbook

*Created for V2.0 (2026-07-11). The production database serves 4–5 live organizations.
Data loss is unacceptable. Follow this before ANY schema change.*

## The one production database

- Supabase project ref: `cyspguwdocseisjyjqmu`
- **Vercel preview deploys point at this same database** (only email is suppressed there
  via `EMAIL_SAFE_MODE=true`). Testing a branch on a preview URL mutates live data.
  Use the staging project (see `staging.md`) for anything that writes.

## Before every migration (checklist)

1. **Fresh backup, right now** (don't rely on the nightly):
   ```
   node scripts/backup-database.js
   ```
   Output lands in `scripts/backups/db/<timestamp>/` — one JSON per table + manifest.
   Verify the new folder exists and `contract_offers.json` / `payments.json` are non-empty.
2. **Replay the migration on staging first** and run its `-- verify:` queries there.
3. **Apply to prod** in the Supabase SQL editor (Dashboard → SQL Editor → paste → Run).
4. **Run the `-- verify:` queries** at the bottom of the migration file in prod.
5. **Only then** push the code that depends on it (push to `master` = auto-deploy).

Rule (from launch): the migration always lands BEFORE the code deploy that needs it,
and every new code path must tolerate the migration NOT being applied yet (fallbacks).

## Point-in-time recovery (PITR) — ACTION NEEDED

Status as of 2026-07-11: **unconfirmed** (open since launch).

David, to check (~2 minutes):
1. supabase.com/dashboard → project `cyspguwdocseisjyjqmu`
2. **Project Settings → Database → Backups** (or Database → Backups in the left rail)
3. Note what it says:
   - **Daily backups** listed with dates → good, note retention (7 days on Pro).
   - **PITR** shown as available/enabled → ideal (restore to any minute).
   - "Upgrade to enable backups" → we're on the free plan and the nightly JSON dump on
     this PC is our ONLY backup. Recommendation: upgrade to Supabase Pro (~$25/mo) —
     with paying-customer data this is not optional for long.

Until PITR is confirmed, the JSON dump before every migration is mandatory.

## What the nightly JSON backup does and doesn't cover

`scripts/backup-database.js` (Task Scheduler job "PodiumNightlyBackup", daily 09:00):
- ✅ Every row of every public table, 14-day retention, auto-discovers new tables
- ❌ Runs only when this PC is on; ❌ no storage files (W-9 PDFs, sheet music);
  ❌ no auth.users (musician/admin logins); ❌ restore is manual (REST inserts)

Storage + auth are another reason to confirm Supabase-side backups.

## Never touch (load-bearing contracts)

- `contract_offers.token` and the `/gig/[token]` URL shape — links live in sent emails
- Offer/position status CHECK constraints (`pending/viewed/accepted/declined/expired/rescinded/released`)
- Payment FKs (`ON DELETE RESTRICT`) and the archive-instead-of-delete pattern (1099 history)
- `create_organization_with_owner` may only change via DROP+CREATE in one transaction
  (CREATE OR REPLACE with new default params creates ambiguous overloads → onboarding 500s)
