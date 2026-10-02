# Database tests, and how migrations are tracked

Two things live here: the CI job that tests the database for real, and the rule
for recording which migrations have actually been applied.

## 1. Database tests (Postgres in CI)

`npm test` never touches a database. `npm run test:db` does: it connects to a
throwaway Supabase Postgres, replays every file in `supabase/migrations/` in
filename order, then runs the tests in `src/lib/__tests__/db/`.

| File | What it proves |
|---|---|
| `global-setup.ts` | Every migration, 001 to the latest, applies cleanly to a fresh Supabase Postgres. A failure names the file and Postgres's error. |
| `rls-tenant-isolation.test.ts` | Two organizations, an admin in each. For `musicians`, `projects`, `contract_offers` and `payments`: an admin reads their own rows, sees none of the other org's, cannot update, delete or insert across orgs, and a signed-out visitor sees nothing. |
| `constraints.test.ts` | One standard payment per musician/service/fee type (adjustments still allowed), services with payments cannot be deleted, one organization per account, status CHECKs on offers and projects. |
| `staffing-events.test.ts` | The staffing history (092): an admin reads only their own org's events, a plain member and a signed-out visitor read nothing, no session can insert, update, delete or call `log_staffing_event()`, the service role can write both ways, history survives the offer it describes being deleted, and `scripts/sql/092-staffing-events.paste.sql` reports all PASS on two consecutive runs. |
| `offer-columns.test.ts` | The offer columns (093): an offer inserted the way the pre-093 code does still works and gets the defaults, `superseded` is a valid status, `delivery_status` takes only queued / sent / failed / suppressed, there is no `pay_basis`, an org admin's own session can write the new columns, and `scripts/sql/093-offer-columns.paste.sql` backfills `is_substitution` from `substitution_requests.offer_id` and reports all PASS on two consecutive runs. |
| `offer-replace-order.test.ts` | The statements createOffer uses to replace a chair's offer, against the real one-live-offer index (095): the old order (insert, then retire) is refused, the new order (retire, then insert) works, the put-back after a failed send works, and a put-back that would make a second live offer is refused. |
| `staffing-rpcs.test.ts` | Migrations 094 and 095. The CHECK (094) and the indexes (095) refuse two open or two accepted offers on a chair and a confirmed chair with nobody in it. `claim_chair`: claims, returns `project_inactive` on a cancelled gig and `musician_inactive` for a deactivated musician without changing anything, moves a chair to a substitute releasing the original first, and retires (not reopens) the loser of a race. `create_offer`: the server's checks in the server's order, retire then insert, history, and a retired substitute's approved request closed. Concurrency with two connections: two accepts of one offer, two substitutes on one chair, two `create_offer` calls for one chair or one musician; exactly one wins each time. Only the service role may call either function. The scripts in David's order (094 repair, 094, 095 repair, 095): 094 refuses to run without 092 or over bad chairs, 095 refuses over duplicate offers, each repair fixes and logs its rows, and every script reports all PASS twice. |
| `helpers.ts` | `asUser()` runs a query as the `authenticated` role with a JWT `sub`, the way PostgREST does, inside a transaction that is always rolled back. `createTenant()` builds one org with one of each row. |

The tests use synthetic data only (random ids, `example.test` addresses). This
repo is public and so are its CI logs: never point `DB_TEST_URL` at a real
Supabase project, and never add a test that prints row contents.

### In CI

The `database` job in `.github/workflows/ci.yml` runs on every pull request and
every push to master. It starts `supabase/postgres:17.11.0.002` as a service
container (the same image the nightly backup restore test uses), waits for the
image's own init scripts, and runs `npm run test:db`.

The image's superuser is `supabase_admin`; its `postgres` role is not one.
The image also has no `storage` schema (the Storage service creates it on a real
project), so `storage-stub.sql` stands in for it; migrations 032, 041 and 085
need it.

### Locally

Needs Docker. Use a fresh container each time (the replay is skipped if the app
schema already exists):

```
docker run -d --name podium-db-test -p 54329:5432 -e POSTGRES_PASSWORD=postgres supabase/postgres:17.11.0.002
# wait about 20 seconds for the image's init scripts, then:
DB_TEST_URL=postgresql://supabase_admin:postgres@localhost:54329/postgres npm run test:db
docker rm -f podium-db-test
```

### Adding a test

Every new migration that adds a table should get a row in the `TABLES` list in
`rls-tenant-isolation.test.ts` if the table is tenant-owned. Every migration that
adds a constraint or unique index the code relies on should get a case in
`constraints.test.ts`. Concurrency tests (two connections racing on a chair) go
in `staffing-rpcs.test.ts`: hold the first call's transaction open, start the
second on the other connection, wait until `pg_stat_activity` shows it waiting
on a lock, then commit the first.

## 2. How migrations are tracked

**Merged is not applied.** Merging a PR ships the code; it does not run the SQL.
Production's schema is changed by hand, in the Supabase SQL editor, so the repo
and the database can silently disagree (080 and 081 sat unapplied for days).

Hand-applying stays allowed. What changes is that it is recorded, in the table
the Supabase CLI itself uses, so the question "is migration N live?" has one
answer that a query can give.

### Recording an application

After pasting a migration into the SQL editor and running its `-- verify:`
queries, record it in the same session:

```sql
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
insert into supabase_migrations.schema_migrations (version, name)
values ('091', '091_example_name')
on conflict (version) do nothing;
```

(The `create` lines are a no-op once the table exists. Use the migration's
numeric prefix as `version` and its file name without `.sql` as `name`.)

### Checking what is live

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

Compare against `ls supabase/migrations`. Anything in the folder but not in the
table is merged but not applied, or applied but not recorded. Resolve it either
way before pushing code that depends on it (the house rule stands: migration
first, then code, and code tolerates the migration being absent).

Migrations 001 to 090 predate this table. Backfill them once, after confirming
by the audit in `docs/hardening-2026-09.md` that they are all live.

### Not the source of truth

`supabase/schema.sql` is a historical baseline from before migration 019 and is
**not** a description of the database. It is labelled as such in its header.
The source of truth is the migrations folder, which the `database` CI job
replays from empty on every change.
