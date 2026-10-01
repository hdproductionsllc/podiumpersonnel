# Section D — Hard-coded quartet/music assumptions, and the generalization layer that already exists

Audit of `/home/user/podiumpersonnel` at `master` (869ece3, 2026-10-01). Read-only. All paths relative to the repo root unless absolute.
Scope: Next.js 16 app (`src/`), Supabase migrations `001`–`090` (`supabase/migrations/`), Resend email templates (`src/lib/email/templates/`).

Method: every file under `src/lib/verticals/` read in full; the four vertical tests read; migrations scanned for every `CREATE TABLE` / `ADD COLUMN`; `rg` sweeps for the music nouns across `src/` and `supabase/migrations/`; a heuristic string-literal scanner (script at `scratchpad/count.py`) counts music nouns inside user-facing string literals / JSX text per directory against calls into the terminology layer. The unmerged `overhire-demo-skin` branch was cloned into the scratchpad (not into the repo) for comparison.

---

## 0. Headline

1. **A real generalization layer already exists and is in production**: `organizations.vertical` (migration 065), a 7-template registry (`src/lib/verticals/`), a `TermDictionary` of 7 nouns, per-vertical nav, title rules, skill seeds, a server/client resolution path, and four test suites that freeze the music default byte-for-byte. It is "configuration before branching" done properly, with a fail-open default (`resolveVertical`) that makes every deploy safe.
2. **Terminology substitution is deep in the admin UI and emails, shallow everywhere else.** 74 of 277 user-facing files call into the term layer (549 call sites), concentrated in `components/projects` (21/22 files, 208 calls), `components/musicians` (85), email templates (21/29 files, 113 calls). API routes (1 of 81 files), the token pages (`/gig`, `/confirm-*`, `/report`), `components/gig`, and the music-library subsystem are essentially untouched. About **448** music-noun literals remain in user-facing strings (224 of them in API routes: error messages, email subject fallbacks, CSV headers), plus **169** "gig/sub/call/lead/leader fee" literals that have **no term key at all**.
3. **The vertical layer only re-labels. It never touched the data model.** The deepest real constraints are structural, not lexical: positions belong to the project and every confirmed person works every service (pay, conflicts, subs, after-gig, materials all inherit this); one position = one person (no quantity); `is_leader`/`leader_fee` are global musician/service attributes with a $50 default; document visibility is per-instrument only; org roles are `owner/admin/member` with `member` effectively unused.
4. **There is already an AV/production-crew vertical on an unmerged branch** (`origin/overhire-demo-skin`, 6 commits off `hardening-2026-09`, 46 commits behind master): `production_crew` template ("Tech/Crew", "Show", "Call", "Role", "Slot"), an `Overhire` brand override, a 16-role crew seed, a "three-call show" template, and a crew-fork research doc that independently names **per-call headcounts** as "the one real data-model change". Its migration is numbered `084`, which collides with master's `084_drop_membership_self_insert.sql`.

---

## PART 1 — What already exists for generalization (reusable work)

### 1.1 The verticals module — `src/lib/verticals/` (667 lines, 16 files)

| File | Lines | What it is |
|---|---|---|
| `types.ts` | 118 | `VERTICAL_KEYS`, `TermForms`, `TermDictionary`, `VerticalFeatures`, `NavItemId`/`NavConfig`, `TitleRules`, `SkillSeed`, `VerticalTemplate` |
| `terms.ts` | 31 | `term(dict, key, {plural, case})`, `termCount(dict, key, n)` |
| `registry.ts` | 41 | `VERTICALS`, `DEFAULT_VERTICAL='music_contractor'`, `resolveVertical()` (never throws), `DEFAULT_TERMS` |
| `features.ts` | 23 | `canUseChairs`, `canInferTitles`, `canDetectEnsembles`, `showBooksTab` predicates ("mirroring the plan.ts gate style") |
| `nav-routes.ts` | 18 | `NAV_ROUTES`: stable id → route; templates change labels/order/visibility, never paths |
| `seeds.ts` | 76 | TS skill seeds for 5 non-music verticals (all `section: 'other'`) |
| `server.ts` | 39 | `getServerVertical()` — React `cache()`d server-component lookup, fails open |
| `title-rules.ts` | 33 | `orchestralTitleRules` (reference to the original functions) and `plainTitleRules(rank)` |
| `index.ts` | 20 | barrel |
| `templates/*.ts` | 7 × ~38 | one `VerticalTemplate` per key |

#### TermDictionary (`types.ts:32-54`)
Seven outward-facing nouns, each `{singular, plural}` in Title Case (lowercase derived; registry test forbids acronyms/consecutive capitals so `.toLowerCase()` is safe — `verticals-registry.test.ts:21`):

| key | meaning | DB noun it relabels |
|---|---|---|
| `person` | the worker | `musicians` |
| `work` | the engagement | `projects` |
| `session` | dated block | `services` |
| `skill` | taxonomy entry | `instruments` |
| `groupList` | saved roster | `books` |
| `materials` | distributed files | `project_files` / `music_sends` |
| `rank` | ordinal within a skill, or `null` | `chair_number` |

`term()` returns `''` for a null rank and tells call sites to gate on `features.useChairs` instead (`terms.ts:13-16`).

**Missing keys (no way to relabel today):** "gig" (72 literal hits), "sub/substitute" (40), "call" as in offer (30), "lead/leader fee" (20), "offer", "position", "ensemble" (41), "section" (the INSTRUMENT_SECTIONS group heading), "venue", "call time", "payments/pay", "gig details", "gig report". The default nouns in the frozen test do not include these, so adding them is additive and safe.

#### VerticalFeatures (`types.ts:56-65`)
`useChairs`, `useTitleInference`, `useEnsembleDetection`, `showBooksTab`.
**Finding: the predicates in `features.ts` are never called outside tests.** `rg` for `canUseChairs|canInferTitles|canDetectEnsembles|showBooksTab|features.use*` outside `src/lib/verticals` returns a single hit: `src/components/projects/project-form-dialog.tsx:130` uses `vertical.features.useTitleInference` *as a proxy for "is a music vertical"* to hide the String-Quartet quick-start picker. `src/components/instruments/instruments-client.tsx:51` uses `vertical.skillSeeds === 'sql'` as another music proxy. Everything else is achieved indirectly: chairs disappear because `plainTitleRules(null)` returns empty titles; drift detection is inert because `plainTitleRules.checkGroupDrift` returns `{drifted:false}`; books disappear because the nav config omits them (and `verticals-registry.test.ts:41` asserts nav and flag agree). So the flags are a *declared* config surface that is mostly not yet *consumed* — cheap to wire up.

#### NavConfig (`types.ts:67-80`, `nav-routes.ts`)
Ids: `dashboard, projects, musicians, books, payments, venues, instruments, emails`. Each template supplies labels, order, and one `emphasize`. `src/components/layout/sidebar.tsx:91-200` maps id → icon + `NAV_ROUTES`. `/dashboard/library` is rendered **outside** NavConfig, gated by `organizations.intake_enabled` (`sidebar.tsx:145-200`) precisely so the frozen default nav is untouched. `/dashboard/schedules` and `/dashboard/payments/1099` have no nav id.

#### TitleRules (`types.ts:84-96`, `title-rules.ts`)
`getPositionTitle(instrumentName, chairNumber, section?, totalChairs?, ensembleSize?) → {title, shortTitle, isLeadership}` and `checkGroupDrift(currentType, positions)`. Music verticals bind the original `src/lib/orchestra-positions.ts` / `src/lib/ensemble-detection.ts` by reference (identity test asserts reference equality, `vertical-identity.test.ts:88-98`). Non-music verticals use `plainTitleRules(rank)`: with a rank, "Rank N" and chair 1 is leadership; without, empty. Consumers: `src/components/projects/project-positions.tsx:186`, `src/components/books/book-instrument-chairs.tsx:30`.

#### SkillSeed (`types.ts:98-108`, `seeds.ts`)
`{name, abbreviation, section: InstrumentSection, sort_order}`. Music verticals: `skillSeeds: 'sql'` → seeded inside the `create_organization_with_owner` RPC (`067_vertical_seeding_rpc.sql:59-61`, `IF p_vertical IN ('music_contractor','orchestra_band')`, 64 instruments). Others: TS arrays seeded by `POST /api/organization/seed-skills` (`src/app/api/organization/seed-skills/route.ts`), called from onboarding (`src/components/auth/onboarding-form.tsx:119-122`) and from `src/components/instruments/seed-vertical-button.tsx`. All non-music seeds use `section:'other'` because `INSTRUMENT_SECTIONS` is a fixed zod enum (`seeds.ts:8-11` calls per-vertical sections "a v1.1 item").

#### The 7 templates (`src/lib/verticals/templates/`)

| key | displayName | person | work | session | skill | groupList | materials | rank | chairs/titles/drift/books | seeds |
|---|---|---|---|---|---|---|---|---|---|---|
| `music_contractor` (DEFAULT) | Music Contractor | Musician | Project | Service | Instrument | Saved Ensemble | Music | Chair | T/T/T/T | sql (64) |
| `orchestra_band` | Orchestra / Band | Musician | Concert | Service | Instrument | Roster | Music | Chair | T/T/T/T | sql (64) |
| `choir` | Choir / Chorus | Singer | Concert | Session | Voice Part | Roster | Music | null | F/F/F/T | 11 |
| `theatre` | Theatre | Company Member | Production | Call | Role | Cast List | Script | null | F/F/F/T | 13 |
| `dance` | Dance Company | Dancer | Production | Call | Role | Roster | Music | null | F/F/F/T | 7 |
| `church_worship` | Church / Worship | Team Member | Plan | Service | Team Role | Team | Music | null | F/F/F/T | 12 |
| `event_agency` | Entertainment Agency | Performer | Event | Set | Skill | Lineup | Material | null | F/F/F/**F** | 6 |
| *(branch)* `production_crew` | Production Company | Tech / **Crew** | Show | Call | Role | Crew List | Show Doc | **Slot** | **T**/F/F/F | 16 |

Notes: theatre nav labels the musicians tab "Cast & Crew" (`templates/theatre.ts:25`), diverging from `terms.person`. `event_agency` hides Books but the route still works by URL (`templates/event-agency.ts:6-8`). The branch's `production_crew` keeps chairs on (as "Slot") with plain titles — the only combination of `useChairs:true, useTitleInference:false`.

#### DEFAULT_VERTICAL / fail-open behaviour
`resolveVertical(key)` (`registry.ts:30-35`) returns the default template for `null`, `undefined`, unknown keys, or hostile input (`vertical-identity.test.ts:137-150`). `getServerVertical()` (`server.ts:15-39`) and `getOrgVertical()` (`src/lib/api-helpers.ts:174-186`) both catch and fall back. `src/app/dashboard/layout.tsx:67-80` fetches `vertical` in a separate query so a missing column degrades to default. `VerticalProvider` (`src/components/providers/vertical-provider.tsx`) receives only the key (templates contain functions) and resolves client-side; `useVertical()`/`useTerms()` are the client hooks. Emails: `resolveEmailTerms(explicit, organizationId)` in `src/lib/email/send.ts:45-58` → explicit > org lookup > `DEFAULT_TERMS`.

#### Tests that guard the layer
- `src/lib/__tests__/vertical-identity.test.ts` (150 lines) — "THE NO-OP GUARANTEE": freezes default terms, nav, features, music-distribution phrases, and the orchestral title matrix (Violin 1 orchestra vs chamber, winds, percussion, fallback). Header says the frozen literals need David's sign-off to change.
- `src/lib/__tests__/verticals-registry.test.ts` (136) — registry invariants: keys self-consistent, no consecutive capitals, nav ids unique with dashboard first and exactly one emphasized, books-nav ⇔ `showBooksTab`, title inference ⇒ chairs, music ⇒ `'sql'` seeds, every seed passes `instrumentSchema`, rank-less ⇔ chairs off; `term()`/`termCount()`; `plainTitleRules`.
- `src/lib/__tests__/email-terminology.test.ts` (49) — renders `ContractOfferEmail` with default vs choir terms; omitting `terms` is byte-identical to passing defaults.
- `src/lib/__tests__/nav-mapping.test.ts` (57) — every nav id resolves to a route; relabeled verticals keep routes; event_agency omits books.

These are directly reusable as the regression harness for the rearchitecture: any new vertical (AV crew, photo/video, staging) must pass them, and the identity suite is exactly the "don't regress the quartet product" contract.

### 1.2 How the vertical is stored and chosen
- **Storage**: `organizations.vertical TEXT NOT NULL DEFAULT 'music_contractor'` + CHECK over the 7 keys (`supabase/migrations/065_add_org_vertical.sql:11-31`). Adding a key needs a CHECK rewrite (the branch does this in its `084_add_production_crew_vertical.sql`).
- **Creation**: `create_organization_with_owner(p_name, p_slug, p_timezone, p_vertical DEFAULT 'music_contractor')` (`067_vertical_seeding_rpc.sql:28-61`).
- **Picker**: `src/components/auth/onboarding-form.tsx:181-210` renders one card per `Object.values(VERTICALS)` (displayName + description), default `DEFAULT_VERTICAL` (line 68), validated by `z.enum(VERTICAL_KEYS)` (`src/lib/validations/auth.ts:37`). Page: `src/app/(auth)/onboarding/page.tsx`. The post-onboarding tour `src/components/onboarding/setup-wizard.tsx` is fully term-driven (20 term calls) except the example "Violin 1, Cello, Trumpet" (line 91).
- **Change after creation**: not offered in UI; `src/components/settings/organization-section.tsx:174` displays `displayName` read-only. `vertical` is **not** in the privileged-columns trigger (`081_protect_privileged_org_columns.sql:58-64` protects billing, `library_org_id`, `intake_enabled`), so an admin could PATCH it via PostgREST — harmless today because it only relabels, but it would matter once a vertical gates behaviour.

### 1.3 How far substitution has penetrated (measured)

Heuristic: string literals and JSX text containing music nouns (`musician(s), instrument(s), chair(s), service(s), project(s), gig(s), ensemble(s), music, parts, sheet music, orchestra(l), quartet(s), repertoire, setlist`), skipping identifiers, paths, selects, class names and comments. "Term calls" = occurrences of `useVertical( | useTerms( | term( | termCount( | DEFAULT_TERMS | terms. | terms?. | getServerVertical | resolveVertical | can*()`. It over-counts "project"/"service" in API error strings and under-counts multi-line JSX; treat as order-of-magnitude.

| Bucket | files | files using terms | term calls | music-noun literals |
|---|---|---|---|---|
| `src/components/projects` | 22 | **21** | **208** | 85 |
| `src/components/musicians` | 6 | 5 | 85 | 18 |
| `src/components/instruments` | 8 | 6 | 30 | 2 |
| `src/components/books` | 6 | 5 | 29 | 21 |
| `src/components/onboarding` | 2 | 1 | 20 | 0 |
| `src/components/settings` | 10 | 4 | 19 | 5 |
| `src/components/payments` | 4 | 3 | 16 | 0 |
| `src/components/schedules` | 3 | 2 | 9 | 0 |
| `src/components/providers`, `layout` | 5 | 2 | 6 | 0 |
| `src/components/gig` (token pages UI) | 4 | **0** | 0 | 9 |
| `src/components/emails`, `venues`, `dashboard`, `billing` | 7 | 0 | 0 | 7 |
| `src/components/intake` + `library` + `music` (music library) | 7 | 0 | 0 | 40 |
| `src/app/dashboard/**` (server pages) | 24 | 1 | 8 | 11 |
| `src/app/gig`, `confirm-details`, `confirm-music`, `report`, `musician-policy` | 8 | 2 | 4 | 14 |
| `src/app/api/**` | 81 | **1** | 2 | **224** |
| `src/lib/email/templates` | 29 | **21** | **113** | 11 |
| **Total** (277 files incl. 28 `ui/` primitives) | 277 | 74 | 549 | 448 |

Per-word literal totals: gig 72, project 66, musician(s) 65, music 42, ensemble(s) 44, instrument(s) 44, orchestra 34, parts 21, repertoire 15, quartet 12, service(s) 15, chair 3.
Second sweep for nouns with no term key: gig 74, call/calls/call time 35, sub/substitute 40, lead 15, leader fee 5 → 169 literals.

**Files with the most un-templated literals** (literal hits, term calls):
| hits | term calls | file |
|---|---|---|
| 15 | 11 | `src/components/projects/project-form-dialog.tsx` (quick-start templates, contract paste placeholder) |
| 13 | 0 | `src/components/library/library-client.tsx` (music library — expected) |
| 13 | 3 | `src/components/books/book-form-dialog.tsx` (`ENSEMBLE_PRESETS`, ungated) |
| 13 | 0 | `src/app/api/substitutions/[requestId]/approve/route.ts` |
| 12 | 0 | `src/components/intake/book-download.tsx` (music library) |
| 11 | 12 | `src/components/musicians/bulk-edit-dialog.tsx` ("Update Can Lead (Violin 1)") |
| 11 | 0 | `src/app/api/positions/[positionId]/rescind-offer/route.ts` |
| 10 | 0 | `src/app/api/repertoire/add-work/route.ts` (music library) |
| 10 | 0 | `src/app/api/projects/[projectId]/send-music/route.ts` |
| 10 | 0 | `src/app/api/gig/[token]/accept/route.ts` |
| 9 | 19 | `src/components/projects/send-music-dialog.tsx` |
| 9 | 0 | `src/app/api/positions/[positionId]/assign/route.ts` |
| 8 | 0 | `src/app/api/cron/pre-gig-reminders/route.ts` |
| 8 | 0 | `src/app/api/gig/[token]/decline/route.ts` |
| 8 | 0 | `src/app/api/payments/export/route.ts` (CSV headers "Instrument", "Leader Fee") |
| 8 | 0 | `src/app/api/positions/[positionId]/unassign/route.ts` |
| 7 | 27 | `src/components/projects/project-positions.tsx` (line 159 literal "Chair") |
| 7 | 19 | `src/components/projects/send-offer-dialog.tsx` |
| 7 | 0 | `src/components/intake/intake-panel.tsx` |
| 7 | 0 | `src/app/api/offers/send-email/route.ts` |
| 7 | 8 | `src/app/dashboard/page.tsx` |
| 6 | 0 | `src/components/projects/gig-report-panel.tsx` |

**Email-specific gaps**
- All 26 send functions in `src/lib/email/send.ts` accept `terms?`, but **8 admin/cron sends resolve with `organizationId = undefined`** and so always render music nouns: `sendAdminOfferResponseEmail` (425), `sendAdminOfferSentEmail` (488), `sendAdminSubRequestEmail` (608), `sendOfferExpiredEmail` (817), `sendOfferExpiringSoonEmail` (852), `sendAdminWelcomeEmail` (923), `sendPreGigNotificationEmail` (1132), `sendStaffingAlertEmail` (1173); none of their callers pass `terms` (e.g. `src/app/api/cron/staffing-alerts/route.ts:154-166`).
- Subjects are mostly literal: "Call:", "Gig details:", "Sub Request:", "Gig report for…" (`send.ts:216-1284`); only the two materials subjects (1061, 1099) use `term()`.
- Templates with **no** term usage: `pay-summary.tsx` (hard-codes "nobody is confirmed in Violin 1", "leader fee", "gig" — lines 59-94), `gig-report-request.tsx`, `gig-report-submitted.tsx`, `payment-failed.tsx` (n/a).
- `contract-offer.tsx:112` "Ensemble:", `:220` "tuning or essential cues", `:230` "music, stand, and water" — sent in every offer.
- `gig-details.tsx:99,173,207` "Ensemble:", "Your Ensemble:", "Ensemble roster".
- Rank rendering: 10 templates print `{instrument}, {term(t,'rank')} {chairNumber}` when `totalChairs>1` (e.g. `contract-offer.tsx:71,116`); for a rank-less vertical with two "Soprano 1" seats this renders "Soprano 1, 2".
- API fallbacks `organizationName || 'Orchestra'` (`send-music/route.ts:193`, `send-music-reminder/route.ts:169`, `send-gig-details-reminder/route.ts:164`, `cron/offer-reminders/route.ts:144`, `offers/send-reminder/route.ts:112`) and `|| 'Instrument'` (`gig/[token]/page.tsx:231`, `cron/offer-reminders/route.ts:147,187`, `cron/expire-offers/route.ts:159`, `pre-gig-reminders/[reminderId]/route.ts:136`).

**Leaks a non-music org sees immediately**
- `src/components/projects/add-position-dialog.tsx:35-100,404-409` — "Ensemble Presets" (Solo, Duo, String Trio, String Quartet, …) rendered for **every** vertical (no gate).
- `src/components/books/book-form-dialog.tsx:31-94,340` — `ENSEMBLE_PRESETS` (String Quartet, Piano Quartet, Jazz Quartet…) ungated.
- `src/components/musicians/musician-form-dialog.tsx:552`, `bulk-edit-dialog.tsx:377` — "Can Lead (Violin 1)".
- `src/components/projects/service-form-dialog.tsx:134-346,638-641` — "Leader Fee ($)" defaulting to 50, ungated.
- `src/app/musician-policy/page.tsx:6-28` DEFAULT_POLICY (orchestra prose, "personnel manager", "music and equipment").
- `src/components/gig/sub-request-form.tsx:157` "Instrument *"; `gig-page-client.tsx:185` "Ensemble".
- `src/lib/tooltips.ts:4` "Positions like Violin 1…".

### 1.4 Configuration-before-branching patterns already in the code
1. **Vertical features** (`src/lib/verticals/features.ts`) — "does this concept exist for this kind of org" (see 1.1; under-consumed).
2. **Plan gates** (`src/lib/plan.ts`, 148 lines) — `resolveOrgPlan()` → `{tier,status}`; `PLAN_LIMITS` (musicians, activeProjects, adminSeats); `canAddMusician`, `canCreateProject`, `canAddMember`, `canUseEmailFeatures`, `canBulkImport`, `canUseSavedEnsembles`, `canUseSubstitutions`, `canExport`. Mirrored in SQL by `org_plan_tier()`, `org_plan_limit()`, `enforce_musician_limit`, `enforce_project_limit` triggers with the `app_settings.billing_enforced` master switch (`080_enforce_plan_limits.sql`). Pattern: pure TS predicate + DB trigger for client-side writes. Tier names are music-themed: `ensemble | orchestra | symphony` (CHECK in `066_billing_tiers.sql:27-28`, Stripe price env vars).
3. **Org feature flags as columns**: `intake_enabled` (073; gates the whole music library via `requireIntakeEnabled` in `src/lib/api-helpers.ts:92-115` and the sidebar), `library_org_id` (075; shared library), `disable_staffing_alerts` (056), `is_comped` (066). Protected by `protect_privileged_org_columns` (081). This is the precedent for "module on/off per org".
4. **Plain-module rule sets**: `src/lib/payments/compute.ts` (single pay rule shared by Generate Payments and the after-gig summary), `src/lib/schedule-conflict.ts` (single conflict answer), `src/lib/after-gig/rules.ts` (pure rules, no DB). All are easily parameterized.

### 1.5 Reusable domain machinery (beyond labels)

**Requirement templates — `staffing_presets` and `books`**
- `staffing_presets` (`014_add_staffing_presets.sql`): `{organization_id, name, description, category, positions JSONB [{instrument_name, chair_number}]}`. Created via `src/components/projects/save-preset-dialog.tsx`, applied in `add-position-dialog.tsx:129,275`. It *is* a reusable "requirement template" — but keyed by instrument **name** (resolved at apply time), with no quantity, no rate, no service/call targeting.
- `books` + `book_entries` (`001:62-84`, 036 nullable musician, 071/088 for intake covers): `book_entries(book_id, musician_id?, instrument_id, chair_number, priority, notes)`. A book is simultaneously a requirement template (instrument/chair rows) and a preferred-people list with per-skill priority. `projects.book_id` links a project to its source book; `src/components/projects/import-from-book-dialog.tsx` imports positions + people. Generalizes to "crew list / lineup" (and the templates already relabel it). Naming collision: the music library also uses "book" for a PDF music book (`intakes.book_cover_path`, `src/components/intake/book-download.tsx`).

**Message templates & branding**
- `reminder_templates` (054): `{organization_id, name, content}` free-text snippets, CRUD at `src/app/api/reminder-templates/**`, used only by `src/components/projects/approve-reminder-dialog.tsx:106-164` for the pre-event reminder. Generic.
- Email branding: `organizations.email_logo_url`, `email_brand_color`, `email_footer_text` (015), `settings/email-branding-section.tsx`, `email-preview.tsx`, `EmailBranding` passed into every template via `email-layout.tsx`/`podium-footer.tsx`. Generic. The branch adds a per-vertical *product* brand (`brand.ts`, "Overhire").
- `email_logs` (038, body in 055): org-scoped log of every send with `email_type`, `musician_id`, `project_id`, `offer_id`, `resend_email_id`, `status`, `metadata`. Displayed at `/dashboard/emails`. This is the closest thing to a communication audit trail.
- `organizations.musician_policy` (010) + `/musician-policy` page — an org-authored worker policy.

**Communication preferences / deliverability**
- `musician_notification_preferences` (016): `email_new_offers`, `email_offer_reminders`, `email_schedule_changes`, `email_payment_updates`. **Dead**: referenced only in `src/types/database.ts`; no code reads or writes it. Email-only booleans.
- `musicians.email_status` (`ok|bounced|complained`) + `email_status_at` (087), written by `src/app/api/webhooks/resend/route.ts`, shown in `musicians-client.tsx`. Live, reusable per-channel deliverability state (single channel).

**Availability / conflicts**
- `competing_schedules` (`001:156-166`): `{musician_id, title, start_time, end_time, notes}` — admin-entered blackout blocks. CRUD UI `src/components/schedules/*` at `/dashboard/schedules` — **orphaned: no nav item or link reaches it** (`rg "/dashboard/schedules"` finds nothing outside the page). Also read in `dashboard/projects/page.tsx:119`, `project-positions.tsx:147,592`, `assign-musician-dialog.tsx`, `send-offer-dialog.tsx`.
- `src/lib/schedule-conflict.ts` (208 lines): `overlaps`, `serviceWindow` (3-hour assumed duration), `findConflicts(musicians, services, excludeProjectId)` combining external blocks and active offers on other projects; `describeConflicts`. Consumed by `src/lib/next-candidate.ts` and send-offer. Reusable as the conflict engine; its project-level unit is a constraint (see Part 2).

**Document distribution with visibility + receipts**
- `project_files` (041): `{project_id, file_name, storage_path, mime_type, scope 'all'|'assigned', uploaded_by, notes}`; `project_file_instruments(file_id, instrument_id)` = the visibility list; `project_file_downloads(file_id, musician_id, downloaded_at)` = per-file receipts.
- `music_sends` / `music_confirmations` (041): a send batch + per-person token & `confirmed_at`.
- `gig_detail_sends` / `gig_detail_confirmations` (039): same shape for logistics.
- Visibility rule today: **per instrument only** — `scope='assigned'` and the person's confirmed position's `instrument_id` ∈ `project_file_instruments` (`src/app/api/projects/[projectId]/send-music/route.ts:170-180`, `src/app/api/music-download/[fileId]/route.ts:58-80`). No per-position, per-role-group, per-service or per-person rule. The download route uses `.limit(1)` on the person's confirmed positions, so a person holding two instruments is checked against an arbitrary one.
- Logic: `src/lib/music/confirm-receipt.ts`, `src/lib/send-gig-details.ts`, `/confirm-music/[token]`, `/confirm-details/[token]`. The term layer already calls it `materials`. Strong reuse candidate for "call sheets / show docs with read receipts".

**Post-event flow — after-gig (089, 090, `src/lib/after-gig/`)**
- `projects.pay_summary_sent_at`; `gig_reports(project_id, musician_id, token, opened_at, submitted_at, overall great|good|issues, all_on_time, late_notes, hiccups, client_follow_up, arrangement_notes, other_notes)` UNIQUE(project_id, musician_id); `projects.gig_lead_musician_id`.
- `rules.ts`: `gigEndedAt` (latest service end), `isAfterGigDue` (30 min after, 48 h lookback), `gigLead()` (chosen → **Violin 1 fallback** via `isViolinOne` regex → needs-pick), `buildPaySummary()`.
- `run.ts` + cron `/api/cron/after-gig` (every 15 min, `vercel.json`); emails `pay-summary`, `gig-report-request`, `gig-report-submitted`; page `/report/[token]`, `src/components/gig/gig-report-client.tsx`; admin panel `src/components/projects/gig-report-panel.tsx`; routes `api/projects/[projectId]/gig-report`, `gig-lead`.
- Reusable skeleton: "after the last session ends, summarize pay to admins and ask one lead for a report". Music-specific bits: Violin-1 fallback, `arrangement_notes` question, the copy.

**Other generic spine pieces worth naming as reusable** (the v2-strategy "generic spine"): offers with token accept/decline/expiry/reminders/rescind/release (`contract_offers`, `src/lib/offers/respond.ts`, 4 offer crons), substitution workflow (`substitution_requests` with suggested-sub fields, 012), call-order ranking (`src/lib/next-candidate.ts`), payments + W-9 upload tokens + 1099 export (`payments`, 078, `/dashboard/payments/1099`), venues with maps/parking (003, 057-060, `src/lib/venue-*.ts`), timezone-aware crons (`src/lib/cron.ts`), contract paste parser (`src/lib/projects/contract-parser.ts` — music/wedding-specific), bulk import (`src/lib/import/parse-musicians.ts`, already accepts "member/player/person" headers), duplicate detection (`src/lib/musicians/duplicates.ts`), impersonation log (028).

### 1.6 Prior architectural intent (strategy docs)

**`tasks/v2-strategy.md` (2026-07-11)** decided:
- "Expand, don't pivot — but expand on a re-architected core." Podium = "an offer-based crewing system for skilled 1099 contractors staffed onto dated events".
- Explicit split: **generic spine** (orgs, roster, projects→services, positions, offers, subs, payments/W-9/1099, files/gig-details with confirmations, email log, worker portal, RLS) vs **music overlay** (`instruments`/sections, `chair_number`, `leader_fee`, `orchestra-positions.ts`, `ensemble-detection.ts`, 64-instrument seed).
- Architecture: (1) configurable role taxonomy, "`chair_number` generalizes to `rank`. Same tables, configurable seed + labels"; (2) pluggable title/formation rules; (3) "keep the generic spine untouched — it's already right." → Items 1-2 were built as `src/lib/verticals`. Item 3 is where this audit disagrees: the spine's project-level positions are the main obstacle for crews.
- Feature roadmap that maps to the gap list: call-order engine v2 with **auditable hiring ledger**, **SMS (Twilio)**, **availability-first polling**, union pay modeling (per-service scales, doubling/principal premiums, pension %), **season/production layer**, per-chair approved-sub lists.
- Phase 3: AV/production crew as a second brand on the same engine — "a template + marketing-site exercise, not a rewrite" (the branch's research later corrected this: per-call headcounts are a real model change).

**`podium_personnel_strategy.md`** (earlier plan): pricing tiers Ensemble/Orchestra/Symphony (now in `plan.ts`); Priority 3 proposes **Owner / Admin / Manager / Member** roles with invitations (only owner/admin/member exist; `member` is unused in RLS); medium-term ideas incl. repertoire integration (built as the library), doubling tracking, union compliance, communication hub.

**`tasks/launch-assessment-2026-09-18.md` §C** lists the terminology leaks above, notes "No AV/production-crew vertical on master (only on the unmerged overhire branch)", "No certifications with expiry, no availability polling, no rotation call order", "No SMS anywhere".

**Branch `origin/overhire-demo-skin`** (cloned to scratchpad; 27 files, +1150/−55 vs `52dd320`): `production_crew` template + seed, `VerticalBrand`/`brand.ts`, brand in header/logo/emails/gig page, "three-call show" quick-start (Load-in / Show Day / Strike services, **no positions**), `scripts/seed-crew-demo.js`, `src/lib/__tests__/production-crew.test.ts`, `tasks/fork-concept-crew.md`. Two cautions: its migration file `supabase/migrations/084_add_production_crew_vertical.sql` collides with master's `084_drop_membership_self_insert.sql`; and it inserts `service_type` values `'load_in'`/`'strike'`, which are not in `SERVICE_TYPES` (`src/lib/validations/projects.ts:6`), so editing those services in the service form would fail zod validation (the DB has no CHECK on `service_type`, so the insert itself succeeds).

---

## PART 2 — Hard-coded assumptions

Categories: **T** = terminology only (TermDictionary fixes it) · **C** = configurable behavior (feature flag / vertical feature, no schema change) · **D** = real domain constraint (needs model change) · **M** = migration risk (changing it endangers existing quartet data/behavior). Each finding gets exactly one category — the dominant one.

Raw scale for context (non-test `src/`): `musician` 3,075 occurrences in 164 files; `instrument` 1,862 in 122; `project_position` 249 in 47; `chair_number` 140 in 40; `leader` 364 in 38; `is_leader` 140 in 27; `leader_fee` 80 in 21; `musician_instruments` 56 in 22; `ensemble_type` 26 in 13; "Violin 1"/`isViolinOne` 58 in 24 (most in the music library).

### 2.1 Schema

| # | Location | Assumption | Cat |
|---|---|---|---|
| S1 | `project_positions(project_id, instrument_id, chair_number, musician_id, status)` — `001:114-124` | **A position belongs to the project, not to a service.** One person fills it for every service of the project. No `service_id`, no quantity. | **D** |
| S2 | `project_positions.musician_id` single FK; `status vacant/offered/confirmed/declined` | One position = one person (headcount 1). "8 hands at load-in" = 8 rows created by hand. | **D** |
| S3 | `project_positions.chair_number integer NOT NULL` — `001:118` | Every position has an ordinal; used for uniqueness-in-practice, titles, sorting, "leaders first for chair 1". Non-chair verticals still store 1..N. | **M** (rename would touch 140 code sites + all quartet rows; keep column, relabel as rank) |
| S4 | `contract_offers.project_position_id` — `001:127-140`; `custom_pay` (005) | The offer is for the whole position (all services); `custom_pay` is a **per-service** amount multiplied across every service (`payments/compute.ts`). | **D** |
| S5 | `substitution_requests.service_id` nullable — `001:143-154` | Schema anticipated per-service subs, but approval replaces the musician on the whole position (`src/lib/offers/respond.ts:76-110`, `claimChairForAccept`). | **D** |
| S6 | `services.leader_fee DECIMAL DEFAULT 50.00` — `005_pay_system.sql:3` | Every service carries a $50 leader premium by default. | **M** (existing rows have 50; changing default is safe, changing semantics is not) |
| S7 | `musicians.is_leader BOOLEAN` — `004:5` | "Can lead" is a global person flag, not per-skill/per-position; drives pay and candidate sort. | **D** |
| S8 | `payments(service_id NOT NULL, musician_id, project_position_id, is_leader_fee)`, unique `(service_id, musician_id, is_leader_fee) WHERE payment_type='standard'` — `013`, `027` | Pay is per service × person; the leader premium is a boolean flag rather than a line type; one standard payment per person per service (a person in two positions on the same service gets one). | **D** |
| S9 | `musicians.call_order INTEGER DEFAULT 100` — `004:4` | One global call order per person across all skills. Per-skill priority lives only in `book_entries.priority`. | **D** |
| S10 | `musician_instruments(proficiency text DEFAULT 'professional')` — `001:51-60` | Skill link with an unused proficiency string; no default rate, no level enum, no certification. | **C** (column exists; becomes useful with an enum/rate) |
| S11 | `instruments.section text` (no CHECK) — `001:25-35` | Grouping is music sections, but only zod enforces it (`INSTRUMENT_SECTIONS`). | **C** |
| S12 | `instruments` table name / `musicians` table name / `books` | DB nouns. Templates intentionally keep them ("The database keeps its original nouns" — `types.ts:4-11`). | **M** (rename = every query, RLS policy, RPC, type file; no user value) |
| S13 | `projects.ensemble_type TEXT` — `037` | Free-text formation label ("String Quartet") read by gig-details email, pre-gig cron, intake matcher, drift banner. | **C** |
| S14 | `projects.gig_lead_musician_id` — `090`; `gig_reports UNIQUE(project_id, musician_id)` — `089` | Exactly one lead per project (not per call/department). | **D** (mild; per-call leads need a new column/table) |
| S15 | `music_sends`, `music_confirmations`, `project_file_instruments` — `041` | Distribution scoped per instrument; send batches per project. | **D** for per-role/per-call visibility; names are **T** |
| S16 | `gig_detail_sends/confirmations` — `039` | Logistics sent per project to all confirmed people. | **D** (per-call call sheets) |
| S17 | `pre_gig_reminders UNIQUE(project_id, trigger_date)` — `053` | Reminder is per project (2 days before first service). | **C** (rule) / **D** if per-call |
| S18 | `organizations.musician_policy` — `010` | Column name. | **T** |
| S19 | `organizations.plan_tier CHECK IN ('trial','free','ensemble','orchestra','symphony')` — `066:27` | Music-themed tier keys stored in DB and mapped to Stripe prices. | **M** (keep keys, relabel per brand) |
| S20 | `organizations.vertical CHECK` (065) | Closed list; each new vertical needs a migration. | **C** |
| S21 | `organization_members.role CHECK IN ('owner','admin','member')` — `001:18`; all RLS uses `is_org_admin` = owner/admin | Two effective permission levels. | **D** (see gap list) |
| S22 | `musician_notification_preferences` email-only booleans — `016:25-33` | Email is the only channel; table unused. | **C** |
| S23 | `musicians.email_status` (087) | Single-channel deliverability. | **C** |
| S24 | `competing_schedules(musician_id, title, start,end)` — `001:156` | Admin-entered blocks; no request/response, no "available" state. | **D** (availability requests need new tables) |
| S25 | `email_logs.musician_id`, `impersonation_log.musician_id`, `payments.musician_id` … ~25 FK columns named `musician_id` | DB noun. | **M** |
| S26 | Music-library tables `repertoire.ensemble CHECK (quartet,quintet,trio,duo,solo,viola-trio,other)`, `repertoire_parts.part CHECK (vln1,vln2,vla,vc,bass,voice,organ,other,score)`, `intake_songs.section CHECK (prelude,ceremony,recessional,…)`, `intakes.source DEFAULT '17hats'` — `068`, `069` | Wedding string-ensemble repertoire. | **C** (whole module behind `intake_enabled`) |
| S27 | `create_organization_with_owner` seeds 64 instruments only for music verticals — `067:59-61` | Already vertical-aware. | (reusable; no change) |
| S28 | RPCs `link_musician_records_to_user`, `activate_musician_by_token`, `get_musician_*`, `enforce_musician_limit` | DB nouns in function names. | **M** |

### 2.2 Validations / zod (`src/lib/validations/`)

| # | Location | Assumption | Cat |
|---|---|---|---|
| V1 | `instruments.ts:3-9` `INSTRUMENT_SECTIONS = strings/woodwinds/brass/percussion/other`; `SECTION_LABELS` 35-41 | Fixed music sections; 10 files group by them (instruments-client, musicians-client, call-order-dialog, add-position-dialog, project-positions, book-detail, intake-panel…). Non-music seeds all land in "Other". | **C** (per-vertical section list; DB has no CHECK) |
| V2 | `instruments.ts:43+` `STANDARD_INSTRUMENTS` (64) | Music seed list; used by prepopulate/add-missing buttons, gated by `isMusicVertical`. | **C** (already gated) |
| V3 | `instruments.ts:16` "Instrument name is required" | Message. | **T** |
| V4 | `projects.ts:6` `SERVICE_TYPES = rehearsal/performance/dress_rehearsal/sectional/other` + labels | Music session types; branch needs `load_in`, `strike`. | **C** (per-vertical list; DB has no CHECK) |
| V5 | `projects.ts:16-25` `EVENT_TYPES = Ceremony, Cocktail Hour, Reception, …` | Wedding-ensemble event types on the project form. | **C** |
| V6 | `projects.ts:160-166` `leader_fee … .default(50)` "Leader fee must be positive" | $50 leader premium default. | **C** |
| V7 | `projects.ts:46,120` "Project name is required", "Service name is required" | Messages. | **T** |
| V8 | `musicians.ts:125` `is_leader: z.boolean()`; zelle fields | Leader flag on person. | **D** (tied to S7) |
| V9 | `schedules.ts:4` "Musician is required" | Message. | **T** |
| V10 | `auth.ts:37` `vertical: z.enum(VERTICAL_KEYS)` | Already generic. | — |
| V11 | `settings.ts:23,29` member role `z.enum(['admin','member'])` | Two roles. | **D** (with S21) |

### 2.3 API routes (`src/app/api/`, 81 files, 1 uses terms)

| # | Location | Assumption | Cat |
|---|---|---|---|
| A1 | `payments/generate/route.ts:13-110` | For each confirmed position × **every** project service → one payment (`computeServicePay(service, musician.is_leader, offerPay)`). | **D** |
| A2 | `positions/[positionId]/{assign,unassign,rescind-offer}`, `offers/send-email`, `gig/[token]/{accept,decline,request-sub}` | Position-level lifecycle; accept "claims the chair" for all services (`src/lib/offers/respond.ts:76-110`). Error strings say "chair", "musician". | **D** (logic) — strings **T** |
| A3 | `substitutions/[requestId]/approve/route.ts:153-176` | Creates a new `musicians` row + `musician_instruments` for the suggested sub; replaces on whole position even if `service_id` set. | **D** |
| A4 | `projects/[projectId]/send-music/route.ts:170-180`, `music-download/[fileId]/route.ts:58-80`, `music-status`, `send-music-reminder` | Per-instrument file visibility; one confirmed position assumed per person (`.limit(1)`). | **D** |
| A5 | `projects/[projectId]/send-gig-details*`, `src/lib/send-gig-details.ts:39,226` | Sends all services + full roster ("Your Ensemble") to every confirmed person; `ensemble_type` line. | **D** (per-call sheets) / copy **T** |
| A6 | `organizationName || 'Orchestra'` ×5, `|| 'Instrument'` ×5 (listed in 1.3) | Fallback labels. | **T** |
| A7 | `payments/export/route.ts:130-181` | CSV columns "Instrument", payment type "Leader Fee"/"Service Pay", "Project", "Service", "Service Type". | **T** |
| A8 | `projects/[projectId]/gig-lead`, `gig-report` | One lead per project. | **D** (mild, S14) |
| A9 | `organization/seed-skills/route.ts` | Already vertical-aware. | — |
| A10 | `intake/**`, `library/**`, `repertoire/**`, `spotify/**`, `music-download` | Music library (see 2.8). | **C** |
| A11 | `settings/members` | owner/admin/member only. | **D** (S21) |
| A12 | `offers/preview-email`, `pre-gig-reminders/[reminderId]` | Read `ensemble_type`, render instrument/chair. | **T** |

### 2.4 Crons (`vercel.json`, `src/app/api/cron/*`)

| # | Cron | Assumption | Cat |
|---|---|---|---|
| CR1 | `after-gig` (every 15 min) → `src/lib/after-gig/rules.ts:83-125` | Lead fallback = confirmed **"Violin 1"** lowest chair (`isViolinOne` regex `^\s*violin\s*(1|i)\s*$`). Non-music orgs always land in `needs-pick` and get the pay summary text "nobody is confirmed in Violin 1". | **C** (make the fallback skill configurable per vertical / per org; null for non-music) |
| CR2 | `after-gig` → `buildPaySummary` (`rules.ts:140-162`) | Sums pay over **all** services for every confirmed position. | **D** (inherits S1) |
| CR3 | `after-gig` → `gigEndedAt` | Event ends at the last service; one summary per project. | **C** |
| CR4 | `pre-gig-reminders` (`route.ts:40-185`) | 2 days before the project's first service, one admin-approved reminder per project, sent to all confirmed. Emails admins only (launch assessment). | **C** |
| CR5 | `staffing-alerts` (`route.ts:100-171`) | Unfilled = project positions without confirmed person; labels by instrument + chair; `sendStaffingAlertEmail` without terms. | **T** (labels) — per-call staffing is **D** via S1 |
| CR6 | `offer-reminders`, `expire-offers` | Generic offer lifecycle; fallbacks 'Orchestra'/'Instrument'; admin emails rendered with default terms. | **T** |
| CR7 | `complete-projects` | Project completes the day after the last service (org TZ). | — generic |
| CR8 | `keepalive` | n/a | — |

### 2.5 Email templates (`src/lib/email/templates/`, 29 files)

| # | Location | Assumption | Cat |
|---|---|---|---|
| E1 | 8 send functions resolve terms with `organizationId=undefined` (`send.ts:425,488,608,817,852,923,1132,1173`) | Admin/cron emails always say Musician/Project/Instrument. | **T** (plumbing fix: pass organizationId) |
| E2 | Subjects `send.ts:216-1284` ("Call:", "Gig details:", "Sub Request:", "Gig report for", "Pay for", "How did … go?") | Music/gig jargon in every subject. | **T** (needs new term keys: gig, sub, call) |
| E3 | `contract-offer.tsx:112,220,230` | "Ensemble:", "tuning or essential cues", "music, stand, and water", purse rule. | **C** (move conduct copy to org/vertical-configurable policy text) |
| E4 | `gig-details.tsx:99,173,207` | "Ensemble", "Your Ensemble", "Ensemble roster". | **T** |
| E5 | `pay-summary.tsx:59-94` | "leader fee", "Violin 1", "gig lead". | **T** + depends on CR1 |
| E6 | `gig-report-request.tsx`, `gig-report-submitted.tsx` | "gig report", "leading", "arrangements". | **T** |
| E7 | 10 templates: `{instrument}, {term(rank)} {chairNumber}` when `totalChairs>1` (e.g. `contract-offer.tsx:71,116`, `offer-reminder.tsx:73`) | Renders "Soprano 1, 2" for rank-less verticals. | **C** (gate on `features.useChairs`) |
| E8 | `admin-welcome.tsx:66` "like Violin 1, Cello" | Example copy. | **T** |
| E9 | `music-uploaded.tsx`, `music-reminder.tsx` | Already use `materials` term. | — reusable |

### 2.6 Dashboard UI

**Projects / staffing (`src/components/projects/`, 22 files — the most term-converted area)**

| # | Location | Assumption | Cat |
|---|---|---|---|
| P1 | `project-form-dialog.tsx:55-130,612` quick-start templates (String Quartet Gig, String Trio, Duo, Solo, Orchestra) + contract-paste placeholder "Ensemble: String Quartet" | Music formations; gated by `features.useTitleInference`. | **C** (already gated; generalize as per-vertical templates — branch adds "three-call show") |
| P2 | `projects-client.tsx:528-600` template materialization writes services **and** positions **client-side** (`supabase.from('project_positions').insert`) | Business logic in the browser; positions created per project. | **M** (any change to position shape must update client-side writers too) |
| P3 | `add-position-dialog.tsx:35-100,404-409` `BUILTIN_PRESETS` "Ensemble Presets" | Ungated music presets for all verticals. | **C** |
| P4 | `add-position-dialog.tsx:146-160` next chair number per instrument | Rank auto-increment; adds one row at a time. | **D** (no quantity) |
| P5 | `project-positions.tsx:147,159,186,578-592,990,1041` | Position list is project-wide; conflict check against all services; literal "Chair" in `positionLabel` (159); titles via `titleRules`; ensemble-drift banner. | **D** (project-wide) / literal **T** |
| P6 | `service-form-dialog.tsx:134-346,638-641` | "Leader Fee ($)" default 50 for all verticals; `SERVICE_TYPES`. | **C** |
| P7 | `send-music-dialog.tsx`, `project-files-section.tsx` | Visibility picker by instrument. | **D** (per-role/per-call visibility) |
| P8 | `send-offer-dialog.tsx`, `assign-musician-dialog.tsx:312-510` | Offer covers all services; conflict = any competing block; `proficiency:'professional'` hard-set. | **D** |
| P9 | `gig-report-panel.tsx` (6 literals, 0 terms) | "Gig report", "gig lead", Violin 1. | **T** |
| P10 | `request-sub-dialog.tsx`, `sub-requests.tsx:30` (`position_chair`) | Position-level subs. | **D** |
| P11 | `save-preset-dialog.tsx:136` placeholder "Wedding Quartet, Full Symphony" | Copy. | **T** |
| P12 | `group-text-dialog.tsx:117-120` | "SMS" = `sms:` URL on admin's own phone. | **D** (no SMS channel) |
| P13 | `conflicts-summary.tsx`, `delete-*`, `service-type-dialog.tsx` | Term-converted. | — |

**Musicians (`src/components/musicians/`)**

| # | Location | Assumption | Cat |
|---|---|---|---|
| MU1 | `musician-form-dialog.tsx:552`, `bulk-edit-dialog.tsx:377` "Can Lead (Violin 1)" | Leader = Violin 1. | **T** (label) — semantics S7 **D** |
| MU2 | `call-order-dialog.tsx` grouped by `SECTION_LABELS` | Global call order per section. | **C** (sections) / S9 **D** |
| MU3 | `musicians-client.tsx` columns: instruments, proficiency, email_status, portal fields, W-9, Zelle | Mostly generic; sections music. | **C** |
| MU4 | `musician-form-dialog.tsx` fields: zip/service radius/home_region (generic), `is_leader`, `w9_on_file`, `zelle_*` | No credentials, no rates. | **D** (credentials/rates gap) |

**Instruments (`src/components/instruments/`)** — `instruments-client.tsx:51,110-184` gates prepopulate/add-missing on `isMusicVertical`, offers `SeedVerticalButton` otherwise; groups by `INSTRUMENT_SECTIONS` (V1, **C**); `instrument-form-dialog.tsx` section `<select>` from the music enum (**C**). Line 110 "in your orchestra" vs "organization" (handled).

**Books (`src/components/books/`)** — `book-form-dialog.tsx:31-94,340` `ENSEMBLE_PRESETS` ungated (**C**); `book-instrument-chairs.tsx:30,203,249` titles via `titleRules` (handled); `books-client.tsx:171` "No ensembles match" (**T**). Route `/dashboard/books` = saved ensembles (generic roster concept).

**Payments (`src/components/payments/`, `/dashboard/payments`, `/dashboard/payments/1099`)** — term-converted (16 calls, 0 literals); `payments-client.tsx` and `dashboard/payments/page.tsx` read `leader_fee`/`is_leader_fee` and `service_type` (**D** via S8); `tax-report-client.tsx:116-139` 1099 export is generic (W-9, address) — reusable as-is.

**Settings** — `organization-section.tsx` shows vertical read-only, `musician_policy`, staffing-alerts toggle; `members-section.tsx`/`change-role-dialog.tsx:28` admin⇄member only (**D**, S21); `email-branding-section.tsx`, `email-preview.tsx` generic; `billing-section.tsx` tier names Ensemble/Orchestra/Symphony (5 literals, **T** but stored keys **M**).

**Schedules (`src/components/schedules/`, `/dashboard/schedules`)** — CRUD for `competing_schedules` (admin enters a person's outside commitments). Term-converted. **Unreachable from navigation.** (**C**: add a nav id or fold into availability.)

**Venues (`src/components/venues/`)** — generic (maps URL, parking, access); 1 literal. Reusable as-is.

**Emails (`/dashboard/emails`, `src/components/emails/emails-client.tsx`)** — email log viewer; 4 literals ("musician", "gig" type labels) **T**.

**Dashboard home (`src/app/dashboard/page.tsx`)** — uses `getServerVertical` (8 term calls) + 7 literals; calendar `src/components/dashboard/dashboard-calendar.tsx` reads `service_type` (**C**).

### 2.7 Worker-facing ("musician portal")
There is **no authenticated portal app** (`src/app/musician` does not exist). Schema and RLS for one exist (`016_add_musician_portal.sql` columns `user_id`, `portal_invite_token`, `portal_enabled`, …; RLS in 033-035; RPCs `link_musician_records_to_user`, `activate_musician_by_token`, `get_musician_*`), and `podium_musician_portal_implementation.md` is a plan. The worker surface is token pages:

| # | Location | Assumption | Cat |
|---|---|---|---|
| W1 | `/gig/[token]` (`src/app/gig/[token]/page.tsx`, `src/components/gig/gig-page-client.tsx`) | Shows the whole project (all services), one instrument/chair, "Ensemble", "Musician Policy" link; fallback 'Instrument' (page:231). Only 1 term call in the page, 0 in the client component. | **T** (copy) / per-call offer **D** |
| W2 | `src/components/gig/sub-request-form.tsx:157` | "Instrument *" picker for suggested sub. | **T** |
| W3 | `/confirm-details/[token]`, `confirm-details-client.tsx:92-123` | "gig details", "Ensemble roster". | **T** |
| W4 | `/confirm-music/[token]` | Per-instrument file list. | **D** (S15) |
| W5 | `/report/[token]`, `gig-report-client.tsx:160` | "Do any arrangements need work? Songs or parts…" | **C** (question set per vertical) |
| W6 | `/w9/[token]` | Generic. | — |
| W7 | `/musician-policy` (`page.tsx:6-28`) | Orchestra DEFAULT_POLICY; headings already term-driven (3 calls). | **C** (default policy per vertical) |

### 2.8 Music-library subsystem (characterized as one block)
Purpose: wedding string-ensemble repertoire management — match a client's song list to owned arrangements and build a printable "book" of parts per player.

- Tables: `repertoire` (ensemble CHECK quartet…), `repertoire_parts` (part CHECK vln1/vln2/vla/vc/…), `repertoire_part_versions` (079), `title_aliases`, `intakes` (17hats questionnaire, processional order, recessional cue), `intake_songs` (ceremony sections), `spotify_connections` (072), client song planner columns (082), `intake_books_approval` (071), `no_music` (083), `book_cover` (088), `organizations.library_org_id` (075) + `intake_enabled` (073).
- Code: `src/lib/intake/` (13 files, 5,364 lines), `src/lib/repertoire/` (153), `src/lib/spotify*.ts` (358), `src/components/intake/` (3,095), `src/components/library/library-client.tsx` (1,176), `src/app/api/{intake,library,repertoire,spotify}` (~2,776), `/dashboard/library`, plus ~15 repo scripts (`scripts/repertoire-*.js`, `library-*.js`, `update-library.js`, `Update Music Library.cmd/.command`). ≈ 13k lines.
- Gating: already a per-org module behind `intake_enabled` (privileged column, sidebar item outside NavConfig, `requireIntakeEnabled`). It does **not** consult the vertical, and no terms are used in it (0 of 7 component files).
- Coupling to the core: reads `projects.ensemble_type`, `project_positions`/instruments to pick parts per player, writes `project_files`/`music_sends`. The coupling direction is library → core, so the core can be generalized without touching it as long as `ensemble_type`, `instrument` names and `project_files` keep working.
- Category: **C** as a whole (keep as-is, music-only module). Several tests guard it (`library-*.test.ts`, `intake-*.test.ts`, `score-book.test.ts`, `spotify-ranking.test.ts`).

### 2.9 Reports / exports
- `src/app/api/payments/export/route.ts:120-181` — QuickBooks-style and detailed CSVs: "Instrument", "Leader Fee"/"Service Pay", "Project", "Service", "Service Type", W-9, Zelle (**T**; shape generic).
- `/dashboard/payments/1099` + `tax-report-client.tsx` — generic 1099 aggregation by person (reusable as-is).
- `pay-summary` email — see CR1/CR2/E5.
- No staffing/utilization reports exist.

### 2.10 Onboarding
- `src/components/auth/onboarding-form.tsx` — vertical picker (fully registry-driven); seeds skills post-RPC.
- `src/app/(auth)/onboarding/page.tsx`, `signup`, `login` — 0 music literals.
- `src/components/onboarding/setup-wizard.tsx:91` — "Violin 1, Cello, Trumpet" examples (**T**), otherwise term-driven; `contextual-tooltip.tsx` + `src/lib/tooltips.ts:4` "Violin 1" (**T**).
- `create_organization_with_owner` — vertical-aware seeding (reusable).

### 2.11 Shared libs not covered above

| # | Location | Assumption | Cat |
|---|---|---|---|
| L1 | `src/lib/orchestra-positions.ts` (204) | Concertmaster/Principal logic by instrument regex; chamber ≤ 8. | **C** (already behind `titleRules`) |
| L2 | `src/lib/ensemble-detection.ts` (94) | String Quartet/Piano Trio fingerprints by instrument name. | **C** (already behind `titleRules`) |
| L3 | `src/lib/next-candidate.ts:104-205` | Candidates = people with the instrument, ordered by global `call_order`; **"leaders first for chair 1"** (`is_leader` + chair 1). | **D** (per-skill ranking/rotation) |
| L4 | `src/lib/schedule-conflict.ts:29-122` | Another project conflicts if *any* of its services overlaps *any* of ours, for anyone with an active offer on it; 3-hour default duration. | **D** (inherits S1) |
| L5 | `src/lib/payments/compute.ts` | base = offer `custom_pay` ?? service `base_pay`; leader fee only for `is_leader` and only when base came from service. | **D** |
| L6 | `src/lib/projects/contract-parser.ts:24,220,354` | Parses wedding-quartet contracts → `'string-quartet'|'string-trio'|'duo'|'solo'`. | **C** (music-only import helper) |
| L7 | `src/lib/plan.ts` tiers `ensemble/orchestra/symphony`; `PLAN_LIMITS.musicians` | Music tier names; limit counted in "musicians". | **T** (labels) — keys **M** |
| L8 | `src/lib/import/parse-musicians.ts:13` | Header aliases incl. "member/player/person" — already generic-tolerant. | — |
| L9 | `src/lib/spotify-ranking.ts:43` "string quartet" penalty | Library. | **C** |

### 2.12 UI route structure (`src/app/dashboard`)

| Route | Nav id | Purpose | Music-only? |
|---|---|---|---|
| `/dashboard` | dashboard | home, calendar | no |
| `/dashboard/projects` | projects | projects + services + positions + offers + files + gig report (single client `projects-client.tsx`) | no (core) |
| `/dashboard/musicians` | musicians | roster | no (relabeled) |
| `/dashboard/instruments` | instruments | skill taxonomy | no (relabeled; sections music) |
| `/dashboard/books` | books | saved ensembles / rosters / crew lists | no (relabeled; hidden for event_agency) |
| `/dashboard/library` | *(outside NavConfig, `intake_enabled`)* | repertoire library | **yes** |
| `/dashboard/payments`, `/payments/1099` | payments | payments, 1099 | no |
| `/dashboard/schedules` | **none — orphaned** | competing schedules CRUD | no |
| `/dashboard/venues` | venues | venues | no |
| `/dashboard/settings` | (header) | org, members, branding, billing | no |
| `/dashboard/emails` | emails | sent-email log | no |
Public token routes: `/gig/[token]`, `/confirm-details/[token]`, `/confirm-music/[token]` (materials — music-named but generic mechanism), `/report/[token]`, `/w9/[token]`, `/musician-policy`.

### 2.13 Summary counts by category

| Area | T | C | D | M | total |
|---|---|---|---|---|---|
| Schema (S1-S28; S27 neutral) | 1 | 8 | 12 | 6 | 27 |
| Validations / zod (V1-V11; V10 neutral) | 3 | 5 | 2 | 0 | 10 |
| API routes (A1-A12; A9 neutral) | 3 | 1 | 7 | 0 | 11 |
| Crons (CR1-CR6) | 2 | 3 | 1 | 0 | 6 |
| Email templates (E1-E8) | 6 | 2 | 0 | 0 | 8 |
| Dashboard UI (P1-P12, MU1-MU4, instruments, books ×2, payments, settings ×2, schedules, emails, dashboard home) | 6 | 9 | 9 | 1 | 25 |
| Worker token pages (W1-W7; W6 neutral) | 3 | 2 | 1 | 0 | 6 |
| Music-library subsystem (one block) | 0 | 1 | 0 | 0 | 1 |
| Reports / exports | 1 | 0 | 0 | 0 | 1 |
| Onboarding | 2 | 0 | 0 | 0 | 2 |
| Shared libs (L1-L9; L8 neutral) | 1 | 4 | 3 | 0 | 8 |
| **Total** | **28** | **35** | **35** | **7** | **105** |

(Counts are per finding as listed above, one category each; where a row's text names a secondary category it is counted under its primary. The ~617 raw literal occurrences in 1.3 are rolled into the T rows rather than counted individually.)

### 2.14 Top 15 that actually matter for the rearchitecture

| # | Finding | Why it matters | Recommended treatment |
|---|---|---|---|
| 1 | **S1 Positions are project-level; everyone works every service** (`project_positions.project_id`, `001:114`) | Crews need different headcounts per call (load-in 8 hands, show 3 ops, strike 8). Breaks pay, conflicts, offers, call sheets, after-gig. | **Introduce alongside**: a `position_services` (requirement ↔ subset of services) join table where *no rows = all services* (today's semantics, zero migration of quartet data). Every reader that iterates `project.services` for a position switches to `servicesFor(position)` helper. |
| 2 | **S2 No quantity** (one row = one person) | "4 × Stagehand" must be 4 rows; the cascade is per row. | **New table alongside**: `requirements(project_id, skill_id, quantity, rate, service scope)` that *generates* N `project_positions` rows (positions stay the unit of offer). Quartet = quantity 1 each, identical rows. |
| 3 | **A1/L5/S8 Pay = position × every service** (`payments/generate/route.ts:95`, `compute.ts`) | Wrong pay as soon as #1 lands; `custom_pay` is per-service implicitly. | Route through the `servicesFor(position)` helper; add optional `rate_unit` (per call/per hour/per day/flat) on the offer/requirement defaulting to today's per-service. Keep `computeServicePay` as the single rule. |
| 4 | **S5/A3/L-respond Subs replace the whole position** although `substitution_requests.service_id` exists | Partial-call coverage is common for crews and orchestras alike. | Keep as-is for v1; when #1 lands, an approved per-service sub creates a child position scoped to that service. The column is already there. |
| 5 | **L4 Conflicts are project-wide** (`schedule-conflict.ts:66-122`) | A tech on the morning load-in of show A appears double-booked against the evening of show B. | Compute windows from the person's *own* positions' services (via #1 helper). Pure function, well tested (`schedule-conflict.test.ts`) — low risk. |
| 6 | **S7/V8/L3 `is_leader` is a global person flag** and drives pay and candidate ordering ("leaders first for chair 1") | Crews have per-role leads (A1 is lead audio, crew chief); leadership is per position. | Keep the column for music (behind `useTitleInference`/a new `useLeaderFee` flag); add `project_positions.is_lead` / requirement-level premium for others. |
| 7 | **S6/V6/P6 `leader_fee` DEFAULT 50 on every service, ungated** | A non-music org with any `is_leader` person silently pays +$50/service. | **Vertical flag now** (`features.useLeaderFee`; hide field and default to null for non-music). Leave existing data untouched. |
| 8 | **CR1 After-gig lead falls back to "Violin 1"** (`after-gig/rules.ts:83-125`) and S14 one lead per project | Non-music orgs always hit "needs-pick" with Violin-1 copy. | Make the fallback a vertical config (`leadFallbackSkill: 'Violin 1' | null`); keep music identical (identity test). Per-call leads later. |
| 9 | **S15/A4/W4 Document visibility only per instrument; `.limit(1)` person→position** | Call sheets/stage plots go to departments, calls, or individuals. | **Extend alongside**: add `project_file_targets(file_id, kind: skill|position|service|person, ref_id)`; `scope='assigned'` + `project_file_instruments` remains the music path. Fix the `.limit(1)` to "any confirmed position". |
| 10 | **S21/V11 Roles = owner/admin/member; `member` unused by RLS** | Event agencies need coordinators/crew chiefs with limited rights. | New `role` values or a `member_permissions` table; `is_org_admin` remains the admin gate; add `has_org_permission(org, perm)`. |
| 11 | **S9/L3 Global `call_order`** (per person, not per skill) | A person can be first-call A1 and fifth-call hand. | Introduce per-skill priority (generalize `book_entries.priority` or add `musician_instruments.call_order`); keep global value as fallback. |
| 12 | **S10 No worker-skill attributes** (proficiency unused, no default rate, no credentials) | Crews price by role and gate by certification. | Add columns to `musician_instruments` (`default_rate`, `level`) + a `credentials` table (see gap list). No impact on quartet rows. |
| 13 | **P2 Position/service templates are written client-side** (`projects-client.tsx:528-600`) plus RLS-direct writes for musicians/projects/services (`080` header) | Any shape change to positions needs every client writer updated; no server choke-point to enforce new invariants. | Before #1/#2, move "create project from template" and "add positions" behind an API route/RPC. |
| 14 | **S12/S25/S28 DB nouns (`musicians`, `instruments`, `musician_id` × ~25 FKs, RPC names)** | Tempting to rename; enormous blast radius on the live quartet product. | **Do not rename.** Keep the term layer as the outward mapping (the module's stated design, `types.ts:4-11`). Optionally add DB views with generic names for new code. |
| 15 | **V1/V4/V5 Fixed enums: `INSTRUMENT_SECTIONS`, `SERVICE_TYPES`, `EVENT_TYPES`** (zod only; DB has no CHECK) | Non-music seeds collapse into "Other"; crews need load-in/strike (branch already writes them and would fail zod on edit). | **Vertical config**: `sections`, `sessionTypes`, `eventTypes` on `VerticalTemplate`; music values unchanged. No migration needed. |

Honorable mentions (terminology, cheap, high visibility): E1 (8 emails ignore org terms — pass `organizationId`), P3/books presets ungated, contract-offer conduct copy (E3), DEFAULT_POLICY (W7), new term keys for gig/sub/call/lead, the orphaned schedules route, migration-number collision on the branch.

---

## PART 3 — Gap list: target concepts with no counterpart today

| Target concept | Nearest existing thing | What's missing |
|---|---|---|
| **Call-scoped requirements** (requirement ↔ subset of services) | `project_positions` (project-wide); `substitution_requests.service_id` (stored, not honored); `services` with `call_time`, `service_type`; branch's "three-call show" creates services but leaves positions to be built by hand | A join (`position_services` / `requirement_services`) with "empty = all" default; a `servicesFor(position)` helper adopted by pay (`payments/generate`, `after-gig/rules.ts`), conflicts (`schedule-conflict.ts`), offers/emails (service lists), gig-details, staffing alerts, calendar. UI to pick calls per position. |
| **Quantity > 1 requirements** | `staffing_presets.positions` JSONB and `book_entries` rows (one per chair); "next chair number" in `add-position-dialog.tsx:146` | A requirement entity with `quantity` (and rate, call scope) that materializes N positions; "fill 4 of 4" progress; cascade that offers the next candidate per open slot. |
| **Credentials** (certs with expiry: forklift, OSHA 10, rigging, PAT) | `musicians.tags text[]` (002); W-9 fields (`w9_on_file`, `w9_verified_at/by`, `w9_file_url`, upload tokens 078) as the one "document with verification" | `credentials(person_id, type, issued_at, expires_at, file, verified_by)`; requirement-level `required_credentials`; candidate filtering/warnings; expiry cron (pattern exists in `src/app/api/cron/*` + `cron.ts`). The W-9 upload-token flow is a template for credential upload. |
| **Availability requests** (ask N people for dates; collect yes/no/maybe) | `competing_schedules` (admin-entered blocks, orphaned UI) + `schedule-conflict.ts`; token-response pattern from `contract_offers`, `gig_detail_confirmations` | `availability_requests(org, window/services, message)` + `availability_responses(request_id, person_id, token, per-date answer)`; an email/SMS template; feeding responses into `findConflicts` / candidate ranking. v2-strategy lists this as feature 3. |
| **SMS channel** | `group-text-dialog.tsx:117-120` opens `sms:` on the admin's phone; `musicians.phone`; Resend email pipeline with safe mode (`send.ts`), `email_logs`, `email_status` | Provider (Twilio + 10DLC), per-person channel preference/consent (`musician_notification_preferences` is email-only and unused — repurpose or replace), message log (generalize `email_logs` → `message_logs` with `channel`), inbound reply handling (YES/NO), opt-out (STOP). |
| **Append-only audit event log** | Status-history-by-row on `contract_offers` (`released`/`rescinded` instead of deletes, `unassign-history.test.ts`), `email_logs`, `impersonation_log` (028), `payments.paid_by` (050), `w9_verified_by`, Stripe `stripe_events` idempotency (064) | A single `events(org_id, actor_user_id/person_id, entity_type, entity_id, action, payload jsonb, created_at)` with insert-only RLS; writers in the offer lifecycle (`src/lib/offers/respond.ts`, position routes, crons). v2-strategy's "auditable hiring ledger" is this. |
| **Worker roles with proficiency / default rate** | `musician_instruments(is_primary, proficiency 'professional')`; `services.base_pay`; `contract_offers.custom_pay`; `book_entries.priority` | `default_rate` (+ unit) and a real `level` on the person-skill link; skill-level default rate on `instruments`; rate resolution order (offer > requirement > person-skill > skill > service base). |
| **Organization permission roles beyond owner/admin** | `organization_members.role in ('owner','admin','member')` (`001:18`); `is_org_admin()` used by nearly every RLS write policy; `member` = read-only via `is_org_member` but `settings/members` only toggles admin⇄member (`change-role-dialog.tsx:28`); strategy doc proposed Manager | Role set (e.g. coordinator, crew chief, finance) or a permissions table; `has_org_permission()` SQL helper; UI gates (pattern: `PlanProvider`/`VerticalProvider`); seat counting in `PLAN_LIMITS.adminSeats`. |
| **Document visibility by role/call** | `project_files.scope 'all'|'assigned'` + `project_file_instruments` (per skill); `music_sends`/`music_confirmations` and `gig_detail_sends`/`confirmations` (per project); `project_file_downloads` receipts | Target table keyed by position / service / person / role-group; per-call send batches; read receipts per call (the receipt machinery itself is reusable). |
| *(also)* **Per-call / per-position lead** | `projects.gig_lead_musician_id`, `gig_reports UNIQUE(project_id, musician_id)` | Lead per service or per department; report per call. |
| *(also)* **Per-vertical session/section/event vocab** | `SERVICE_TYPES`, `INSTRUMENT_SECTIONS`, `EVENT_TYPES` constants | Fields on `VerticalTemplate` (no migration; DB has no CHECKs). |
| *(also)* **Authenticated worker portal** | Schema + RLS + RPCs (016, 033-035) and token pages | App routes; the token pages are the de-facto portal today. |

---

## PART 4 — Reuse map ("what of this can we use that we already built")

| Target engine concept | Existing asset | Reuse verdict |
|---|---|---|
| Vertical / tenant type | `organizations.vertical`, `src/lib/verticals/*`, onboarding picker, seed RPC + seed route | **Use as-is**; add keys (AV crew, photo/video, staging, event agency already exists) and new config fields (sections, session types, event types, lead fallback, leader-fee flag, question sets, default policy). |
| Outward nouns | `TermDictionary`, `term()`, `useTerms()`, `getServerVertical()`, `resolveEmailTerms()` | **Use as-is**; add keys `gig`, `sub`, `offer`/`call`, `lead`, `section`, `position`; finish plumbing into API routes, token pages, the 8 admin emails. |
| Regression contract for the quartet product | `vertical-identity.test.ts`, `verticals-registry.test.ts`, `email-terminology.test.ts`, `nav-mapping.test.ts` | **Use as-is**; every new key/flag gets a frozen default value there. |
| Feature gating | `features.ts` predicates, `plan.ts` + SQL triggers, org flag columns (`intake_enabled`) + privileged-column trigger | **Use as-is**; start actually consuming `canUseChairs`/`canDetectEnsembles`; add `vertical` to the privileged-column trigger once it gates behavior. |
| Skill taxonomy | `instruments` + `musician_instruments` + seeds | **Use**; add per-vertical sections, `default_rate`, `level`. |
| Roster | `musicians` (contact, zip/radius/home_region, tags, W-9, Zelle, email_status, portal columns) | **Use**; add credentials table, per-skill call order. |
| Saved team / requirement template | `books`/`book_entries`, `staffing_presets` | **Use** `books` as crew lists; replace `staffing_presets` JSONB (name-keyed) with requirement templates once requirements exist. |
| Engagement / sessions | `projects`, `services` (call_time, two venues, base_pay) | **Use**; services already are "calls". |
| Positions + offers cascade | `project_positions`, `contract_offers`, `src/lib/offers/respond.ts`, `next-candidate.ts`, 4 offer crons | **Use**, but add service scoping and requirement/quantity (the one real model change). |
| Subs / drop-out coverage | `substitution_requests` (with `service_id`) | **Use**; honor `service_id` after call scoping. |
| Availability | `competing_schedules`, `schedule-conflict.ts`, orphaned `/dashboard/schedules` | **Use** the conflict engine; add availability requests/responses. |
| Documents + receipts | `project_files`, `project_file_instruments`, `project_file_downloads`, `music_sends/confirmations`, `gig_detail_sends/confirmations`, confirm token pages | **Use** the mechanism; add target table for position/service/person visibility. Already relabeled as `materials`. |
| Messaging | Resend pipeline (`send.ts`, safe mode, List-Unsubscribe), `email_logs`, branding, `reminder_templates`, Resend webhook → `email_status` | **Use** for email; generalize log + preferences for SMS. `musician_notification_preferences` is dead code — replace rather than reuse. |
| Post-event | `src/lib/after-gig/*`, `gig_reports`, cron, 3 emails, `/report/[token]` | **Use**; parameterize lead fallback and report questions per vertical. |
| Money | `payments`, `compute.ts`, export CSVs, 1099 page, W-9 upload tokens | **Use**; make pay iterate a position's own services; leader fee behind a flag. |
| Permissions | `is_org_admin`/`is_org_member`, owner/admin/member | **Extend** (new roles/permissions). |
| Second brand | branch `overhire-demo-skin` (`brand.ts`, production_crew template, three-call show, demo seed) | **Rebase onto master** (renumber migration 084 → 091+, add `load_in`/`strike` to session types). |
| Music library | repertoire/intake/spotify/library (~13k lines) behind `intake_enabled` | **Leave as a music-only module**; it depends on the core, not vice versa. |

### Suggested order of work implied by the findings
1. Terminology completion (no schema): new term keys; pass `organizationId` in the 8 admin sends; gate `BUILTIN_PRESETS`, `ENSEMBLE_PRESETS`, leader-fee field, "Can Lead (Violin 1)", contract-offer conduct copy, DEFAULT_POLICY; per-vertical sections/session types/event types; after-gig lead fallback per vertical. All guarded by the identity tests.
2. Server choke-point for position creation (move `projects-client.tsx:528-600` template writes and add-position writes behind an API/RPC).
3. Call scoping (`position_services`, empty = all) + `servicesFor(position)` adopted by pay, conflicts, emails, gig details, staffing alerts, after-gig.
4. Requirements with quantity materializing positions.
5. Availability requests, credentials, document targets, roles, SMS, event log — each additive tables alongside.

---

## Appendix — file index (most relevant)

- Vertical layer: `src/lib/verticals/{types,terms,registry,features,nav-routes,seeds,server,title-rules,index}.ts`, `src/lib/verticals/templates/*.ts`, `src/components/providers/vertical-provider.tsx`, `src/lib/api-helpers.ts:174-186`, `src/lib/email/send.ts:33-58`, `src/app/dashboard/layout.tsx:67-98`, `src/components/layout/sidebar.tsx`, `src/components/auth/onboarding-form.tsx`, `src/app/api/organization/seed-skills/route.ts`.
- Vertical tests: `src/lib/__tests__/{vertical-identity,verticals-registry,email-terminology,nav-mapping}.test.ts`.
- Migrations: `065_add_org_vertical.sql`, `067_vertical_seeding_rpc.sql`, `001_initial_schema.sql`, `005_pay_system.sql`, `013_add_payments.sql`, `014_add_staffing_presets.sql`, `016_add_musician_portal.sql`, `027_relax_payment_unique_constraint.sql`, `037_add_ensemble_type.sql`, `038_add_email_logs.sql`, `039_gig_detail_sends.sql`, `041_project_files.sql`, `053_pre_gig_reminders.sql`, `054_reminder_templates.sql`, `066_billing_tiers.sql`, `068_repertoire.sql`, `069_intakes.sql`, `073_intake_flag.sql`, `080_enforce_plan_limits.sql`, `081_protect_privileged_org_columns.sql`, `087_musician_email_status.sql`, `089_after_gig.sql`, `090_gig_lead.sql`.
- Music overlay logic: `src/lib/orchestra-positions.ts`, `src/lib/ensemble-detection.ts`, `src/lib/validations/instruments.ts`, `src/lib/after-gig/rules.ts`, `src/lib/payments/compute.ts`, `src/lib/next-candidate.ts`, `src/lib/schedule-conflict.ts`, `src/lib/offers/respond.ts`, `src/lib/projects/contract-parser.ts`.
- Strategy: `tasks/v2-strategy.md`, `podium_personnel_strategy.md`, `tasks/launch-assessment-2026-09-18.md` §C, branch `origin/overhire-demo-skin:tasks/fork-concept-crew.md`.
- Measurement script: `/tmp/claude-0/-home-user-podiumpersonnel/98e2eb42-5b64-5445-81b4-516719e6badd/scratchpad/count.py` (and `count2.py` for the gig/sub/call sweep); branch clone at `.../scratchpad/overhire`.
