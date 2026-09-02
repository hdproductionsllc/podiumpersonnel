# Podium

Podium staffs skilled freelancers onto dated events. An organization keeps a roster of musicians, builds a project (a wedding, a concert, a season), lists the chairs it needs filled, and sends offers down a ranked list. Musicians accept or decline from a one-tap link, subs get called automatically when someone drops, and the org ends up with gig details, sheet music, W-9s, payments and a 1099 export all in one place.

It runs four working string ensembles today (Project String Quartet, Subito, Meridian, Lonestar) and is built so the same engine can serve orchestras, pit bands, churches with paid musicians, and eventually non-music crews. Live at [app.podiumpersonnel.com](https://app.podiumpersonnel.com); marketing site source lives in `podium-marketing/`.

## Stack

| Layer | What |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript, Tailwind, shadcn/ui |
| Data | Supabase (Postgres + Auth + RLS), Cloudflare R2 for sheet-music PDFs |
| Email | Resend, React Email templates in `src/lib/email/templates` |
| Billing | Stripe (three tiers, dormant until `NEXT_PUBLIC_BILLING_ENABLED` is set) |
| Hosting | Vercel. Push to `master` deploys production. Crons in `vercel.json`. |
| Monitoring | Sentry, inert until `NEXT_PUBLIC_SENTRY_DSN` is set |
| Tests | Vitest, `src/lib/__tests__` and `src/lib/intake/__tests__` |

## Running it locally

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

Every key in `.env.example` is documented inline. The minimum to boot is the three Supabase keys, `NEXT_PUBLIC_APP_URL` and `RESEND_API_KEY`.

**Email safe mode is on by default.** With `EMAIL_SAFE_MODE` unset, only addresses in `EMAIL_ALLOWLIST` receive mail; everyone else is suppressed and logged. Production sets it to `false` explicitly. Never turn it off locally.

## Checks

```bash
npx tsc --noEmit   # types
npm run lint       # eslint (a large pre-existing backlog; advisory in CI for now)
npm test           # vitest, no database or network needed
npm run build      # what Vercel runs
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint and tests on every PR and every push to `master`.

## How the code is laid out

```
src/app/(auth)/            login, signup, onboarding, password reset
src/app/dashboard/         the org admin app (projects, musicians, library, books, payments, ...)
src/app/gig/[token]/       the musician's one-tap offer page (no login)
src/app/musician/          the musician portal
src/app/confirm-*/[token]  music + gig-details confirmations from email links
src/app/api/               ~80 route handlers; crons under api/cron
src/lib/offers/            offer lifecycle (respond.ts is the atomic seat claim)
src/lib/email/             send.ts is the single send path; client.ts holds safe mode + rate limiting
src/lib/intake/            client song-list intake, matcher, book builder (PDF parts → books)
src/lib/verticals/         per-vertical role taxonomy (orchestra today; the seam for other markets)
src/lib/api-helpers.ts     requireAuth / requireOrgAdmin / requireOrgPlan / serverError
src/lib/cron.ts            cron auth, kill switch, ops alerts
supabase/migrations/       numbered SQL, applied by hand (see below)
scripts/                   operational one-offs, documented below
tasks/                     working notes: todo.md, lessons.md, strategy docs
docs/                      design notes and change records
```

Two rules that are easy to get wrong:

- **Musicians are not org members.** They live in `musicians`, not `organization_members`, so any route acting for a musician reads org data with `createServiceClient()` and checks the token or `user_id` itself.
- **Supabase writes do not throw.** Always read `error` from the result. `serverError()` logs it, reports it to Sentry and returns a generic 500.

## Database migrations are applied by hand

Merging a PR ships the code. It does **not** run the SQL in `supabase/migrations/`. Someone has to paste the file into the Supabase SQL editor for production. Nothing warns you if you forget, and the app usually keeps working because most migrations add triggers or policies rather than columns, so the gap is silent.

This bit us: migrations 080 and 081 sat unapplied for days in August 2026 while their PRs showed as merged. The PR template has a checkbox for it. To confirm what is actually live, tables and columns can be probed over REST, but triggers, functions and policies only show in the SQL editor. Paste-ready audit scripts follow the convention in `scripts/security-fixes-2026-07-25.sql`: migration body verbatim, a HOW TO RUN header, and a RESULTS query that prints OK or ACTION NEEDED.

## Scripts

All read `.env.local`. JavaScript scripts run with `node scripts/<name>.js`; SQL files are pasted into the Supabase SQL editor.

**Everyday**

| Script | What it does |
|---|---|
| `update-library.js` | The easy button for new sheet music. Drop PDFs named `Title - Artist - part.pdf` into the library folder, run it, confirm the list. Also `Update Music Library.cmd` / `.command` at the repo root. |
| `export-catalog.js` | Publish-ready song lists (md/txt/csv/html) for the brand websites from the live library. |
| `site-library-gap.js` | What the brand websites advertise that the library cannot build. Writes `tasks/missing-repertoire.md`. |
| `backup-database.js` | Dumps every public table to JSON. Nightly stopgap until Supabase Pro backups. Output in `scripts/backups/` (git-ignored). |

**Library maintenance (reversible, one-time cleanups from July 2026)**

| Script | What it does |
|---|---|
| `library-audit.js` | Find duplicate arrangements and fragments; `--apply` archives them via `is_active`. |
| `library-merge.js` | Stitch split Naughtin quintet arrangements back into one work. Has `--undo`. |
| `library-aliases.js` | Teach the matcher the short names of merged songs. Has `--undo`. |
| `audit-consistency.js` | Read every part PDF of a work and check they belong to the same piece. |
| `fix-catalog-data.js`, `fix-incomplete-works.js` | Repair customer-visible catalog damage found by diffing against the websites. |
| `merge-duplicate-musicians.js` | Merge confident duplicate musician records within an org. |

**Setup and infrastructure (run once)**

| Script | What it does |
|---|---|
| `create-stripe-tiers.js`, `create-stripe-webhook.js`, `configure-stripe-portal.js` | Create the three Stripe products and prices, the webhook endpoint, and the customer portal. Idempotent. |
| `r2-set-cors.js` | CORS on the R2 bucket so part PDFs upload browser-direct. |
| `wire-shared-library.js` | Point the brand orgs at Project String Quartet's master library (data step after migration 075). |
| `repertoire-index.js`, `repertoire-upload.js`, `repertoire-db-import.js`, `repertoire-absorb-knowledge.js` | The original three-phase import of the sheet-music library from the retired Mac system. |

**SQL bundles (historical, already applied to production)**

`launch-pending-migrations.sql` (2026-06-09), `go-live-2026-07-18.sql`, `security-fixes-2026-07-25.sql`, `w9-upload-2026-07-25.sql`. `staging-replay.sql` recreates the full schema on a fresh Supabase project and must never be run against production.

## Deploying

1. Open a PR. CI must be green.
2. If the PR has a migration, run it in the SQL editor **before** merging.
3. Merge to `master`. Vercel deploys automatically.
4. Check the deploy landed, then try the change on the live site. Nothing is "fixed" until this step.

## Where to read more

- `tasks/lessons.md`: the mistakes we have already made once, and the rule each one produced.
- `tasks/v2-strategy.md`: the July 2026 market research and the case for expanding to performing arts.
- `docs/`: design notes and change records, including `hardening-2026-09.md` for what this README came out of.
