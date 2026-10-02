# Database backups

Supabase's Free plan keeps **no backups**. The only copy of the database outside
Supabase is made by the GitHub workflow `.github/workflows/backup-database.yml`.

## What runs, and when

Every night at 07:13 UTC (about 2am Central):

1. The Supabase CLI dumps three files: `roles.sql`, `schema.sql`, `data.sql`.
   This is Supabase's own documented backup method, and it includes logins
   (`auth.users`) as well as the app's tables.
2. They are zipped into `podium-db-<date>.tar.gz` and uploaded to the private
   Cloudflare R2 bucket **`podium-db-backups`**, folder `db/`. R2 deletes copies
   older than 30 days by itself.
3. The backup is **restored into a throwaway database** on GitHub's machine and
   the row counts of the main tables are compared with production. If the
   restore fails or the numbers don't match, the run fails.

A failed run emails the GitHub account that owns the repo. Each run's page
(GitHub > Actions > Database backup) shows the file name and "Restore test
passed: N tables match production".

**The repo is public, so its run logs are too.** The workflow never prints row
data, row counts or full database error text (a failed data load quotes the
row). Keep it that way when editing it.

To make the test restore load, the workflow copies production's auth/storage
table structure into the scratch database first (the stock image's are older).
A real restore into a new Supabase project doesn't need that step.

Not covered: files in R2 (sheet music, W-9 uploads) live in Cloudflare, not
Supabase, and are not part of this backup.

## Secrets it needs (GitHub > Settings > Secrets and variables > Actions)

| Secret | Where it comes from |
|---|---|
| `SUPABASE_DB_URL` | Supabase dashboard > **Connect** > **Session pooler** connection string, with the database password filled in. Use the session pooler, not "Direct": GitHub's machines can't reach the direct address. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | The same values as in `.env.local`. |

Resetting the database password (Supabase > Project Settings > Database) does not
affect the app, which uses API keys. It only means updating `SUPABASE_DB_URL`.

## Run it now

GitHub > Actions > Database backup > **Run workflow**. Or: `gh workflow run backup-database.yml`.

## Restore (when something has gone wrong)

1. Download the newest good copy from R2 (Cloudflare dashboard > R2 >
   `podium-db-backups` > `db/`) and unzip it: `tar -xzf podium-db-<date>.tar.gz`.
2. Create a **new** Supabase project (don't restore over the broken one until
   you've checked the copy). Copy its Session pooler connection string.
3. Run, with `psql` installed:

   ```sh
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file roles.sql \
     --file schema.sql \
     --command 'SET session_replication_role = replica' \
     --file data.sql \
     --dbname "<new project's connection string>"
   ```

4. Check the app against the new project (point a local `.env.local` at it), then
   switch Vercel's `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` to the new project and redeploy.

The nightly run does steps 1 to 3 every night against a scratch database, so a
restore that works there should work here.
