# Section A: Current architecture and operational infrastructure

*Audit date: 2026-10-01. Repository: `/home/user/podiumpersonnel`, HEAD `869ece3` (2026-09-29). Read-only audit. All paths are relative to the repo root. Line numbers are as of HEAD.*

Every claim here comes from the code, not from docs. Where a doc says something different from the code, both are cited.

---

## 0. Summary

Podium is a single Next.js 16 App Router app deployed to Vercel. It talks to one Supabase project (Postgres, Auth, Storage) with supabase-js, either straight from the browser under RLS or through about 80 route handlers. There is no ORM, no generated types, no server actions, no queue, and no database transactions in application code. The only Postgres functions the app calls are two RPCs, both for auth or onboarding. Background work is 7 Vercel crons. They poll tables and get idempotency from conditional `UPDATE ... WHERE` claims, unique constraints, or `email_logs` lookups. Email goes through Resend via one chokepoint (`src/lib/email/send.ts`) that has a fail-safe allowlist and an in-process throttle. There is no SMS and no channel abstraction. Files live in Supabase Storage (`project-files`, `w9-documents`) and Cloudflare R2 (`podium-repertoire`, the sheet-music library). Migrations are pasted into the SQL editor by hand. `supabase/schema.sql` is a stale pre-019 baseline. Tests (60 files, ~12.6k lines, Vitest) never touch a database: about half read source text and match strings, and the rest are pure unit tests or use an in-memory supabase fake. Backups are a JSON dump run by Windows Task Scheduler on the owner's PC. PITR was declined.

---

## 1. Frontend

### 1.1 Framework and stack
- Next.js `16.3.6`, React `19.2.3`, TypeScript 5, Tailwind 4, shadcn/ui on Radix (`package.json`; `components.json`).
- Forms: `react-hook-form` + `zod` 4 (`src/lib/validations/*.ts`: auth, books, instruments, musicians, projects, schedules, settings, venues).
- Other client libs: `@dnd-kit/*` (reordering call order), `sonner` toasts, `@react-google-maps/api` (venue autocomplete), `xlsx@0.18.5` (exports, 1099 report), `pdf-lib` + `fflate` (book building, zips), `date-fns`/`date-fns-tz`.
- There is a second, separate Next 14.1 app for marketing in `podium-marketing/` (`podium-marketing/package.json`).

### 1.2 Routing structure (`src/app`)
There are 24 `page.tsx` files and 81 `route.ts` files (80 under `api/`, plus `auth/callback`).

| Segment | Pages | Notes |
|---|---|---|
| `(auth)/` | login, signup, onboarding, forgot-password, reset-password | Route group with its own layout and error boundary |
| `dashboard/` | `page.tsx` (705 lines, home), projects, musicians, instruments, books, library, schedules, venues, emails, payments, payments/1099, settings | Admin app. `dashboard/layout.tsx` resolves membership and redirects to `/onboarding` if there is none (`src/app/dashboard/layout.tsx:17-39`) |
| `gig/[token]` | one-tap offer page (no login) | |
| `confirm-details/[token]`, `confirm-music/[token]` | confirmations from email links | |
| `w9/[token]` | musician W-9 self-upload | |
| `report/[token]` | lead musician's after-gig report | |
| `musician-policy` | public policy page | |
| `/` (`page.tsx`) | root | Redirected to `/dashboard` / `/login` by middleware |

- The **musician portal has been removed.** `src/lib/supabase/middleware.ts:44-48` says so ("musicians have no accounts and drive everything from tokenized links"), and there is no `src/app/musician/` directory. **Stale references remain:**
  - `README.md:46` still lists `src/app/musician/`.
  - `src/app/auth/callback/route.ts:33,52` still redirects users with linked musician records to `/musician`, which now 404s.
  - `src/lib/offers/respond.ts:14` documents a `/api/musician/offers/...` path that does not exist.
  - `resolveMusicianIds()` (impersonation helper) in `src/lib/supabase/server.ts:54-98` has no callers.
- Middleware (`src/middleware.ts`) runs `updateSession` (`src/lib/supabase/middleware.ts`) on everything except static assets, `api`, `gig`, `confirm-details`, `confirm-music`. It refreshes the Supabase session cookie. Unauthenticated users on `/dashboard` or `/onboarding` go to `/login`, and authenticated users on auth pages go to `/dashboard`. Authorization is not checked here, only "logged in".

### 1.3 Component organization
`src/components/` holds 119 `.tsx` files, about 33k lines. By folder:

| Folder | Files | Lines | Note |
|---|---|---|---|
| projects | 22 | 11,473 | Staffing core UI: positions, offers, send-offer, subs, files, gig details |
| musicians | 6 | 3,900 | Roster, call order, bulk edit, import |
| intake | 5 | 3,095 | Music-library intake / book builder |
| ui | 28 | 2,603 | shadcn primitives |
| settings | 10 | 1,492 | |
| payments | 4 | 1,387 | Includes `tax-report-client.tsx` (1099) |
| books | 6 | 1,331 | **Roster "books"** (musician-per-instrument lists), not sheet music |
| library | 1 | 1,176 | Repertoire library browser |
| auth | 5 | 1,118 | |
| gig | 4 | 1,014 | Public offer page parts |
| instruments | 8 | 1,009 | |
| others | — | ~2.5k | venues, schedules, layout, onboarding, w9, emails, dashboard, music, billing, providers |

### 1.4 Client vs server components
- 113 files start with `'use client'`. Almost every component under `src/components` is a client component.
- Pages are thin **async server components**. They create the cookie-bound server client (`src/lib/supabase/server.ts:createClient`), run one or more large PostgREST embedded selects, and pass the data to a `*-client.tsx` component. Example: `src/app/dashboard/projects/page.tsx:10-60` selects projects with services, gig_detail_sends, project_files, music_sends, project_positions → contract_offers → substitution_requests in one nested select.
- Public token pages (`gig/[token]`, `confirm-*`, `w9/[token]`, `report/[token]`, `musician-policy`) and `dashboard/library/page.tsx` read with the **service-role client**, because the viewer has no org membership.

### 1.5 Data-fetching and mutation pattern
There are three mechanisms, mixed:
1. **Server component reads** with the user's RLS-bound client (most dashboard pages).
2. **Direct supabase-js from the browser** (`src/lib/supabase/client.ts`, anon key + user session, RLS-enforced). 45 files import the browser client. **Reads and writes both happen here.** Tables written directly from the browser include `project_positions`, `musician_instruments`, `services`, `musicians`, `projects`, `book_entries`, `instruments`, `books`, `venues`, `competing_schedules`, `user_tutorial_state`, `substitution_requests`, `staffing_presets`, `payments`, and **`contract_offers`**.
3. **`fetch('/api/...')`** to route handlers (95 call sites in `src/components`). These cover anything that sends email, uses the service role, touches R2/Stripe/Spotify, or needs plan gating.

There are **no server actions** (no `'use server'` anywhere in `src`).

**Offer creation is a browser-side multi-step write:**
- **Initial offer.** `src/components/projects/send-offer-dialog.tsx`:
  1. Duplicate-offer check across the project's positions (`:486-512`).
  2. `contract_offers.insert` (`:528`).
  3. `project_positions.update({status:'offered'})` (`:541`).
  4. `POST /api/offers/send-email` (`:559`). That route also expires rival offers on the same position (`src/app/api/offers/send-email/route.ts:79-86`).
- **Waterfall "send to next candidate".** `src/components/projects/project-offers.tsx:228-330` repeats the same pattern: check, insert offer (`:269`), update position (`:285`), call the email route.

None of these steps is atomic. The duplicate check is check-then-insert from a browser, and a failed position update leaves a live offer behind (the code toasts about it). This is the most important architectural fact for the cascade auditor: **the cascade is admin-driven and executed from the browser. No server process sends the next offer automatically.** The `expire-offers` cron only *names* the next candidate in an admin email (`src/app/api/cron/expire-offers/route.ts:128-136`).

### 1.6 Auth on the client
- `src/hooks/use-user.ts` subscribes to `supabase.auth.onAuthStateChange`.
- Login and signup use email/password and Google OAuth (`src/components/auth/login-form.tsx:44-70`, `signup-form.tsx:38-64`).
- Onboarding calls the RPC `create_organization_with_owner` directly from the browser (`src/components/auth/onboarding-form.tsx:102`).

---

## 2. Backend: API route handlers

### 2.1 Auth helpers (`src/lib/api-helpers.ts`)
| Helper | What it does |
|---|---|
| `requireAuth()` (`:32`) | Cookie client + `auth.getUser()`, else 401 |
| `requireOrgAdmin()` (`:43`) | Above, plus `organization_members.select(...).eq('user_id').single()`; role must be owner/admin, else 403. Relies on one-org-per-account (`.single()`) |
| `requireOrgPlan()` (`:67`) | Above, plus reads billing columns with the **service-role** client and runs `resolveOrgPlan` |
| `requireIntakeEnabled()` (`:101`) | Above, plus `organizations.intake_enabled`, failing closed with **404**. Also returns `libraryOrgId` (shared-library pointer) |
| `resolveLibraryOrgId()` (`:136`) | Fails open to the caller's org |
| `getOrgPlan(orgId)` (`:156`) | Plan for routes that do their own auth. Fails closed to `free` when billing is on, returns `null` when off |
| `getOrgVertical(orgId)` (`:181`) | Vertical template, fails open to default |
| `serverError(ctx, err)` (`:22`) | `console.error` + `Sentry.captureException` + generic 500 body |
| `apiSuccess` / `apiError` | JSON helpers |

**Adoption is partial:**
- 29 of 81 routes use a `require*` helper.
- 26 routes do their own inline `organization_members` lookup with the same owner/admin check (examples: `positions/[positionId]/assign/route.ts:17-62`, `rescind-offer/route.ts:15-72`, `unassign/route.ts:14-67`, `substitutions/[requestId]/approve/route.ts:15-83`, `payments/export/route.ts:9-27`, `musicians/[id]/w9/route.ts:10-41`, `venues/lookup/route.ts:34-56`, `admin/fix-venues/route.ts:51-68`).
- `docs/hardening-2026-09.md` lists consolidating these "25 hand-rolled admin checks" as a second-pass item that was not done.
- Only 21 of 81 routes use `serverError()`. The rest return `NextResponse.json({error}, 500)` or `apiError(error.message, 500)`, which can leak Postgres text (for example `payments/generate/route.ts:150-152`).

### 2.2 Clients
- `src/lib/supabase/server.ts:createClient()`: cookie-bound user client (anon key, RLS).
- `src/lib/supabase/server.ts:createServiceClient()` and `src/lib/supabase/admin.ts:createAdminClient()`: **two identical service-role factories** (the admin one omits `persistSession:false`).
- `src/lib/supabase/client.ts`: browser client.
- **55 of 81 routes instantiate a service-role client.** The README rule is that anything acting for a musician (token flows) must use the service client and check the token itself (`README.md:63-64`). `tasks/lessons.md:46-57` goes further ("never rely on createClient() for cross-table reads in server components ... use createServiceClient()"). In practice, tenant isolation in those routes is enforced by hand-written filters, not RLS.

### 2.3 Routes grouped by domain
Auth key: **U** = user client, **S** = service/admin client, **H** = helper (`requireOrgAdmin` / `requireOrgPlan` / `requireIntakeEnabled`), **I** = inline membership check, **T** = token is the credential, **C** = `requireCronAuth`, **Sig** = signature verification.

**Offers and cascade (staffing core)**
| Route | Methods | Auth / client |
|---|---|---|
| `api/offers/send-email` | POST | U+I, S for sends; expires rival offers, sends offer email, logs |
| `api/offers/send-reminder` | POST | U+I |
| `api/offers/preview-email` | POST | U |
| `api/offers/[offerId]/calendar` | GET | T (`?token=` must equal offer token) **or** U org admin (`:103-161`); S |
| `api/positions/[positionId]/assign` | POST | U+I (manual assign) |
| `api/positions/[positionId]/unassign` | POST | U+I; offer → `released` instead of DELETE (`:91-104`) |
| `api/positions/[positionId]/rescind-offer` | POST | U+I; status-conditioned update |
| `api/positions/[positionId]/next-candidates` | GET | U (`getNextCandidates`) |
| `api/projects/[projectId]/auto-populate` | POST, PUT | U+I |
| `api/gig/[token]/accept` | POST | T, S; `claimChairForAccept` (`src/lib/offers/respond.ts`) |
| `api/gig/[token]/decline` | POST | T, S |
| `api/gig/[token]/request-sub` | POST | T, S, `getOrgPlan` |
| `api/substitutions/[requestId]/approve` | POST | U+I; 8 writes, compensating revert |
| `api/substitutions/[requestId]/decline` | POST | U+I |

**Gig logistics (details, music, files, reminders, reports)**
| Route | Methods | Auth |
|---|---|---|
| `api/projects/[projectId]/send-gig-details`, `send-gig-details-reminder`, `gig-details-status` | POST/GET | U+I, `getOrgPlan`, S |
| `api/projects/[projectId]/send-music`, `send-music-reminder`, `music-status` | POST/GET | U+I, `getOrgPlan`, S |
| `api/projects/[projectId]/files` (GET, POST), `files/upload-url`, `files/[fileId]` (DELETE), `files/[fileId]/download` | | U+I, S (Supabase Storage `project-files`) |
| `api/music-download/[fileId]` | GET | T (`?token=` = music_confirmations token), S |
| `api/confirm-details/[token]`, `api/confirm-music/[token]` | POST | T, S |
| `api/pre-gig-reminders/[reminderId]` (GET), `/approve` (POST) | | U+I, S |
| `api/reminder-templates`, `/[templateId]` | GET/POST/DELETE | U |
| `api/projects/[projectId]/gig-lead` | PUT | H, S |
| `api/projects/[projectId]/gig-report` | POST | H, S (admin "send again") |
| `api/report/[token]` | POST | T, S, **in-memory** `rateLimit` (`src/lib/rate-limit.ts`) |

**Roster / musicians / W-9**
| Route | Auth |
|---|---|
| `api/musicians/import` (POST) | `requireOrgPlan` (bulk import gate) |
| `api/musicians/send-w9-request` (POST) | U+I, `getOrgPlan`, S |
| `api/musicians/[id]/w9` (GET) | U+I, S; signed URL into `w9-documents` |
| `api/w9/[token]` (POST) | T (`musicians.w9_request_token`, expiry checked `:44`), S |
| `api/organization/seed-skills` (POST) | H, S (vertical seeding) |

**Payments**
| Route | Auth |
|---|---|
| `api/payments/generate` (POST) | H (U client); app-level dedupe + partial unique index |
| `api/payments/bulk-update` (PATCH) | H |
| `api/payments/export` (POST) | U+I, `getOrgPlan`; XLSX, stamps `exported_at`/`export_batch_id` |

**Billing (Stripe)**
| Route | Auth |
|---|---|
| `api/billing/checkout` (POST), `api/billing/portal` (POST) | H, S |
| `api/billing/webhook` (POST) | Sig (`constructEvent`), S; `stripe_events` dedupe |

**Music library / intake / book builder (music-specific)**
14 routes, 2,776 lines, all behind `requireIntakeEnabled` (fail-closed 404) + S:
- `api/intake/[projectId]` (GET/PUT), `/approve-books`, `/book`, `/book-cover`, `/spotify-playlist`, `/spotify-proposals`
- `api/intake/alias`, `/parse`, `/repertoire`
- `api/library/search`, `/works/[workId]` (PATCH), `/works/[workId]/parts` (POST), `/parts/[partId]` (GET/PUT/DELETE), `/parts/[partId]/versions` (GET/POST)
- `api/repertoire/add-work`, `/upload-url`
- `api/spotify/connect`, `/callback`, `/status`: H, S

**Settings / org / members**
| Route | Auth |
|---|---|
| `api/settings/organization`, `/email-branding` (PATCH) | H |
| `api/settings/members` (GET/POST), `/[memberId]` (PATCH/DELETE) | U+I, S (`auth.admin.listUsers`) |
| `api/settings/profile/password` (POST) | U, S (`auth.admin.updateUserById`) |
| `api/auth/welcome-email` (POST) | U |
| `auth/callback` (GET) | OAuth/email code exchange; RPC `link_musician_records_to_user` |

**Venues**
`api/venues` (POST, S), `api/venues/lookup` (GET, U+I then S; Google Places), `api/admin/fix-venues` (POST, U+I).

**Webhooks and crons**
`api/webhooks/resend` (Sig/Svix, S) and 7 × `api/cron/*` (C, S). Both are covered in section 7.

### 2.4 Scaling-relevant implementation details
- `getOrgAdminEmails()` makes one `auth.admin.getUserById` call per admin, sequentially (`src/lib/supabase/server.ts:128-150`). Every cron calls it per project or offer.
- `api/settings/members` GET loads **all platform auth users** with `listUsers({perPage:1000})` to map emails (`route.ts:42`). It is cross-tenant and breaks past 1,000 users.
- Member invite (`route.ts:114`) calls `listUsers()` with the **default page size** and searches the first page only. Inviting an existing account fails silently with "No account found" once the platform passes one page of users.
- Code uses `as any` / `: any` at 359 sites. Clients are untyped (see section 4).

---

## 3. Database

### 3.1 Inventory
- Supabase Postgres, one production project (`docs/runbooks/database-safety.md:8`: ref `cyspguwdocseisjyjqmu`).
- **40 tables** created across migrations. 37 are referenced from app code. Never read or written by `src/`: `app_settings` (read only by SQL triggers), `impersonation_log` (created in `028_add_impersonation_log.sql`, no writers), `musician_notification_preferences` (`016_add_musician_portal.sql`, dead since the portal was removed).
- Most-used tables by `.from()` count:

| Table | Count |
|---|---|
| organization_members | 64 |
| project_positions | 52 |
| contract_offers | 43 |
| musicians | 40 |
| projects | 36 |
| organizations | 24 |
| services | 23 |
| instruments | 20 |
| substitution_requests | 17 |
| payments, musician_instruments | 15 each |

### 3.2 How migrations are managed
- `supabase/migrations/001_initial_schema.sql` … `090_gig_lead.sql`: 90 files, contiguous numbering, no duplicates.
- There is **no Supabase CLI link, no migration runner, and no `schema_migrations` tracking.** `README.md:68-72`: "Merging a PR ships the code. It does **not** run the SQL ... Someone has to paste the file into the Supabase SQL editor."
- **080/081 incident** (`README.md:72`): `080_enforce_plan_limits.sql` and `081_protect_privileged_org_columns.sql` "sat unapplied for days in August 2026 while their PRs showed as merged." The response was process, not tooling:
  - A PR template checkbox (`.github/pull_request_template.md`).
  - Paste-ready bundles with HOW TO RUN headers and RESULTS checks (`scripts/*-2026-*.sql`).
  - A house rule: migration before code, and code must tolerate an unapplied migration. Examples: `resolveLibraryOrgId` fails open "so the code can ship before migration 075 is applied" (`api-helpers.ts:127-134`), and `getOrgVertical` fails open "column not migrated yet".
- `docs/runbooks/database-safety.md:15-25` checklist: JSON backup, then staging replay, then SQL editor in prod, then `-- verify:` queries, then push code.
- Staging is **paused** (`docs/runbooks/staging.md:5-10`). `scripts/staging-replay.sql` says "regenerated 2026-07-11 from 001-065", though later fragments mention 084.
- `docs/hardening-2026-09.md` "Second pass" lists "Supabase CLI-linked migrations so 'merged' and 'applied' stop meaning different things". Not done.
- Deployed DB state can only be confirmed by hand: "tables and columns can be probed over REST, but triggers, functions and policies only show in the SQL editor" (`README.md:72`).

### 3.3 Is `supabase/schema.sql` in sync?
**No.** It is a stale baseline and should not be trusted or used:
- It has 13 tables (534 lines). The 27 tables added by later migrations are missing, including `payments`, `venues`, `email_logs`, `project_files`, `pre_gig_reminders`, `stripe_events`, `app_settings`, `gig_reports`, and every repertoire/intake table.
- It still contains the policies `"Public can view contract offers by token"` / `"Public can update contract offers by token"` with `USING (token IS NOT NULL)` (`schema.sql:413-419`). Migration `019_fix_onboarding_and_rls_gaps.sql:53-54` dropped them. Anyone bootstrapping from `schema.sql` would recreate a world-readable and world-writable `contract_offers`.
- Its last commit is `199291a` (2026-08-03), and that commit only touched the org privilege area.

### 3.4 Logic inside the database
There are 16 distinct SQL functions and 17 triggers across migrations:
- RLS helpers (`001_initial_schema.sql:168-185`): `is_org_member(org_id)`, `is_org_admin(org_id)`, both SECURITY DEFINER.
- Musician-portal helpers, still present: `get_musician_org_ids`, `get_musician_ids_for_auth_user`, `get_musician_project_ids` (`034_fix_musician_rls_recursion.sql`), `link_musician_records_to_user` (031/074), `activate_musician_by_token` / `get_musician_by_invite_token` (016/049).
- Onboarding: `create_organization_with_owner` (5 versions; the runbook warns it may only change via DROP+CREATE in one transaction, `database-safety.md:58-59`).
- Billing enforcement (`080_enforce_plan_limits.sql`): `org_plan_tier`, `org_plan_limit`, and triggers `enforce_musician_limit` / `enforce_project_limit`. These read the single-row `app_settings.billing_enforced` kill switch.
- `protect_privileged_org_columns` trigger (`081`): freezes billing/flag columns on `organizations` against self-update.
- `update_updated_at_column` and similar timestamp triggers.

### 3.5 RLS model (overview only)
- RLS is enabled on every table (`047_ensure_rls_all_tables.sql`). There are 125 `CREATE POLICY` and 30 `DROP POLICY` statements across migrations.
- **Org staff:** `organization_members(organization_id, user_id, role ∈ owner|admin|member)`. Policies key off `is_org_member` / `is_org_admin`. Members can read, admins can write. The API additionally restricts nearly every route to owner/admin.
- **Musicians:** not org members (`README.md:63`). Portal-era policies keyed on `musicians.user_id = auth.uid()` still exist (for example `034_fix_musician_rls_recursion.sql:52-54`), but nothing in the app creates musician sessions now. Musicians act only through token routes using the **service role**, so tenant isolation for every musician-facing path is enforced in TypeScript.
- **Service-only tables:** `stripe_events`, `app_settings` (RLS on, no policies), `gig_reports` (admin read, service writes; `089_after_gig.sql:66-71`).
- **Storage:** `085_project_files_storage_org_scope.sql` scopes `project-files` objects to the org folder. Before it, any logged-in user in any tenant could read or delete any object (`085:3-21`).

---

## 4. ORM / data layer

- **No ORM.** Raw `@supabase/supabase-js` 2.90 query builders everywhere, plus `@supabase/ssr` for cookie clients.
- **Types:** `src/types/database.ts` (975 lines) is **hand-written** and covers 19 tables. Several are added as "manual type" interfaces (for example `EmailLog`, `database.ts:870`). The clients are **not** parameterized with `Database`: `src/lib/supabase/server.ts:7` and `client.ts:5` carry the TODO comment "generate types ... Then import and use createServerClient<Database>". Query results are untyped and commonly cast with `as any` (for example every cron handler: `const musician = offer.musician as any`).
- **Domain modules in `src/lib`:**
  - `offers/respond.ts`: shared accept/decline and chair claim.
  - `next-candidate.ts`: call-order candidate selection.
  - `schedule-conflict.ts`, `payments/compute.ts` (single pay rule), `projects/archive.ts` (completion rule, timezone-aware), `after-gig/{rules,run,report-token}.ts`.
  - `verticals/*`: 667 lines; 7 templates in `verticals/templates/` (choir, church-worship, dance, event-agency, music-contractor, orchestra-band, theatre) plus terminology dictionaries used by 48 components.
  - `plan.ts`, `org-membership.ts`, `venue-*.ts`, `zip-*.ts`, `import/parse-musicians.ts`, `musicians/duplicates.ts`, `music/confirm-receipt.ts`.
  - `intake/*`, `repertoire/*`, `spotify*.ts`: the music subsystem.
- **RPCs called from app code** (complete list from `grep '.rpc('`):
  1. `create_organization_with_owner`, from the browser onboarding form (`src/components/auth/onboarding-form.tsx:102`).
  2. `link_musician_records_to_user`, from `src/app/auth/callback/route.ts:39`.

  **No RPC is used for atomicity in any business flow** (offers, subs, payments, crons). Atomicity relies on conditional updates. See section 7.6.

---

## 5. Authentication and identity

| Actor | Mechanism | Evidence |
|---|---|---|
| Org staff (owner/admin/member) | Supabase Auth (email+password, Google OAuth), cookie session via `@supabase/ssr` | `src/components/auth/*`, `src/lib/supabase/middleware.ts` |
| Org membership | `organization_members`; **one account = one org** enforced by `UNIQUE(user_id)` | `077_one_org_per_account.sql`. The constraint comment says "~38 API routes resolve the caller org via .single() ... a second membership silently breaks that account". `dashboard/layout.tsx:30` picks the first membership defensively |
| Musicians | **No accounts.** Each musician-facing flow has its own bearer token in the URL | see below |
| Platform admin | No in-app superuser role. `PLATFORM_ADMIN_EMAIL` only receives welcome-copy and ops-alert emails | `src/lib/cron.ts:110`, `api/auth/welcome-email/route.ts:6` |
| Cron | `Authorization: Bearer ${CRON_SECRET}`, fails closed when unset | `src/lib/cron.ts:36-50` |
| Webhooks | Stripe `constructEvent`; Resend Svix HMAC with 5-min tolerance | `api/billing/webhook/route.ts:115`, `api/webhooks/resend/route.ts:41-130` |

**Token-based no-login flows:**
| Flow | Token source | Expiry / limits |
|---|---|---|
| `/gig/[token]` + `api/gig/[token]/*` | `contract_offers.token` VARCHAR UNIQUE, DB default `encode(gen_random_bytes(32),'hex')` (`schema.sql:153`) | Offer status/`expires_at`; token never rotates. Runbook: "never touch ... the /gig/[token] URL shape" (`database-safety.md:52`) |
| `/confirm-details/[token]`, `/confirm-music/[token]`, `api/music-download/[fileId]?token=` | `gig_detail_confirmations.token` / `music_confirmations.token` (`replace(gen_random_uuid()::text,'-','')` defaults) | None found |
| `/w9/[token]` | `musicians.w9_request_token` (`078_w9_upload_tokens.sql`), partial unique index; cleared on upload | `w9_request_expires_at` checked (`api/w9/[token]/route.ts:44`) |
| `/report/[token]` | `gig_reports.token`, `randomBytes(32)` (`src/lib/after-gig/run.ts:177`) | In-memory 10/10 min per token (`api/report/[token]/route.ts:27`) |
| `api/offers/[offerId]/calendar?token=` | offer token | |

**Impersonation:** the `impersonation_log` table exists (`028`), and `resolveMusicianIds(..., impersonateId)` exists in `src/lib/supabase/server.ts:54`. Neither is used. There is no impersonation feature today.

---

## 6. Hosting and deployment

- **Vercel**, production deploys on push to `master` (`README.md:13,111-116`).
- `vercel.json` `ignoreCommand`: `if [ "$VERCEL_GIT_COMMIT_REF" = "master" ]; then exit 1; else exit 0; fi`. Exit 0 means skip the build, so **only `master` builds**, and branch/PR preview deployments are effectively disabled. `docs/runbooks/database-safety.md:9-11` still warns that "Vercel preview deploys point at this same database", so that doc is stale on this point, but the warning still applies if previews come back: there is one DB for everything.
- No `maxDuration`, `runtime` or `dynamic` exports in any route (grep found none). `src/lib/cron.ts:209` assumes a "300s function limit".
- Several crons run sub-daily (hourly, every 15 min). That implies a Vercel paid plan. The plan is not stated in the repo.
- `next.config.ts`: security headers (X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy), `proxyClientMaxBodySize: '50mb'`, wrapped in `withSentryConfig` (source maps only when `SENTRY_AUTH_TOKEN` is set).
- **CI** (`.github/workflows/ci.yml`): on every PR and push to master, Node 24, runs `npm ci`, then `tsc --noEmit`, then `npm run lint` (**advisory**, `continue-on-error: true`; 712 errors on 2026-09-01, 328 per `tasks/todo.md:433`), then `npm test` with `RESEND_API_KEY=re_ci_placeholder`. CI does not run `next build`, does not apply or check migrations, and runs no E2E.
- Deploy discipline is manual (`README.md:111-116`). Lessons about Vercel ignore rules skipping builds: `tasks/lessons.md:280-292`.

### 6.1 Environment variables (`.env.example`, plus `process.env` grep)
| Category | Vars |
|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| App | `NEXT_PUBLIC_APP_URL` |
| Google | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (client autocomplete and server lookup) |
| Email (Resend) | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`, `EMAIL_SAFE_MODE`, `EMAIL_ALLOWLIST` |
| R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (default `podium-repertoire`, `src/lib/storage/r2.ts:22`) |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_ENSEMBLE_PRICE_ID`, `STRIPE_ORCHESTRA_PRICE_ID`, `STRIPE_SYMPHONY_PRICE_ID`, `NEXT_PUBLIC_BILLING_ENABLED` |
| Cron | `CRON_SECRET`, `CRON_ENABLED` |
| Spotify | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` |
| Ops | `PLATFORM_ADMIN_EMAIL` |
| Sentry | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` |
| Runtime-provided | `VERCEL_ENV`, `NEXT_PUBLIC_VERCEL_ENV`, `NODE_ENV`, `NEXT_RUNTIME` |
| Scripts only | `PODIUM_ORG_ID`, `REPERTOIRE_INDEX`, `UPLOAD_CLASSIFICATIONS` (`scripts/repertoire-upload.js`). Scripts parse `.env.local` themselves |

### 6.2 Feature flags and kill switches that exist today
| Flag | Scope | Default | Evidence |
|---|---|---|---|
| `EMAIL_SAFE_MODE` + `EMAIL_ALLOWLIST` | Global env | **ON when unset** (fail-safe) | `src/lib/email/client.ts:29-64` |
| `CRON_ENABLED` | Global env | Enabled when unset; `keepalive` ignores it | `src/lib/cron.ts:14-18,57-61` |
| `NEXT_PUBLIC_BILLING_ENABLED` | Global env (inlined into the client bundle) | Off, so every org resolves to Symphony | `src/lib/plan.ts` `isBillingEnabled`/`resolveOrgPlan` |
| `app_settings.billing_enforced` | Global DB single row | false | `080_enforce_plan_limits.sql`. Must be flipped **together** with the env var (`.env.example` BILLING section). `tasks/todo.md:366` still has "confirm billing_enforced" open |
| `organizations.is_comped` | Per org | false | `066_billing_tiers.sql` |
| `organizations.intake_enabled` | Per org (music library / book builder) | off, fail-closed 404 | `requireIntakeEnabled` |
| `organizations.library_org_id` | Per org shared-library pointer | null, so own library | `075_org_shared_library.sql`, `api-helpers.ts:136` |
| `organizations.vertical` | Per org terminology/template | `music_contractor` | `065_add_org_vertical.sql`, `src/lib/verticals/registry.ts:10` |
| `organizations.disable_staffing_alerts` | Per org | false | `api/cron/staffing-alerts/route.ts:95` |
| Plan tier gates | Per org (`canUseEmailFeatures`, `canBulkImport`, ...) | | `src/lib/plan.ts` |

There is no general feature-flag service and no per-user flags.

---

## 7. Background jobs, webhooks and concurrency

### 7.1 There is no queue
There is no queue, outbox, job table, worker or scheduler beyond Vercel Cron. Every async side effect, whether email, next-candidate suggestion, pay summary or reminder, happens either **inline in the HTTP request** or in a **cron that polls tables**. Emails inside a request are sent synchronously and throttled in-process at 600ms each (section 8). A route that emails N people takes about 0.6·N seconds. If it fails mid-loop, the partial sends cannot be resumed except by re-running the action.

### 7.2 Cron inventory (`vercel.json`; all GET, all UTC)
| Path | Schedule (UTC) | What it does | Idempotency / claim | Kill switch |
|---|---|---|---|---|
| `/api/cron/expire-offers` | `17 * * * *` (hourly :17) | Selects `contract_offers` with status pending/viewed and `expires_at < now()`. Per offer: (1) `UPDATE status='expired' WHERE id AND status IN (pending,viewed)` as an optimistic lock (`route.ts:86-101`); (2) if no other pending/viewed/accepted offer on the position, vacate it (`musician_id=null, status='vacant'`) (`:109-126`); (3) `getNextCandidates(...,1)` to **name** the next candidate (no offer is sent); (4) email org admins `offer_expired` + `logEmail` | Status-conditioned update. Steps 1 and 2 are not atomic together (check-then-update on the position) | `CRON_ENABLED` |
| `/api/cron/offer-reminders` | `23 12 * * *` (daily 12:23 UTC = 5:23am PDT) | Offers pending/viewed, expiring within the next 24h, `reminder_sent_at IS NULL`. **Claims first** with `UPDATE reminder_sent_at WHERE reminder_sent_at IS NULL` (`:94-110`), then emails the musician (`offer_reminder_auto`) and admins (`offer_expiring_soon`) | Claim-before-send. A failed send is **not** released, so there is no retry (at-most-once) | `CRON_ENABLED` |
| `/api/cron/complete-projects` | `37 9 * * *` | UTC pre-filter `end_date < utcToday`, then `isReadyToComplete(end_date, now, org.timezone)` (`src/lib/projects/archive.ts`), then one bulk `UPDATE status='completed' WHERE id IN (...) AND status='active'` | Conditional bulk update | `CRON_ENABLED` |
| `/api/cron/keepalive` | `41 6 */3 * *` | `select id from organizations limit 1` so the free-tier Supabase project doesn't pause | n/a | **Ignores `CRON_ENABLED`** (by design) |
| `/api/cron/pre-gig-reminders` | `29 8,18 * * *` | (1) Expires stale `pre_gig_reminders` drafts. (2) Loads **all active projects with all services/positions** (no date filter in SQL, `:268-303`); for projects whose earliest service is 24–72h away and that have confirmed musicians, inserts a draft `pre_gig_reminders` row and emails admins a "review reminder" link. The admin approves via `api/pre-gig-reminders/[id]/approve`, which sends to musicians | Check-then-insert, backed by `UNIQUE(project_id, trigger_date)` (`053_pre_gig_reminders.sql:13`); a duplicate insert fails, so no second email | `CRON_ENABLED` |
| `/api/cron/staffing-alerts` | `43 14 * * *` | Loads **all active projects** with services and positions; for projects ≤14 days out with unfilled positions, emails admins once per (project, threshold). Dedupe via `email_logs` lookup on `email_type='staffing_alert' AND metadata->>threshold` | Check-then-send against the email log. Not atomic; relies on `logEmail` succeeding (which swallows errors), so a logging failure means a daily re-send | `CRON_ENABLED` + per-org `disable_staffing_alerts` |
| `/api/cron/after-gig` | `4,19,34,49 * * * *` (every 15 min) | Projects active/completed with `end_date` in [today−3, today+1] UTC; `isAfterGigDue` = last service ended 30 min–48h ago (`src/lib/after-gig/rules.ts:13,20`). `sendPaySummaryOnce` claims `projects.pay_summary_sent_at` before sending and **releases the claim on failure** (`src/lib/after-gig/run.ts:77-132`). `requestGigReports` inserts `gig_reports` (UNIQUE(project_id, musician_id); a 23505 means another run owns it) and emails the gig lead | Claim with release and retry; unique constraint | `CRON_ENABLED` |

**Bug found in staffing-alerts thresholds** (`src/app/api/cron/staffing-alerts/route.ts:10,90`):
```ts
const THRESHOLDS = [14, 7, 3]
const threshold = THRESHOLDS.find((t) => daysAway <= t)   // "use the tightest matching threshold"
```
`find` returns the **first** match, so any `daysAway ≤ 14` maps to `14`. The 7-day and 3-day alerts never fire. After the first alert, every later run finds the existing `threshold=14` log and skips. Each project gets at most one staffing alert. No test covers this route's behavior.

### 7.3 Cron auth, alerting, retry (`src/lib/cron.ts`)
- **Auth:** `requireCronAuth` is the first line of every handler. It fails closed if `CRON_SECRET` is blank, because the earlier inline form treated `"Bearer undefined"` as valid (`cron.ts:20-50`).
- **Kill switch:** `cronDisabledResponse(job)` returns `{skipped:true}` when `CRON_ENABLED` is false-ish.
- **Job-level failure:** `runCronJob(name, fn)` catches anything thrown and calls:
  - `notifyOps`: `Sentry.captureException` plus a best-effort email to `PLATFORM_ADMIN_EMAIL` through the normal `sendEmail` path, so safe mode applies.
  - `serverError`: a generic 500.
  Per-item failures inside loops are **counted and returned in the 200 body** (`emailFailures`), not alerted. A cron that "succeeds" with 100% send failures sends no alert.
- **Retry:** `withCronRetry(label, make)` retries only *transient* supabase results (status 0 or 5xx) with 5 attempts at 1/2/4/8s, about 45s total (`cron.ts:180-226`). Sized from a 2026-09-14 production trace of gateway 504s (`tasks/lessons.md:225-235`). It wraps only the **initial fetch** in each cron. Per-item updates and inserts are not retried.
- **No run ledger:** there is no `cron_runs` table, no heartbeat or "last success" record, and no alert when a cron silently stops running. `automaticVercelMonitors: false` in `next.config.ts`.
- **Overlap:** Vercel can deliver duplicate or overlapping invocations. offer-reminders, after-gig, expire-offers and complete-projects are overlap-safe via conditional claims. pre-gig is safe via a unique constraint. staffing-alerts is **not** overlap-safe (two concurrent runs can both pass the `email_logs` check).
- `cron-schedules.test.ts` asserts every cron minute field is non-zero (off-:00 jitter).

### 7.4 Timezone handling
- **Schedules are UTC** (Vercel cron), and the daily jobs are fixed UTC times regardless of org timezone. `offer-reminders` at 12:23 UTC is 5:23am Pacific / 8:23am Eastern, and the reminder lead time ranges from 0 to 24h depending on when the offer expires relative to that single daily run.
- `org.timezone` (default `DEFAULT_TIMEZONE = 'America/Los_Angeles'`, `src/lib/utils.ts:9`) is used for:
  - **display formatting** in every email;
  - the completion rule (`isReadyToComplete`, timezone-aware since 2026-09-27);
  - the after-gig date pre-filter widening.
- Pre-gig (24–72h) and staffing-alert (`daysAway = floor(ms/86400000)`) windows are computed from absolute UTC milliseconds, not org calendar days.
- **Offer expiry entered as a date** is turned into a timestamp **in the admin's browser timezone**: `new Date(customDeadline + 'T23:59:59')` (`src/components/projects/send-offer-dialog.tsx:480`), not the org timezone. Expiry granularity is also bounded by the hourly `:17` run, so offers expire up to about 60 minutes late.
- `v2-strategy.md` lists "crons run UTC not org-timezone" as known debt (§1). That was only partially addressed (completion rule).

### 7.5 Webhooks
**Stripe (`src/app/api/billing/webhook/route.ts`):**
- Verifies the signature with `constructEvent` (`:115`).
- Inserts `stripe_events(id PK, type)` (`064_stripe_event_idempotency.sql`) before processing. A `23505` duplicate returns `{received:true, duplicate:true}` (`:131-139`). Any other dedupe-insert error is logged and processing **continues** (`:139`).
- Handles `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.payment_failed` (plus dunning email via `src/lib/email/billing-notices.ts`), and `invoice.paid`.
- Each org update goes through `applyOrgUpdate()`. If it fails, it **deletes the dedupe row** and returns 500 so Stripe retries (`:79-103`). This is a compensating delete rather than a transaction.
- **No ordering protection:** `subscription.updated` writes `plan_tier` / `subscription_status` with no comparison of `event.created` or subscription version. An out-of-order older event can overwrite newer state.

**Resend (`src/app/api/webhooks/resend/route.ts`):**
- Svix HMAC-SHA256, constant-time compare, 5-minute tolerance, fails closed when the secret is unset (`:108-130`).
- Handles `email.bounced`, `email.complained` and `email.delivered`; all other types are acked.
- Looks up `email_logs` by `resend_email_id` with `.maybeSingle()` (`:96-106`). That call errors (and returns null) if more than one log row shares the id.
- Bounce or complaint sets `email_logs.status` and `musicians.email_status` (`087_musician_email_status.sql`). Delivered resets `bounced` to `ok`.
- **No event dedupe table.** The writes are idempotent assignments, so replays are harmless, but there is no ordering (a late `delivered` after a `bounced` can reset the status).

### 7.6 Transactional boundaries
There are no transactions anywhere in application code: no `BEGIN`, and no RPCs for business writes. Multi-step writes rely on three patterns:

1. **Optimistic conditional updates ("claims").**
   - `claimChairForAccept` (`src/lib/offers/respond.ts:57-80`): offer `UPDATE ... WHERE status IN (pending,viewed)`, then position `UPDATE ... WHERE musician_id IS NULL` (or `= original` for subs). If the second step finds nothing, it reverts the offer. Its comment says this is "what make[s] a double-book impossible without a transaction".
   - Also: rescind (status-conditioned), expire-offers, the offer-reminders claim, the after-gig pay-summary claim.
2. **Compensating writes on failure.**
   - Substitution approve: `substitution_requests` → `approved` first, and revert to `pending_approval` on downstream failure (`api/substitutions/[requestId]/approve/route.ts:92-123`). The route then performs up to 8 writes in sequence: maybe insert a musician, insert `musician_instruments`, expire the old offer, insert the sub offer, update the request, rescind, update the position (`:143-270`), then send 3 emails. A crash between steps leaves partial state, and only some steps are compensated.
   - Stripe dedupe-row delete. After-gig claim release.
3. **Unique constraints as idempotency backstops.**
   - `pre_gig_reminders(project_id, trigger_date)`, `gig_reports(project_id, musician_id)`, `payments_standard_unique(service_id, musician_id, is_leader_fee) WHERE payment_type='standard'` (`027_relax_payment_unique_constraint.sql`), `stripe_events.id`, `musicians.w9_request_token`.
   - `payments/generate` also does an app-level existing-key filter before a bulk insert (`route.ts:120-152`).

**Multi-step writes with no atomicity or compensation:**
- **Browser-side offer creation** (section 1.5): check, insert offer, update position, then the email route.
- `expire-offers`: expire the offer, then check other offers, then vacate the position.
- `unassign`, `assign`, `rescind-offer` (3 writes each), `repertoire/add-work` (5), `intake/[projectId]` PUT (4), `library/parts/*` (3).
- `w9/[token]`: storage upload, then a DB update, with orphan cleanup on failure (`:80-143`).
- Onboarding is the exception: org + owner membership + seeding go through a single RPC (`create_organization_with_owner`).

DB-side atomic guards that do exist are **triggers**: plan limits (`080`), privileged org columns (`081`), payments `ON DELETE RESTRICT` (`062_protect_payment_records.sql`).

---

## 8. Email system

### 8.1 Components (`src/lib/email/`)
- **`client.ts` (109 lines).**
  - Resend SDK singleton. From address is `EMAIL_FROM_NAME <EMAIL_FROM_ADDRESS>` (default `hello@podiumpersonnel.com`); `buildFromAddress(displayName)` sanitizes org display names.
  - **Safe mode:** `EMAIL_SAFE_MODE` defaults ON. `filterRecipients()` splits into allowed and suppressed against `EMAIL_ALLOWLIST` (`:29-64`).
  - **Throttle:** `awaitResendSlot()` reserves the next 600ms slot (`RESEND_MIN_INTERVAL_MS`, `:87-96`). The slot state is a **module-level variable** (`let nextResendSlotAt`, `:89`), so it paces only within one serverless instance. Concurrent Vercel instances (cron + user requests) are not coordinated against Resend's 2 req/s limit.
- **`send.ts` (1,296 lines). The single send path.**
  - Private `sendTransactional()` (`:109-182`): renders React Email to HTML and text, resolves Reply-To (explicit, else org owner's email via `getOrgOwnerEmail`, else default), applies the safe-mode filter, calls `awaitResendSlot`, calls `resend.emails.send` with `List-Unsubscribe` headers, and throws on a Resend error.
  - Returns `{id, emailHtml, subject, suppressed, suppressedRecipients}`. A fully suppressed send returns `suppressed:true` and must not be treated as delivered (A6 fix).
  - Generic `sendEmail()` (`:880-918`) duplicates the same gate for raw-HTML sends (ops alerts, dunning).
  - 27 exported `send*Email` functions. Each resolves vertical terminology (`resolveEmailTerms` → `getOrgVertical`, a DB read per send).
- **`log.ts`.** `logEmail()` inserts into `email_logs` with organization_id, recipient_email/name, subject, email_type, musician_id, project_id, offer_id, resend_email_id, status (default `'sent'`), metadata jsonb, and body (the HTML converted to plain text). It **never throws**.
  - 28 call sites. Only 4 call sites (in 3 files: `api/offers/send-email`, `api/report/[token]`, `lib/after-gig/run.ts`) pass `status: 'suppressed'` when safe mode blocked a send. All other sites (all crons except after-gig, music/gig-details sends, subs, etc.) **log suppressed sends as `'sent'`**.
  - Multi-recipient admin emails log only `recipientEmail: adminEmails[0]`, with the full list in `metadata.allRecipients`.
- **`billing-notices.ts`:** payment-failed dunning email via `sendEmail`.
- No unsubscribe handling. `List-Unsubscribe` is a mailto to the from address. `musician_notification_preferences` (portal era) is unused, so **there are no per-recipient preferences**, and the email path never consults `musicians.email_status`, so bounced addresses are still sent to. Status is only displayed as a roster badge (`src/components/musicians/musicians-client.tsx:522-532`).

### 8.2 Templates (`src/lib/email/templates/`, React Email)
| Template | Purpose |
|---|---|
| `contract-offer` | The offer to a musician, with accept/decline link |
| `offer-reminder` | Musician reminder before an offer expires (manual and cron) |
| `offer-accepted` / `offer-declined` | Confirmation to the musician after responding |
| `offer-rescinded` | Tells a musician an offer was withdrawn |
| `admin-offer-response` | Admin notice that a musician accepted/declined |
| `admin-offer-sent` | Admin copy/notice that an offer went out (used in sub approval) |
| `offer-expired` | Admin notice that an offer expired, naming the next candidate |
| `offer-expiring-soon` | Admin heads-up 24h before expiry |
| `position-unassigned` | Musician (and admin variant) notice of removal from a chair |
| `admin-sub-request` | Admin notice that a musician requested a substitute |
| `sub-request-approved` / `sub-request-declined` | Musician outcome of a sub request |
| `musician-released` | Original musician released when the sub accepts |
| `sub-declined-find-another` | Sub declined; the original musician is asked to find another |
| `gig-details`, `gig-details-reminder` | Logistics packet to confirmed musicians, plus nudge |
| `music-uploaded`, `music-reminder` | Sheet-music availability to musicians, plus nudge |
| `pre-gig-notification` | Admin "gig in ~2 days, review reminder" |
| `staffing-alert` | Admin: unfilled positions as the gig approaches |
| `pay-summary` | Admin after-gig "who to pay what" |
| `gig-report-request`, `gig-report-submitted` | Ask the gig lead for a report; deliver the report to admins |
| `w9-request` | Musician W-9 upload link |
| `admin-welcome` | New org welcome (plus platform-admin copy) |
| `payment-failed` | Stripe dunning to the org owner |
| `email-layout`, `podium-footer` | Shared layout and branding (org logo, color, footer from `organizations.email_*`) |

`email_type` values logged: contract_offer, offer_reminder, offer_reminder_auto, offer_accepted, offer_declined, offer_rescinded, offer_expired, offer_expiring_soon, position_unassigned(_admin), sub_declined, sub_request_approved, musician_released, gig_details(_reminder|_confirmed), music_available, music_reminder, music_confirmed, pre_gig_notification, staffing_alert, pay_summary, gig_report_request, gig_report_submitted, w9_request, w9_received.

### 8.3 Other messaging
- **`reminder_templates`** (`054_reminder_templates.sql`): per-org saved text snippets (name, content) used by the pre-gig reminder UI. CRUD in `api/reminder-templates/*`.
- **SMS: none.** No Twilio or other provider. The only "text" feature is `src/components/projects/group-text-dialog.tsx`, which opens the device's native `sms:` URL with the musicians' phone numbers (`:114-120`) or copies them to the clipboard.
- **No channel abstraction.** Every notification is a hard-wired call to a specific `send*Email` function, with recipients and the log row assembled at each call site. Adding SMS or push would mean touching every call site.

---

## 9. File storage and the music subsystem

### 9.1 Stores
| Store | What | Access pattern |
|---|---|---|
| Supabase Storage `project-files` | Per-project files (parts, charts, gig docs) at `<orgId>/<projectId>/<uuid>.<ext>`; also intake book covers (`api/intake/[projectId]/book-cover/route.ts:23`) | Upload-URL minted server-side (`api/projects/[projectId]/files/upload-url`); browser upload in `project-files-section.tsx:148`, `book-download.tsx:361,522`. Downloads are signed URLs (`src/lib/storage/signed-download.ts`, default 3600s) from `files/[fileId]/download` (admin) and `music-download/[fileId]?token=` (musician). Org-scoped storage policies since `085` |
| Supabase Storage `w9-documents` | W-9 PDFs (`032_add_w9_upload_storage.sql`) | Musician upload via `api/w9/[token]` (service role); admin view via signed URL from `api/musicians/[id]/w9` |
| Cloudflare R2 `podium-repertoire` | Sheet-music library part PDFs (3,637 PDFs imported per `068_repertoire.sql:4`) | Hand-rolled SigV4 via `aws4fetch` (`src/lib/storage/r2.ts`, 358 lines): presigned GET per click, presigned PUT for browser-direct upload (CORS via `scripts/r2-set-cors.js`). The bucket must stay private (`.env.example`) |

Audit-style tables: `project_file_downloads` (who downloaded what; used in `files/[fileId]/download`, `music-download`, `music-status`), `music_sends`/`music_confirmations`, `gig_detail_sends`/`gig_detail_confirmations`.

### 9.2 Music library / intake / book builder subsystem
- **Tables** (migrations 068–083, 088):
  - `repertoire` (works, org-scoped, with `norm_title` for matching)
  - `repertoire_parts` (one per part PDF, `storage_path` = R2 key)
  - `repertoire_part_versions` (`079`)
  - `title_aliases` (messy-title remap)
  - `intakes` (one per project, a pasted client questionnaire, verbatim `raw_text`)
  - `intake_songs` (proposed songs plus match state)
  - `spotify_connections` (per-org OAuth refresh/access tokens **stored in plaintext columns**, `072_spotify_connections.sql`)
  - Plus columns `organizations.intake_enabled` and `library_org_id`.
- **Naming trap:** `books` / `book_entries` are **not** part of this subsystem. They are the staffing core's roster lists (`schema.sql:75-96`: `book_entries(book_id, musician_id, instrument_id, chair_number, priority)`), used to pre-fill positions (`src/components/projects/import-from-book-dialog.tsx`). The music subsystem's "books" are generated PDF part-books (`src/lib/intake/book-builder.ts`), with no table of their own.
- **Size:**
  - `src/lib/intake/*` + `repertoire/*` + `spotify*.ts`: about 3.4k lines.
  - 14 API routes: about 2.8k lines.
  - UI (`components/intake`, `library`): about 4.3k lines.
  - 6 intake test files (~2.5k lines) plus 7 library and intake tests in `__tests__`.
  - Scripts: `repertoire-*.js` (~2.4k lines), `update-library.js`, `library-*.js`, `export-catalog.js`, `site-library-gap.js`, `fix-*.js`, `audit-consistency.js`, plus repo-root `Update Music Library.cmd/.command`.
  - Two R2 config/test files.
  - Roughly 15–20% of the codebase.
- **Coupling to the staffing core is low and one-directional:**
  - All routes are gated by `requireIntakeEnabled` (404 when off).
  - Intakes hang off `projects` (`intakes.project_id` UNIQUE).
  - Built books are delivered as `project_files` into the `project-files` bucket.
  - The only core files that reference it are `dashboard/layout.tsx` (nav gate on `intake_enabled`) and `api-helpers.ts`.
  - No core table depends on repertoire tables.
  - It is owner-specific: scripts hard-code org `6edbf230-...` (`scripts/audit-consistency.js:20`) and a local folder `Music Compiler Local System/Reorganized Music Library`. Brand orgs share one master library via `library_org_id` (`scripts/wire-shared-library.js`).

---

## 10. Payments, tax and billing

### 10.1 Musician payments (contractor pays musicians off-platform)
- **`payments` table** (`013_add_payments.sql`):
  - Columns: org, service, musician, position, amount DECIMAL(10,2), `is_leader_fee`, status (`unpaid|pending|paid`), payment_date/method/reference, notes, `exported_at`, `export_batch_id`.
  - `payment_type` (`standard|adjustment|correction|bonus`) added in `027`, with a partial unique index on standard rows.
  - FKs to musicians and services are `ON DELETE RESTRICT` (`062_protect_payment_records.sql`), so musicians with history are archived instead of deleted (`data-safety.test.ts`).
- **Pay rule:** a single source in `src/lib/payments/compute.ts`. Base = accepted offer `custom_pay`, else `services.base_pay`. Leader fee = `services.leader_fee`, only when `musicians.is_leader` and the base pay came from the service default. Shared by `api/payments/generate` and the after-gig pay summary.
- **No money movement.** There is no payout integration. Musician payment info is limited to **Zelle** fields `musicians.zelle_method ∈ {email, phone}` and `zelle_verified` (`009_add_zelle_payment.sql`). Payments are marked paid by hand (`api/payments/bulk-update`, `payments-client.tsx`).
- **Export:** `api/payments/export` builds XLSX (formats `quickbooks` | `detailed`) and stamps `exported_at`/`export_batch_id` (`route.ts:49-222`).
- **1099:** `dashboard/payments/1099/page.tsx` server-reads payments. `components/payments/tax-report-client.tsx` aggregates **in the browser** by musician and year, applies a configurable threshold (default $600, `:38`), and writes XLSX client-side (`:122-154`). There are no structured TIN or address fields; the W-9 exists only as a PDF.
- **W-9 flow:**
  - `musicians.w9_on_file` (008), `w9_file_url` (032), `w9_verified_at/by` (050), `w9_request_token/sent_at/expires_at/uploaded_at` (078).
  - Admin triggers `api/musicians/send-w9-request` (plan gated), which mints the token and sends the `w9-request` email.
  - The musician uploads at `/w9/[token]` → `api/w9/[token]`: token + expiry check, upload to `w9-documents`, update musician, clear token, remove the orphan or previous file, log `w9_received`.
  - The admin views via a signed URL. The race on concurrent uploads is tested (`w9-upload-race.test.ts`).

### 10.2 SaaS billing (Stripe)
- `src/lib/plan.ts`:
  - Tiers `free | ensemble | orchestra | symphony`.
  - `PLAN_LIMITS`: musicians 25/60/250/∞, active projects 3/∞/∞/∞, admin seats 1/1/3/∞.
  - `resolveOrgPlan`: comped → Symphony; billing off → Symphony; active/trialing/past_due → paid tier; live trial → Symphony; else free.
  - Price IDs are mapped from env (`priceIdToTier`).
- **Migrations:** `046_add_billing.sql` (columns plus the original single "pro" tier), `064` (stripe_events), `066_billing_tiers.sql` (pro → `is_comped`, new CHECK on `plan_tier`), `080` (DB-side tier resolution and limit triggers that mirror `PLAN_LIMITS`; parity is checked by `plan-limit-enforcement.test.ts`, which regex-reads the SQL). Admin seats are enforced only in TypeScript.
- Routes: `billing/checkout`, `billing/portal`, `billing/webhook`. Setup scripts: `create-stripe-tiers.js`, `create-stripe-webhook.js`, `configure-stripe-portal.js`. QA notes: `QA-BILLING.md`, `tasks/billing-launch.md`.
- **State:** billing is dormant until both switches are flipped (section 6.2).

---

## 11. Tests

### 11.1 Setup
- Vitest 4, `environment: 'node'`, `hookTimeout: 30000` (`vitest.config.ts`).
- 60 files, about 12.6k lines.
- The **only** shared helper is `src/lib/__tests__/helpers/supabase-mock.ts` (272 lines): `MockSupabaseDb`, an in-memory chainable fake of from/select/update/insert/delete/eq/neq/in/is/not/lt/gte/lte/limit/single/maybeSingle and count. It records an operation log and supports a `beforeOp` hook for simulating races. It does not interpret PostgREST embeds (tests seed pre-nested rows), joins, constraints, triggers or RLS.
- **No test touches a real database, Supabase, Resend, Stripe, R2 or a browser.** There is no E2E (no Playwright/Cypress), no integration DB, no migration-apply test and no RLS test against Postgres. `docs/hardening-2026-09.md` "Second pass" lists "One Playwright happy path" as not done.

How each file works is coded as: **SRC** = reads source/SQL/JSON files with `readFileSync` and asserts `toContain`/`toMatch` on the text; **UNIT** = pure functions; **MOCK** = imports the real route handler or lib with `vi.mock` and/or `MockSupabaseDb`.

### 11.2 `src/lib/__tests__/`
| File | How | What it asserts |
|---|---|---|
| after-gig.test.ts | UNIT+MOCK+SRC | Due window (30 min–48h), one-lead selection, pay-summary claim/release idempotency, report request dedupe; some source checks |
| archived-work-books.test.ts | UNIT+SRC | Archived library works keep identity and are ignored by the matcher and book builder |
| billing-webhook.test.ts | MOCK+SRC | Stripe webhook: signature, dedupe on 23505, `applyOrgUpdate` releases the dedupe row on failure, billing flag behavior |
| contract-parser.test.ts | UNIT | `parseContract` on pasted contract text (project-from-contract feature) |
| cron-alerting.test.ts | MOCK+SRC | `runCronJob` calls notifyOps + serverError; every cron route wraps in `runCronJob` (text check) |
| cron-auth.test.ts | UNIT+SRC | `requireCronAuth` fails closed on blank secret; routes call it first |
| cron-expire-behavior.test.ts | MOCK (supabase-mock) | **Only behavioral cron test:** expire-offers auth, kill switch, expiry filter set, optimistic lock, position vacate rules |
| cron-retry.test.ts | UNIT | `withCronRetry` / `isTransientSupabaseFailure` with a fake sleep |
| cron-schedules.test.ts | SRC (vercel.json) | Every cron is off minute 0 |
| data-safety.test.ts | SRC | Migration 062 RESTRICT FKs exist; musician delete UI archives when payments exist |
| dialog-layout.test.ts | SRC | CSS class strings in dialog components (layout regressions) |
| email-safe-mode.test.ts | UNIT+SRC+MOCK | `filterRecipients`; suppressed sends reported as suppressed, not success (A6) |
| email-terminology.test.ts | UNIT | Email copy adapts per vertical terms |
| intake-matcher.test.ts, intake-normalize.test.ts | UNIT | Song matcher tiers; `normTitle` parity with the indexer |
| library-access.test.ts | UNIT+SRC | Presigned URL building, filename sanitizing, route gating text |
| library-add-parts.test.ts | UNIT+SRC | Upload fidelity gate (sha256), parts route wiring |
| library-rename.test.ts | UNIT+SRC | `buildWorkPatch`, works route |
| music-receipt.test.ts | MOCK | A music download counts as receipt |
| musician-duplicates.test.ts | UNIT | Email/phone normalization and duplicate rules |
| nav-mapping.test.ts | UNIT | Sidebar nav mapping per vertical |
| next-candidate-seated.test.ts | MOCK | `getNextCandidates` never suggests someone already on the gig |
| offer-assign-fixes.test.ts | SRC | Manual assign and supersede logic present (string checks like `otherPosIds`) |
| offer-email-honesty.test.ts | SRC | Send dialog calls the server rather than trusting stale state; never claims a send it didn't make |
| offer-lifecycle-behavior.test.ts | MOCK (supabase-mock) | Accept route: normal, substitution transfer, races (offer already answered, chair taken), decline |
| offer-lifecycle.test.ts | SRC | Accept/decline source contains the guarded update strings |
| offer-respond-shared.test.ts | MOCK+SRC | `claimChairForAccept`, `markOfferDeclined` outcomes; both routes use the shared module |
| offer-viewed-status.test.ts | SRC | Admin preview does not mark an offer viewed |
| org-membership.test.ts | UNIT+SRC | `checkInviteEligibility` (one org per account), members route wiring. **3 tests reported failing pre-existing** (`tasks/todo.md:415`) |
| payment-failed-email.test.ts | MOCK | Dunning template and `sendPaymentFailedEmail` never throws |
| plan-limit-enforcement.test.ts | SRC (SQL) | Regex-parses `080` SQL so limits and tier resolution match `PLAN_LIMITS` / `resolveOrgPlan` |
| plan.test.ts | UNIT | `resolveOrgPlan` matrix, gates |
| privileged-org-columns.test.ts | SRC (SQL) | `081` guards each privileged column; app writes them only via the service role |
| project-archive.test.ts | UNIT+SRC | `isReadyToComplete` across timezones; no route uses the naive `.lt('end_date', today)` |
| r2-storage.test.ts | UNIT | R2 config, key/URL building, SigV4 presign shape |
| reliability.test.ts | SRC | offer-reminders has the claim (`is('reminder_sent_at', null)`); alert wiring |
| require-intake-enabled.test.ts | MOCK | Gate fails closed 404; `libraryOrgId` resolution |
| rescind-guard.test.ts | MOCK (supabase-mock) | Rescind happy path; the musician answers first, so rescind is a no-op (A3) |
| resend-throttle.test.ts | UNIT+SRC | `awaitResendSlot` spacing; no `setTimeout(…600)` anywhere outside the client |
| resend-webhook.test.ts | MOCK | Svix verification fails closed; bounce/complaint/delivered updates |
| rls-policy-safety.test.ts | SRC (SQL) | Parses migration SQL: no blanket "service role full access" policies, 084–086 present, etc. **Text-level, not executed** |
| route-gates.test.ts | SRC | Billing-gated routes call `requireOrgPlan`/`getOrgPlan` + `can*` |
| schedule-conflict.test.ts | UNIT+SRC | Service window overlap arithmetic |
| score-book.test.ts | UNIT+SRC | Score is not an instrument book; manifest only offers existing score books |
| signed-download.test.ts | UNIT | `withDownloadName`, `createSignedDownloadUrl` |
| spotify-ranking.test.ts | UNIT | Track scoring/ranking |
| substitution-guards.test.ts | MOCK (supabase-mock) | Approve happy path; double approval (A5); revert on failure |
| unassign-history.test.ts | MOCK (supabase-mock) | Unassign keeps offer history (`released`), chair reads vacant (A4) |
| venue-fields / venue-lookup / venue-maps-url .test.ts | UNIT | Venue formatting, Google result disambiguation, Maps URL format |
| vertical-identity.test.ts, verticals-registry.test.ts | UNIT | Default template frozen; registry invariants; `term()` helpers |
| w9-upload-race.test.ts | MOCK | Concurrent W-9 submissions on one link |

### 11.3 `src/lib/intake/__tests__/` (all UNIT)
| File | What it asserts |
|---|---|
| book-builder.test.ts | Book ordering and part selection |
| matcher.test.ts | Match tier waterfall, loose fold |
| normalize-parity.test.ts | `normTitle` vs the retired Mac reference, including documented known gaps |
| parser.test.ts | Questionnaire parsing, 79 tests on real-world formats |
| part-guess.test.ts | Filename → part detection |
| score-only.test.ts | Score-only works treated as a format, not a gap |

### 11.4 Characterization
- About 25 of 60 files include source-text assertions. Some are pure SRC: offer-lifecycle, offer-assign-fixes, offer-viewed-status, reliability, rls-policy-safety, privileged-org-columns, plan-limit-enforcement, data-safety, dialog-layout, route-gates, cron-schedules. These pass if a string exists, whether or not the code behaves correctly, and they break on harmless refactors.
- Behavioral route tests with the in-memory fake: 6 files (cron-expire-behavior, offer-lifecycle-behavior, rescind-guard, substitution-guards, unassign-history, after-gig).
- **Offer cascade coverage:**
  - Accept/decline/claim: offer-lifecycle-behavior, offer-respond-shared, offer-lifecycle.
  - Rescind, unassign, substitutions: one MOCK file each.
  - Expiry: cron-expire-behavior.
  - Next candidate: next-candidate-seated, schedule-conflict.
  - Reminders: reliability (SRC only).
  - Manual assign / supersede: offer-assign-fixes (SRC only).
  - **Not covered at all:** the browser-side offer creation and waterfall send (`send-offer-dialog.tsx`, `project-offers.tsx`), `api/offers/send-email` supersede logic (no behavioral test), staffing-alerts and pre-gig crons (no behavioral test, which is how the threshold bug survives), and any real concurrency against Postgres.

---

## 12. Logging, error reporting and audit trails

- **Sentry** (`@sentry/nextjs` 10.73):
  - `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation.ts` (registers per runtime and exports `onRequestError`), `src/instrumentation-client.ts`.
  - Errors only: `tracesSampleRate: 0`, no replay, `sendDefaultPii: false`. Inert without a DSN.
  - The DSN is set in Vercel Production (`tasks/todo.md:364`).
  - Error boundaries: `src/app/error.tsx`, `global-error.tsx`, `dashboard/error.tsx`, `(auth)/error.tsx`.
- **`serverError()`** (`api-helpers.ts:22`) logs, captures to Sentry and returns a generic 500. Used by 21 of 81 routes.
- **`notifyOps()`** (`cron.ts:107`): Sentry plus email to `PLATFORM_ADMIN_EMAIL` for fatal cron failures only.
- **Console:** 157 `console.error`, 69 `console.warn`, 16 `console.log` across `src`. All unstructured string interpolation (for example `` `[cron retry] ${label}: attempt ...` ``). There is no request id, no correlation id and no log drain config. Vercel's built-in log viewer is the only log store (`tasks/lessons.md:225-235` describes reading Vercel logs by hand).
- **Audit and event records that exist:**
  - `email_logs`: every logged send with body text and Resend id, viewable at `dashboard/emails`. With the caveats in section 8.1 (suppressed logged as sent, first recipient only), this is the closest thing to an event log.
  - `contract_offers` status history (pending, viewed, accepted, declined, expired, rescinded, released), with `sent_at`, `responded_at`, `reminder_sent_at`. Unassign now preserves history via `released` (`063`, A4). This is a state field, not an append-only log; there is no record of who changed what.
  - `substitution_requests` (status, admin_notes).
  - `project_file_downloads`, `music_confirmations`, `gig_detail_confirmations`, `gig_reports`.
  - `payments.exported_at/export_batch_id`, `musicians.w9_verified_by/at` (`050`).
  - `stripe_events` (processed Stripe ids).
  - `impersonation_log`: **exists, unused.**
- **There is no general audit/event table** (no actor/action/entity log). No `updated_by` columns were found beyond a few `created_by`. There is no structured logging.

---

## 13. Scripts (`scripts/`)

| Script | One line |
|---|---|
| `audit-consistency.js` | **Music-library PDF check, not a DB integrity check.** See below |
| `backup-database.js` | **The only backup mechanism.** See below |
| `configure-stripe-portal.js` | Create the Stripe customer-portal configuration (tiers, cancel, payment method) |
| `create-stripe-tiers.js` | Create the 3 Stripe products/prices |
| `create-stripe-webhook.js` | Create the Stripe webhook endpoint and capture its secret |
| `export-catalog.js` | Song lists (md/txt/csv/html) from the live library for brand websites |
| `fix-catalog-data.js` | One-off repair of customer-visible library catalog damage |
| `fix-incomplete-works.js` | Recover "incomplete" works whose music was misfiled |
| `library-aliases.js` | Seed `title_aliases` for merged songs (`--undo`) |
| `library-audit.js` | Find duplicate/fragment works; `--apply` archives via `is_active` |
| `library-merge.js` | Stitch split quintet arrangements into one work (`--undo`) |
| `merge-duplicate-musicians.js` | One-time merge of confident duplicate musician records in an org |
| `r2-set-cors.js` | CORS policy on the R2 bucket for browser-direct PUT |
| `repertoire-index.js` | Read-only classifier walk of the owner's local PDF library |
| `repertoire-upload.js` | Upload indexed PDFs to R2 (sha256 fidelity) |
| `repertoire-db-import.js` | Insert repertoire/parts metadata rows |
| `repertoire-absorb-knowledge.js` | Port aliases and knowledge from the retired Mac system |
| `site-library-gap.js` | Diff brand websites against the library; writes `tasks/missing-repertoire.md` |
| `update-library.js` | "Easy button" to add new PDFs to the library (wrapped by the root `.cmd`/`.command`) |
| `wire-shared-library.js` | Point brand orgs' `library_org_id` at the master library org |
| `launch-pending-migrations.sql` | 2026-06-09 bundle of pending migrations (historical) |
| `go-live-2026-07-18.sql` | 073 + 074 + intake flag flip (historical) |
| `security-fixes-2026-07-25.sql` | Security migration bundle with RESULTS check (the convention template) |
| `w9-upload-2026-07-25.sql` | W-9 self-upload migration bundle |
| `venue-policies-2026-09-17.sql` | Venue RLS fix bundle |
| `launch-hardening-2026-09-18.sql` | Migrations 084–087 bundle with RESULTS |
| `after-gig-2026-09-27.sql` | Migration 089 bundle |
| `gig-lead-2026-09-27.sql` | Migration 090 bundle |
| `staging-replay.sql` (2,927 lines) | Full-schema replay for a fresh staging project; header says 001–065; "never run against production" |

**`scripts/backup-database.js` (94 lines), in detail:**
- Reads `.env.local` and uses the **service-role key** against PostgREST.
- Discovers every exposed `public` table from the OpenAPI spec (`/rest/v1/`), with primary keys parsed from `<pk/>` descriptions. Pages each table 1,000 rows at a time with `Range` headers, ordered by PK. Writes `scripts/backups/db/<timestamp>/<table>.json` plus `manifest.json` (row counts or `ERROR:`). Keeps the newest 14 and deletes older ones.
- Scheduled through **Windows Task Scheduler "PodiumNightlyBackup", daily 09:00, on the owner's PC** (header comment, `database-safety.md:44-50`).
- **Not covered:** `auth.users` (logins), any non-public schema, Storage objects (W-9 PDFs, project files), R2, functions/triggers/policies (no DDL), and sequences. No point-in-time consistency: tables are dumped sequentially while live writes continue, so FKs can be torn across files. No restore script ("restore is manual (REST inserts)", `database-safety.md:49`). Exit code 1 on partial failure, but nothing alerts.
- **PITR:** "DECLINED for now ($125/mo on free plan). Next: free GitHub Actions backup job to R2, Pro at first paying customer" (`tasks/todo.md:363`; `tasks/launch-assessment-2026-09-18.md:86-90` "A7. Backups are a laptop cron").

**`scripts/audit-consistency.js` (104 lines), in detail:**
- Despite its name, **it is not a data-integrity checker for the application database.**
- Takes a batch of `repertoire` work ids (JSON file or `--ids`). For each work it fetches `repertoire` and `repertoire_parts` over REST with the service key. It finds each part's PDF in the owner's **local disk folder** `Music Compiler Local System/Reorganized Music Library` (hard-coded org `6edbf230-e43a-42c0-a60d-8cd67be87276`, `:20-21`). It extracts page-1 words with `pdf-parse` (not a declared dependency in `package.json`, which matches the "don't install packages from outside npm" lesson), drops a noise list, and flags the work if the readable parts share no title word or if the filenames name two or more distinct composers.
- Output is JSON lines to stdout. Read-only.
- **Nothing in the repo checks relational invariants** of the staffing data. Examples of what goes unchecked: a position with `status='confirmed'` but no accepted offer, two accepted offers on one position, a payment without a confirmed position, an `email_logs` row pointing at a deleted musician. A rearchitecture spec that asks for data-integrity checks has nothing to reuse here except the RESULTS-query convention in the `scripts/*-2026-*.sql` bundles.

---

## 14. Existing docs worth reusing

| Doc | Reuse value | Notes |
|---|---|---|
| `README.md` | High | Accurate stack, migration warning, scripts index. Stale: `src/app/musician/` (`:46`) |
| `docs/runbooks/database-safety.md` | High | Migration checklist, backup gaps, the "never touch" contracts (offer token URL shape, status CHECKs, payment RESTRICT FKs, `create_organization_with_owner` overloads). Stale on preview deploys (ignoreCommand now skips them) |
| `docs/runbooks/staging.md` | Medium | Staging is paused; the replay file is from 2026-07-11 |
| `docs/hardening-2026-09.md` | High | What was hardened, plus an explicit unfinished "second pass" list (typed clients, consolidate admin checks, Playwright, CLI migrations, lint) |
| `tasks/launch-assessment-2026-09-18.md` | High | Numbered findings A1–A9 with fix status |
| `docs/runbooks/{repertoire-import,update-music-library,export-catalog}.md` | Music subsystem only | |
| `docs/contract-import.md`, `docs/client-song-planner-spec.md` | Low | Song planner retired 2026-09-27 (`.env.example`) |
| `tasks/todo.md` | Medium | Working log; open items: PITR declined, `billing_enforced` unconfirmed, 3 failing org-membership tests, xlsx upgrade pending |
| `tasks/v2-strategy.md` | High for direction | "Expand, don't pivot". Extract the generic spine (roster → project → services → positions → offers → payments) from the music overlay; SMS, call-order engine v2 and the hiring ledger are the top features. Its §1 audit facts are dated: it says "single $29 Pro tier" and "6 crons", but now there are 3 tiers and 7 crons, and the verticals registry with 7 templates now exists |
| `podium_personnel_strategy.md` (374 lines) | Low | Early task list and pricing research; largely superseded |
| `podium_musician_portal_implementation.md` (2,053 lines) | Historical | Describes a musician portal (login, dashboard, availability, payment history, `/app/musician/*`, notification prefs). **Was implemented and then removed.** Remnants: `musician_notification_preferences` table, portal RLS helper functions, `musicians.user_id`, `link_musician_records_to_user`, `auth/callback` redirect to `/musician`, `resolveMusicianIds`. Availability management does not exist |
| `QA-BILLING.md`, `tasks/billing-launch.md` | Medium | Billing launch checklist |

**Lessons relevant to migrations, concurrency and email (`tasks/lessons.md`):**
- **Resend rate limit** (`:26-32`): pacing must live in the email client, not in loops. `awaitResendSlot()` is the fix, and a test bans per-loop sleeps. *(The throttle is per instance only; see the risks.)*
- **`logEmail()` can throw** (`:34-38`): increment the sent count right after the send and isolate logging. *(logEmail now swallows errors itself.)*
- **Musicians aren't org members** (`:40-44`) and **RLS blocks server components** (`:46-57`): use the service client. Supabase writes don't throw, so always check `error`. *(This lesson pushed the codebase toward pervasive service-role use.)*
- **Feature-flag columns** (`:77-81`): apply the migration, flip the data, then deploy code.
- **Measure whether the last fix worked** (`:225-235`): cron 504 retries were undersized at 3 attempts / 22s, so they became 5 attempts / ~45s.
- **Prove the permission before blaming the plumbing** (`:262-278`): a months-long "PostgREST embed quirk" was really an RLS policy denying admins `venues`. Lesson: test under real credentials.
- **Multi-commit push can skip a Vercel build** (`:280-292`): ignore rules. Check the live page, not the deploy status.
- **One lead per gig** (`:15-24`): count how a people-picking rule would have behaved on real data, and preview who would be emailed before deploying.
- **"Fixed" means fixed live** (`:59-63`): deploy status is the source of truth.

---

## 15. Risk register (infrastructure)

| # | Risk | Evidence | Severity | Why it matters for a multi-vertical rearchitecture |
|---|---|---|---|---|
| R1 | Migrations applied by hand with no tracking. Prod schema state is unknowable from the repo; 080/081 sat unapplied for days | `README.md:68-72`; no CLI/`schema_migrations`; `.github/pull_request_template.md` | **Critical** | A rearchitecture means many schema changes (taxonomy generalization, rank, ledgers). Without a tracked, CI-applied migration pipeline, every step risks code/schema skew in production |
| R2 | `supabase/schema.sql` is stale and unsafe: 13/40 tables, and it recreates the world-readable/writable `contract_offers` token policies dropped in 019 | `supabase/schema.sql:413-419`; `019_fix_onboarding_and_rls_gaps.sql:53-54` | High | Anyone bootstrapping a new environment or vertical sandbox from it gets a wrong and insecure schema. There is no authoritative schema snapshot |
| R3 | No transactions; multi-step business writes depend on conditional updates and partial compensations. Offer creation and the waterfall send run **from the browser** | `send-offer-dialog.tsx:486-559`; `project-offers.tsx:237-300`; `substitutions/.../approve/route.ts:92-270`; `respond.ts:57-75` | **High** | The offer engine is the generic spine to extract. Its invariants (one active offer per musician per project, one holder per chair) live in client code and check-then-act sequences. A multi-vertical engine needs them as server-side atomic operations (RPC / transaction / constraints) |
| R4 | No queue or outbox. Emails are sent inline in request handlers and polled crons. No retry for failed sends (offer-reminders claims before sending and never releases) | `src/lib/cron.ts`; `offer-reminders/route.ts:92-175`; section 7.1 | High | Adding SMS, availability polling and automated cascades multiplies async work. Without durable jobs, partial failures are lost and request latency grows with recipient count (600ms each) |
| R5 | Rate limiter and throttle are in-process only (module variables) | `email/client.ts:89`; `rate-limit.ts` `buckets` Map | Medium | Under concurrent Vercel instances, the Resend 2 req/s limit and per-token rate limits are not enforced globally. Worse as volume grows across verticals |
| R6 | Crons are fixed UTC times; deadline entry uses the browser timezone; staffing/pre-gig windows use UTC ms | `vercel.json`; `send-offer-dialog.tsx:480`; `staffing-alerts/route.ts:84` | Medium | Multi-region and multi-vertical customers need per-org local scheduling (reminder times, "end of day" deadlines) |
| R7 | Staffing-alert threshold bug: 7-day and 3-day alerts never fire | `staffing-alerts/route.ts:10,90` | Medium | A live correctness bug in a background job, showing these jobs have no behavioral tests |
| R8 | No cron run ledger or heartbeat; per-item failures return 200 with a count; no alert on "did not run" | `cron.ts:139-148`; `automaticVercelMonitors: false` | Medium | Silent background failure in the system that drives deadlines. Needs observability before adding more jobs |
| R9 | Pervasive service-role usage (55/81 routes) plus 26 hand-rolled admin checks, so tenant isolation lives in TypeScript filters | Section 2.2; `docs/hardening-2026-09.md` second pass | High | Each new vertical or route repeats the pattern. One missed `.eq('organization_id')` leaks across tenants. RLS does not backstop service-role code |
| R10 | One-org-per-account (`UNIQUE(user_id)`) is hard-wired via `.single()` in ~38+ sites | `077_one_org_per_account.sql`; `api-helpers.ts:47-51` | Medium | Agencies or contractors running several brands/verticals need multi-org membership. The owner already works around it with `library_org_id` sharing |
| R11 | Backups: a JSON dump on a Windows PC; no auth.users, no storage/R2, no DDL, not a consistent snapshot, no restore tooling; PITR declined | `scripts/backup-database.js`; `database-safety.md:44-50`; `tasks/todo.md:363` | **Critical** | Any large data migration (taxonomy generalization) runs without a reliable rollback path |
| R12 | No staging (paused), one prod DB, no E2E, tests never touch Postgres; about 40% of tests are string-matching | `staging.md:5-10`; section 11 | High | A rearchitecture needs behavior-preserving refactors. String tests break on refactor and miss real regressions. RLS/trigger behavior is untested |
| R13 | Untyped data layer: hand-written `database.ts` (19 tables), clients not generic, 359 `any` | `src/types/database.ts`; `supabase/server.ts:7` | Medium | Renaming or generalizing columns (instrument → role, chair_number → rank) can't be checked by the compiler |
| R14 | Email is hard-wired: 27 `send*` functions, call-site recipient assembly, no channel abstraction, no preferences, bounced addresses still sent to, suppressed sends logged as `sent` at 24 of 28 sites | Section 8 | High | SMS and per-recipient channel preferences (top v2 features) require a notification layer that doesn't exist. `email_logs` is unreliable as the audit trail |
| R15 | No general audit/event log; `impersonation_log` unused; offers keep status, not history; no actor attribution | Section 12 | Medium | The v2 "auditable hiring ledger" differentiator and union/CBA compliance need an append-only event log designed in |
| R16 | Stripe webhook has no event-order protection; Resend webhook has no ordering | `billing/webhook/route.ts:162-200`; `webhooks/resend/route.ts:152-184` | Low–Medium | Out-of-order events can regress plan or email status. Becomes material once billing is enforced |
| R17 | Dual billing switch (env + `app_settings`) must be flipped together; `billing_enforced` state unconfirmed | `.env.example` billing section; `tasks/todo.md:366` | Medium | Split-brain gating (UI vs DB triggers) at launch |
| R18 | Dead and stale portal code and schema (musician RLS helpers, `musician_notification_preferences`, `/musician` redirect, `resolveMusicianIds`) | Section 5; `auth/callback/route.ts:33,52` | Low | Confuses the domain model ("worker" identity) a rearchitecture must define. The callback redirect is a live 404 |
| R19 | Music library subsystem (~15–20% of code) is owner-specific (hard-coded org ids, local disk paths, Windows scripts) | `scripts/audit-consistency.js:20-21`; `wire-shared-library.js` | Low (well-gated) | Coupling to the core is low (feature flag, `project_files` delivery). Can be isolated as a vertical-specific module, but its scripts are not productized |
| R20 | Scaling hot spots: `listUsers` scans (default page breaks member invites past one page); per-admin `getUserById` loops; pre-gig and staffing crons load all active projects with all positions in one query | `settings/members/route.ts:42,114`; `supabase/server.ts:128-150`; `pre-gig-reminders/route.ts:268-303`; `staffing-alerts/route.ts:25-57` | Medium | Fine at 4–5 orgs; breaks with multi-vertical growth. Should be keyed queries or views |
| R21 | Spotify OAuth tokens in plaintext table columns | `072_spotify_connections.sql` | Low | Secret-handling pattern to fix before integrating more third-party OAuth (calendars, SMS providers) |
| R22 | CI doesn't run `next build`; lint is advisory; previews disabled by `ignoreCommand` | `.github/workflows/ci.yml`; `vercel.json` | Medium | Build breaks are found only on master deploy. There are no preview environments to validate rearchitecture slices |
